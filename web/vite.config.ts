/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // The Copilot bundles docs/agent-system-prompt.md and research/**/*.md from the repo root.
  server: { fs: { allow: [fileURLToPath(new URL("..", import.meta.url))] } },
  test: {
    environment: "node",
  },
});
