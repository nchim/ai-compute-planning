import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { defineConfig } from "@playwright/test";

/** The SPA under test. Override to point the harness at an already-running server. */
export const baseURL = process.env.HARNESS_BASE_URL ?? "http://localhost:5173";

const wasmBuilt = existsSync(fileURLToPath(new URL("../web/public/engine.wasm", import.meta.url)));
/** `VITE_ENGINE` wins; otherwise the real engine when `make wasm` has run, the fake one when it has not. */
export const engine = process.env.VITE_ENGINE ?? (wasmBuilt ? "wasm" : "fake");

export default defineConfig({
  testDir: "./tests",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["github"]] : [["list"]],
  outputDir: "./test-results",
  use: { baseURL, headless: true },
  webServer: {
    command: "npm run dev -- --port 5173 --strictPort",
    cwd: "../web",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: { VITE_HARNESS: "1", VITE_ENGINE: engine },
  },
});
