import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";

import type { Store } from "./store";
import type { State } from "./types";

const StoreContext = createContext<Store | null>(null);

export function StoreProvider(props: { store: Store; children: ReactNode }) {
  return <StoreContext.Provider value={props.store}>{props.children}</StoreContext.Provider>;
}

/** The one React binding to the bus: current state plus the store to dispatch into. */
export function useStore(): { state: State; store: Store } {
  const store = useContext(StoreContext);
  if (store === null) throw new Error("useStore must be used inside <StoreProvider>");
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  return { state, store };
}
