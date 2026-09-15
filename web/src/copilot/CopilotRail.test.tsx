// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { StoreProvider, createStore } from "../bus";
import { createFakeEngine } from "../engine";
import { PREFERENCE_KEY, SessionShareProvider, createSessionShare, loadSharePreference } from "../telemetry";
import { CopilotRail } from "./CopilotRail";
import { EngineProvider } from "./engineContext";
import { CopilotHandleProvider } from "./handle";

afterEach(cleanup);
beforeEach(() => window.localStorage.clear());

/** Mounts the rail with a share whose initial state comes from the persisted preference, as main.tsx does. */
function mount(defaultOn: boolean) {
  const engine = createFakeEngine();
  const store = createStore({ engine, debounceMs: 0 });
  const share = createSessionShare({
    store,
    enabled: loadSharePreference(window.localStorage, defaultOn),
    sessionId: "s1",
    fetch: vi.fn(() => Promise.resolve(new Response(null, { status: 204 }))) as unknown as typeof fetch,
  });
  const view = render(
    <StoreProvider store={store}>
      <EngineProvider engine={engine}>
        <SessionShareProvider share={share}>
          <CopilotHandleProvider>
            <CopilotRail />
          </CopilotHandleProvider>
        </SessionShareProvider>
      </EngineProvider>
    </StoreProvider>,
  );
  return { share, view };
}

describe("share session toggle", () => {
  test("reflects the share's state, shows the sharing dot, and persists changes in localStorage", () => {
    const { share, view } = mount(true);
    const toggle = screen.getByRole("checkbox", { name: "Share session with developer" }) as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    expect(screen.getByRole("img", { name: /Sharing this session/ })).toBeTruthy();
    expect(screen.getByRole("tooltip").textContent).toContain("Never your API key");

    fireEvent.click(toggle);
    expect(toggle.checked).toBe(false);
    expect(share.isEnabled()).toBe(false);
    expect(window.localStorage.getItem(PREFERENCE_KEY)).toBe("false");
    expect(screen.queryByRole("img", { name: /Sharing this session/ })).toBeNull();
    view.unmount();

    // A fresh page load reads the persisted choice over the build default.
    const again = mount(true);
    expect((screen.getByRole("checkbox", { name: "Share session with developer" }) as HTMLInputElement).checked).toBe(false);
    expect(again.share.isEnabled()).toBe(false);
  });

  test("defaults off when the build says so and nothing is persisted", () => {
    mount(false);
    const toggle = screen.getByRole("checkbox", { name: "Share session with developer" }) as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    fireEvent.click(toggle);
    expect(window.localStorage.getItem(PREFERENCE_KEY)).toBe("true");
  });
});
