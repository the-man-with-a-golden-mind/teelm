import { defineConfig } from "vite";
import path from "path";

const root = path.resolve(__dirname, "../..");

export default defineConfig({
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "teelm",
  },
  resolve: {
    alias: {
      "teelm/fx": path.resolve(root, "src/fx.ts"),
      "teelm/subs": path.resolve(root, "src/subs.ts"),
      "teelm/debugger": path.resolve(root, "src/debugger.ts"),
      "teelm/router": path.resolve(root, "src/router.ts"),
      "teelm/jsx-runtime": path.resolve(root, "src/jsx-runtime.ts"),
      "teelm/jsx-dev-runtime": path.resolve(root, "src/jsx-dev-runtime.ts"),
      "teelm/functional": path.resolve(root, "src/functional.ts"),
      "teelm/task": path.resolve(root, "src/task.ts"),
      "teelm/events": path.resolve(root, "src/events.ts"),
      "teelm": path.resolve(root, "src/teelm.ts"),
    },
  },
});
