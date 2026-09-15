import { useState } from "react";

import { useStore } from "../../bus";
import { LatencyClass, type Site } from "../../gen/capplanner/v1/engine_pb";
import { Explainer } from "./Explainer";
import { leafletMapProvider } from "./LeafletMap";
import { NotComputed, Region } from "./chrome";
import { latencyLabel, type MapProvider, type Overlay } from "./mapProvider";

export { leafletMapProvider };

const overlays: readonly Overlay[] = ["power", "water", "latency"];

/** Tile-free fallback: the same overlays as a schematic, for environments with no basemap access. */
export const schematicMapProvider: MapProvider = {
  name: "schematic",
  render(site, active) {
    const loc = site.location;
    const stress = Math.min(1, Math.max(0, site.waterStressIndex));
    return (
      <svg className="map" viewBox="0 0 520 220" role="img" aria-label="context map">
        <rect className="land" x={0} y={0} width={520} height={220} />
        {active.has("latency") && (
          <g className="ov-latency">
            <circle cx={260} cy={110} r={site.latencyTier === LatencyClass.INFERENCE_METRO ? 40 : 95} />
            <text x={260} y={205} textAnchor="middle">serves: {latencyLabel[site.latencyTier]}</text>
          </g>
        )}
        {active.has("water") && (
          <g className="ov-water">
            <circle cx={260} cy={110} r={30 + stress * 40} style={{ opacity: 0.25 + stress * 0.5 }} />
            <text x={30} y={200}>water stress {stress.toFixed(2)}</text>
          </g>
        )}
        {active.has("power") && (
          <g className="ov-power">
            <line x1={260} y1={110} x2={470} y2={40} />
            <rect x={462} y={30} width={16} height={16} />
            <text x={455} y={22} textAnchor="end">grid tie</text>
            <line x1={260} y1={110} x2={90} y2={170} className="gas" />
            <rect x={80} y={162} width={14} height={14} className="gas" />
            <text x={100} y={188}>gas pipeline</text>
          </g>
        )}
        <circle className="site" cx={260} cy={110} r={7} />
        <text className="site-label" x={260} y={100} textAnchor="middle">
          {site.market} · {loc === undefined ? "no location" : `${loc.lat.toFixed(2)}, ${loc.lng.toFixed(2)}`}
        </text>
      </svg>
    );
  },
};

export function ContextMap(props: { provider?: MapProvider }) {
  const { state } = useStore();
  const provider = props.provider ?? leafletMapProvider;
  const [active, setActive] = useState<ReadonlySet<Overlay>>(() => new Set<Overlay>(["power"]));
  const toggle = (o: Overlay) =>
    setActive((prev) => {
      const next = new Set(prev);
      if (!next.delete(o)) next.add(o);
      return next;
    });
  const site: Site | undefined = state.plan?.site;
  return (
    <Region
      id="context_map"
      title="Context map"
      dimensions={["space"]}
      actions={
        <span className="seg" role="group" aria-label="overlays">
          {overlays.map((o) => (
            <button key={o} type="button" className={active.has(o) ? "on" : ""} aria-pressed={active.has(o)} onClick={() => toggle(o)}>
              <Explainer term={`overlay.${o}`}>{o}</Explainer>
            </button>
          ))}
        </span>
      }
    >
      {site === undefined ? <NotComputed what="Site" /> : provider.render(site, active)}
      <p className="kpi-s">Overlay: {[...active].join(" · ") || "none"} · provider: {provider.name}</p>
    </Region>
  );
}
