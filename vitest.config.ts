import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // JSX sin importar React, como en Next (tsconfig deja el JSX tal cual para Next).
  esbuild: { jsx: "automatic" },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}", "lib/esku/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
