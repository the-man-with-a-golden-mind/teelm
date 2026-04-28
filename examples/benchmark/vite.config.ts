import { defineConfig } from "vite";
import path from "path";

const root = path.resolve(__dirname, "../..");

export default defineConfig({
  resolve: {
    alias: {
      "teelm/fx": path.resolve(root, "src/fx.ts"),
      "teelm/subs": path.resolve(root, "src/subs.ts"),
      "teelm/debugger": path.resolve(root, "src/debugger.ts"),
      "teelm/router": path.resolve(root, "src/router.ts"),
      "teelm/jsx-runtime": path.resolve(root, "src/jsx-runtime.ts"),
      "teelm/jsx-dev-runtime": path.resolve(root, "src/jsx-dev-runtime.ts"),
      "teelm": path.resolve(root, "src/teelm.ts"),
    },
  },
});
