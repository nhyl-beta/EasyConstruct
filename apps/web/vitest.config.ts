import path from "path";
import { defineConfig } from "vitest/config";

// Unit tests for pure modules only (no DOM): ranking and the registry.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
