import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

/** Sends one message to the Copilot as if the user typed it; resolves when the turn ends. */
export type CopilotSend = (text: string) => Promise<void>;

interface CopilotHandle {
  readonly send: CopilotSend | null;
  readonly register: (send: CopilotSend | null) => void;
}

const CopilotHandleContext = createContext<CopilotHandle>({ send: null, register: () => undefined });

/**
 * Lets any view hand a message to the Copilot ("Explain this block") without owning it. The rail
 * registers its live Copilot's `send`; readers get `null` while no Copilot is available (no key, no
 * plan) and should hide or disable their affordance.
 */
export function CopilotHandleProvider(props: { children: ReactNode }) {
  const [send, setSend] = useState<CopilotSend | null>(null);
  const register = useCallback((fn: CopilotSend | null) => setSend(() => fn), []);
  const value = useMemo(() => ({ send, register }), [send, register]);
  return <CopilotHandleContext.Provider value={value}>{props.children}</CopilotHandleContext.Provider>;
}

export function useCopilotSend(): CopilotSend | null {
  return useContext(CopilotHandleContext).send;
}

export function useRegisterCopilotSend(): (send: CopilotSend | null) => void {
  return useContext(CopilotHandleContext).register;
}
