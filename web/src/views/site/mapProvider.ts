import type { ReactNode } from "react";

import { LatencyClass, type Site } from "../../gen/capplanner/v1/engine_pb";

export type Overlay = "power" | "water" | "latency";

/**
 * The seam between the ContextMap region and whatever draws the site: the region only asks a
 * provider to render the site with the active overlays. `leafletMapProvider` (LeafletMap.tsx, real
 * tiles) is the default; `schematicMapProvider` (ContextMap.tsx) is the tile-free fallback.
 */
export interface MapProvider {
  readonly name: string;
  render(site: Site, overlays: ReadonlySet<Overlay>): ReactNode;
}

export const latencyLabel: Record<LatencyClass, string> = {
  [LatencyClass.LATENCY_UNSPECIFIED]: "latency tier unset",
  [LatencyClass.TRAINING_REMOTE]: "training (remote)",
  [LatencyClass.INFERENCE_REGIONAL]: "inference (regional)",
  [LatencyClass.INFERENCE_METRO]: "inference (metro)",
};
