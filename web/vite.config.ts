/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // The site view's dev route imports ../fixtures/abilene-1.json from the repo root.
  server: { fs: { allow: [".."] } },
  test: {
    environment: "node",
  },
});
