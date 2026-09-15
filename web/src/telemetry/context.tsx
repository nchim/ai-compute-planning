import { createContext, useContext, type ReactNode } from "react";

import type { SessionShare } from "./share";

const SessionShareContext = createContext<SessionShare | null>(null);

/** Hands the app's session share (created once in main.tsx) to the rail's toggle; `null` when there is none. */
export function SessionShareProvider(props: { share: SessionShare; children: ReactNode }) {
  return <SessionShareContext.Provider value={props.share}>{props.children}</SessionShareContext.Provider>;
}

export function useSessionShare(): SessionShare | null {
  return useContext(SessionShareContext);
}
