import { createContext, useContext, type ReactNode } from "react";

import type { Engine } from "../engine";

const EngineContext = createContext<Engine | null>(null);

/** Hands the app's engine to the Copilot (for optimize and direct analyze); the store keeps owning it. */
export function EngineProvider(props: { engine: Engine; children: ReactNode }) {
  return <EngineContext.Provider value={props.engine}>{props.children}</EngineContext.Provider>;
}

export function useEngine(): Engine {
  const engine = useContext(EngineContext);
  if (engine === null) throw new Error("useEngine must be used inside <EngineProvider>");
  return engine;
}
