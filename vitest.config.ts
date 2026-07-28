import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
      },
      exclude: [
        "app/**",
        "components/icons/**",
        "lib/alerts/**",
        "lib/collectors/persistence.ts",
        "lib/db/**",
        "lib/pricing/repository.ts",
        "tests/**",
        "**/*.config.*",
        "scripts/**",
      ],
    },
  },
});
