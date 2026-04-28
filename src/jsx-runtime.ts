// Teelm — JSX Runtime (React 17+ automatic transform)
//
// tsconfig.json:
//   "jsx": "react-jsx",
//   "jsxImportSource": "./src"
//
// Or use per-file pragma:
//   /** @jsxImportSource ./src */

import { h, text, type VNode } from "./teelm";

export { type VNode as JSX };

export function jsx(
  tag: string,
  props: Record<string, any> | null,
): VNode {
  const { children, ...rest } = props ?? {};
  if (children == null) return h(tag, rest);
  return h(tag, rest, ...(Array.isArray(children) ? children : [children]));
}

export { jsx as jsxs };

export function jsxDEV(
  tag: string,
  props: Record<string, any> | null,
): VNode {
  return jsx(tag, props);
}

export function Fragment({ children }: { children?: any }): VNode {
  return h("", {}, ...(Array.isArray(children) ? children : children != null ? [children] : []));
}

export namespace JSX {
  export type Element = VNode;
  export interface IntrinsicElements {
    [tag: string]: Record<string, any>;
  }
}
