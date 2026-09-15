import type { ReactNode } from "react";

import type { Site } from "../../gen/capplanner/v1/engine_pb";

export type Overlay = "power" | "water" | "latency";

/**
 * The seam for a real tile provider later: the ContextMap region only asks a provider to render the
 * site with the active overlays. `schematicMapProvider` (ContextMap.tsx) is the POC implementation.
 */
export interface MapProvider {
  readonly name: string;
  render(site: Site, overlays: ReadonlySet<Overlay>): ReactNode;
}
