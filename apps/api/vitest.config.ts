import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
  },
  resolve: {
    alias: {
      "@eldercare/domain": resolve(__dirname, "../../packages/domain/src"),
      "@eldercare/config": resolve(__dirname, "../../packages/config/src"),
    },
  },
});
