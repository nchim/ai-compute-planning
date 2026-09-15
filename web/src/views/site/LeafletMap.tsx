import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";

import { useStore } from "../../bus";
import { LatencyClass, PowerType, type PowerSource, type Site } from "../../gen/capplanner/v1/engine_pb";
import { WATER_REGION_KM, latencyRadiusKm, latencyRings, powerSourcePlacement, ringBounds, type LatLng } from "./geo";
import { Explainer } from "./Explainer";
import { latencyLabel, type MapProvider, type Overlay } from "./mapProvider";

/**
 * Esri's key-free Light/Dark Gray Canvas raster basemaps (a Positron-like muted style), loaded
 * cross-origin by the browser. CARTO Positron was the first choice but its tiles now carry an
 * "API KEY REQUIRED" watermark for every keyless request (carto.com/basemaps/apikey, 2025).
 */
type Theme = "light" | "dark";
/** Esri splits the canvas into a `Base` (land, water, roads) and a `Reference` (place labels) service. */
const tileUrl = (theme: Theme, service: "Base" | "Reference") =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_${theme === "dark" ? "Dark" : "Light"}_Gray_${service}/MapServer/tile/{z}/{y}/{x}`;
const tileAttribution =
  'Tiles &copy; <a href="https://www.esri.com/">Esri</a> &mdash; Esri, HERE, Garmin, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
/** The Gray Canvas services stop at level 16 (city scale), which is ample for a ~60 km site region. */
const tileMaxZoom = 16;
const darkScheme = "(prefers-color-scheme: dark)";

// Palette from site.css: Leaflet draws SVG paths with inline styles, so the colours are passed in.
const colour = { site: "#334155", latency: "#5f8a84", water: "#4f83a8", grid: "#6b7a8f", btm: "#8a7f5f" };

const powerTypeLabel: Record<PowerType, string> = {
  [PowerType.POWER_UNSPECIFIED]: "unspecified",
  [PowerType.GRID]: "GRID",
  [PowerType.BTM_GAS]: "BTM gas",
  [PowerType.SOLAR_PPA]: "solar PPA",
  [PowerType.WIND_PPA]: "wind PPA",
  [PowerType.NUCLEAR_PPA]: "nuclear PPA",
  [PowerType.BESS]: "BESS",
};

const noSources: readonly PowerSource[] = [];
const fmtCoord = (n: number) => n.toFixed(2).replace("-", "−");
const fmtKm = (km: number) => `≈${km.toLocaleString("en-US")} km`;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** The current colour scheme; light when the environment has no `matchMedia` (jsdom). */
const colorScheme = (): MediaQueryList | null => (typeof window.matchMedia === "function" ? window.matchMedia(darkScheme) : null);

function latencyGroup(site: Site, at: LatLng): L.LayerGroup {
  const group = L.layerGroup();
  const rings = latencyRings(site.latencyTier);
  rings.forEach((ring, i) => {
    const outer = i === rings.length - 1;
    L.circle([at.lat, at.lng], {
      radius: ring.km * 1000,
      className: "ov-latency",
      color: colour.latency,
      weight: outer ? 2 : 1,
      ...(outer ? {} : { dashArray: "6 5" }),
      fill: false,
    })
      .bindTooltip(`${fmtKm(ring.km)} · ${latencyLabel[ring.tier]}`, { direction: "top" })
      .addTo(group);
  });
  return group;
}

function waterGroup(site: Site, at: LatLng): L.LayerGroup {
  const stress = clamp01(site.waterStressIndex);
  const group = L.layerGroup();
  L.circle([at.lat, at.lng], {
    radius: WATER_REGION_KM * 1000,
    className: "ov-water",
    color: colour.water,
    weight: 1,
    fillColor: colour.water,
    fillOpacity: 0.1 + stress * 0.5,
  })
    .bindTooltip(`water stress ${stress.toFixed(2)} (${WATER_REGION_KM} km region)`, { direction: "top" })
    .addTo(group);
  return group;
}

function powerGroup(sources: readonly PowerSource[], at: LatLng): L.LayerGroup {
  const group = L.layerGroup();
  sources.forEach((source, i) => {
    const { at: here } = powerSourcePlacement(at, i, source.type);
    const tone = source.type === PowerType.GRID ? colour.grid : colour.btm;
    const line: L.LatLngTuple[] = [
      [at.lat, at.lng],
      [here.lat, here.lng],
    ];
    L.polyline(line, { className: "ov-power", color: tone, weight: 2, dashArray: "6 5" }).addTo(group);
    L.circleMarker([here.lat, here.lng], { className: "ov-power", radius: 6, color: "#fff", weight: 1.5, fillColor: tone, fillOpacity: 1 })
      .bindTooltip(`${source.id} · ${powerTypeLabel[source.type]} ${source.capacityMw} MW · location illustrative`, {
        permanent: true,
        direction: "right",
        className: "map-label",
      })
      .addTo(group);
  });
  return group;
}

/** Leaflet map of the site; the instance lives in a ref and is destroyed on unmount. */
function LeafletMap(props: { site: Site; active: ReadonlySet<Overlay> }) {
  const { site, active } = props;
  const { state, store } = useStore();
  const siteName = state.plan?.meta?.siteName ?? state.plan?.meta?.planId ?? "site";
  const sources = state.plan?.power?.sources ?? noSources;
  const lat = site.location?.lat;
  const lng = site.location?.lng;

  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.CircleMarker | null>(null);
  const groups = useRef(new Map<Overlay, L.LayerGroup>());
  const fitted = useRef<L.LatLngBoundsExpression | null>(null);
  const [tilesFailed, setTilesFailed] = useState(false);

  /** Leaflet caches the container size; after any layout change it must be told before a fit is right. */
  const fit = (m: L.Map, bounds: L.LatLngBoundsExpression) => {
    fitted.current = bounds;
    m.invalidateSize();
    m.fitBounds(bounds, { padding: [12, 12] });
  };

  // Map, basemap, scale bar: once per mount. A tile failure switches on the notice; the vector overlays stay.
  useEffect(() => {
    if (container.current === null) return;
    const overlayGroups = groups.current;
    const m = L.map(container.current, { zoomControl: true, attributionControl: true });
    const scheme = colorScheme();
    const theme: Theme = scheme?.matches ? "dark" : "light";
    const base = L.tileLayer(tileUrl(theme, "Base"), { attribution: tileAttribution, maxZoom: tileMaxZoom })
      .on("tileerror", () => setTilesFailed(true))
      .addTo(m);
    const labels = L.tileLayer(tileUrl(theme, "Reference"), { maxZoom: tileMaxZoom, pane: "shadowPane" }).addTo(m);
    L.control.scale({ imperial: false }).addTo(m);
    const onScheme = (e: MediaQueryListEvent) => {
      base.setUrl(tileUrl(e.matches ? "dark" : "light", "Base"));
      labels.setUrl(tileUrl(e.matches ? "dark" : "light", "Reference"));
    };
    scheme?.addEventListener("change", onScheme);
    map.current = m;
    return () => {
      scheme?.removeEventListener("change", onScheme);
      m.remove();
      map.current = null;
      marker.current = null;
      overlayGroups.clear();
    };
  }, []);

  // The site marker (in the marker pane, so it stays above the overlays) and the view, fit to the serving ring.
  useEffect(() => {
    const m = map.current;
    if (m === null || lat === undefined || lng === undefined) return;
    if (marker.current !== null) m.removeLayer(marker.current);
    marker.current = L.circleMarker([lat, lng], { className: "site-marker", pane: "markerPane", radius: 8, color: "#fff", weight: 2, fillColor: colour.site, fillOpacity: 1 })
      .bindPopup(`<b>${escapeHtml(siteName)}</b><br>${escapeHtml(site.market)} · ${escapeHtml(site.iso)}<br>${fmtCoord(lat)}, ${fmtCoord(lng)}`)
      .on("click", () => store.dispatch({ type: "select", selection: { ...store.getState().selection, tab: "site", path: "site", phaseId: null } }))
      .addTo(m);
    const fitKm = latencyRadiusKm[site.latencyTier] || latencyRadiusKm[LatencyClass.INFERENCE_METRO];
    fit(m, ringBounds({ lat, lng }, fitKm));
  }, [lat, lng, site.latencyTier, site.market, site.iso, siteName, store]);

  // The canvas reflows when the rail is resized or a fixture changes the layout: refit to the same bounds.
  useEffect(() => {
    const el = container.current;
    if (el === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const m = map.current;
      if (m !== null && fitted.current !== null) fit(m, fitted.current);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Overlays: one layer group each, added or removed as the toggles change.
  useEffect(() => {
    const m = map.current;
    if (m === null || lat === undefined || lng === undefined) return;
    const at = { lat, lng };
    const build: Record<Overlay, () => L.LayerGroup> = {
      latency: () => latencyGroup(site, at),
      water: () => waterGroup(site, at),
      power: () => powerGroup(sources, at),
    };
    for (const overlay of Object.keys(build) as Overlay[]) {
      const current = groups.current.get(overlay);
      if (current !== undefined) m.removeLayer(current);
      groups.current.delete(overlay);
      if (active.has(overlay)) groups.current.set(overlay, build[overlay]().addTo(m));
    }
  }, [site, sources, active, lat, lng]);

  return (
    <>
      <div ref={container} className="leaflet-map" role="img" aria-label="context map" />
      {tilesFailed && (
        <p className="map-notice" role="status">
          Basemap tiles unavailable (server.arcgisonline.com unreachable) — overlays are drawn on a blank map.
        </p>
      )}
      <MapLegend site={site} active={active} sourceCount={sources.length} />
    </>
  );
}

function MapLegend(props: { site: Site; active: ReadonlySet<Overlay>; sourceCount: number }) {
  const { site, active, sourceCount } = props;
  const stress = clamp01(site.waterStressIndex);
  return (
    <ul className="legend map-legend">
      {active.has("latency") && (
        <li>
          <span className="swatch latency" /> <Explainer term="overlay.latency">latency</Explainer>: serves {latencyLabel[site.latencyTier]} · {fmtKm(latencyRadiusKm[site.latencyTier])}
        </li>
      )}
      {active.has("water") && (
        <li>
          <span className="swatch water" style={{ opacity: 0.2 + stress * 0.7 }} /> <Explainer term="overlay.water">water</Explainer>: stress index {stress.toFixed(2)}
        </li>
      )}
      {active.has("power") && (
        <li>
          <span className="swatch power" /> <Explainer term="overlay.power">power</Explainer>: {sourceCount} source{sourceCount === 1 ? "" : "s"} (locations not
          surveyed; placement illustrative)
        </li>
      )}
    </ul>
  );
}

function escapeHtml(s: string): string {
  const entity: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return s.replace(/[&<>"']/g, (c) => entity[c] ?? c);
}

/** Real geography: Esri Gray Canvas tiles under Leaflet, overlays at true kilometre scale. */
export const leafletMapProvider: MapProvider = {
  name: "leaflet",
  render(site, active) {
    return <LeafletMap site={site} active={active} />;
  },
};
