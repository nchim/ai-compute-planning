import { LatencyClass, PowerType } from "../../gen/capplanner/v1/engine_pb";

/**
 * Flat-earth geography for the context map: good to well under 1% at the sub-2,000 km scale the
 * overlays cover, and pure, so the rings and offsets are unit-testable without Leaflet.
 */
export interface LatLng {
  readonly lat: number;
  readonly lng: number;
}

/** Assignable to a Leaflet `LatLngBoundsLiteral`: [[south, west], [north, east]]. */
export type BoundsLiteral = [[number, number], [number, number]];

const KM_PER_DEG_LAT = 111.32;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** The point `km` away from `origin` along a compass bearing (0 = north, 90 = east). */
export function offsetKm(origin: LatLng, bearingDeg: number, km: number): LatLng {
  const dLat = (km * Math.cos(toRad(bearingDeg))) / KM_PER_DEG_LAT;
  const dLng = (km * Math.sin(toRad(bearingDeg))) / (KM_PER_DEG_LAT * Math.cos(toRad(origin.lat)));
  return { lat: origin.lat + dLat, lng: origin.lng + dLng };
}

/** The bounding square of a ring of `radiusKm` around `origin`. */
export function ringBounds(origin: LatLng, radiusKm: number): BoundsLiteral {
  const south = offsetKm(origin, 180, radiusKm);
  const north = offsetKm(origin, 0, radiusKm);
  const west = offsetKm(origin, 270, radiusKm);
  const east = offsetKm(origin, 90, radiusKm);
  return [
    [south.lat, west.lng],
    [north.lat, east.lng],
  ];
}

/**
 * Latency tier → serving radius. Assumes ~1 ms round trip per 100 km of fibre (light in glass
 * ≈ 200 km/ms one way) with a ~1.5× route factor: metro ≲ 2 ms RTT → ~80 km, regional ≲ 10 ms →
 * ~400 km, training is latency-tolerant (≳ 30 ms) → ~1,500 km, i.e. continental reach.
 */
export const latencyRadiusKm: Record<LatencyClass, number> = {
  [LatencyClass.LATENCY_UNSPECIFIED]: 0,
  [LatencyClass.INFERENCE_METRO]: 80,
  [LatencyClass.INFERENCE_REGIONAL]: 400,
  [LatencyClass.TRAINING_REMOTE]: 1500,
};

const tiersInnermostFirst = [LatencyClass.INFERENCE_METRO, LatencyClass.INFERENCE_REGIONAL, LatencyClass.TRAINING_REMOTE];

export interface LatencyRing {
  readonly tier: LatencyClass;
  readonly km: number;
}

/** Every tier the site can serve, innermost first: a training site also serves regional and metro demand. */
export function latencyRings(tier: LatencyClass): LatencyRing[] {
  return tiersInnermostFirst.map((t) => ({ tier: t, km: latencyRadiusKm[t] })).filter((r) => r.km <= latencyRadiusKm[tier]);
}

/** Radius of the water-stress tint: the region whose basins and aquifers the site draws on. */
export const WATER_REGION_KM = 60;

/**
 * Schematic distance from the site by source type. The plan carries no coordinates for power
 * sources, so these are illustrative: BTM assets sit next to the parcel, a grid tie is a line away,
 * a PPA is somewhere in the same market.
 */
const powerDistanceKm: Record<PowerType, number> = {
  [PowerType.POWER_UNSPECIFIED]: 20,
  [PowerType.GRID]: 25,
  [PowerType.BTM_GAS]: 8,
  [PowerType.SOLAR_PPA]: 40,
  [PowerType.WIND_PPA]: 45,
  [PowerType.NUCLEAR_PPA]: 60,
  [PowerType.BESS]: 4,
};

export interface Placement {
  readonly at: LatLng;
  readonly bearingDeg: number;
  readonly km: number;
}

/** Where to draw the i-th power source: spread clockwise from north-east so markers never overlap. */
export function powerSourcePlacement(site: LatLng, index: number, type: PowerType): Placement {
  const bearingDeg = (45 + index * 90) % 360;
  const km = powerDistanceKm[type];
  return { at: offsetKm(site, bearingDeg, km), bearingDeg, km };
}
