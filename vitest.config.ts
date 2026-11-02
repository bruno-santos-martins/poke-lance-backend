import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/test/**", "src/main/server.ts", "src/core/ports/**", "src/core/domain/entities.ts"],
      reporter: ["text", "html"],
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 84 }
    }
  }
});
