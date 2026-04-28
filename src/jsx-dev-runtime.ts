// Teelm — JSX Dev Runtime (re-exports from jsx-runtime)
//
// esbuild / Vite emit `import { jsxDEV } from "teelm/jsx-dev-runtime"` in
// development mode (with `jsx: "automatic"`), and `import { jsx } from
// "teelm/jsx-runtime"` in production. Both must resolve.

export { jsx, jsxs, jsxDEV, Fragment, type JSX } from "./jsx-runtime";
