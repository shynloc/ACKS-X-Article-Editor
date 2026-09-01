import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "tests/bridge-auth.test.mjs"],
    environment: "node",
    setupFiles: ["tests/setup.ts"],
  },
});
