import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    alias: {
      vscode: path.resolve(__dirname, "__mocks__/vscode.ts"),
    },
    exclude: ["out/**", "node_modules/**"],
  },
});
