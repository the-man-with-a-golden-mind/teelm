import { describe, expect, test } from "bun:test";
import { app, h, memo, noFx } from "../src/teelm";

const tick = (ms = 50) => new Promise<void>((r) => setTimeout(r, ms));

describe("Nested memo issue", () => {
  test("should handle nested memoized components", async () => {
    const Inner = (props: { name: string }) => h("div", { id: "inner" }, props.name);
    const MemoInner = (props: { name: string }) => memo(Inner, props);

    const Outer = (props: { name: string }) => MemoInner(props);
    const MemoOuter = (props: { name: string }) => memo(Outer, props);

    const container = document.createElement("div");
    app({
      init: noFx({ name: "test" }),
      update: (state) => noFx(state),
      view: (state) => MemoOuter({ name: state.name }),
      node: container,
    });

    await tick();
    const inner = container.querySelector("#inner");
    expect(inner).not.toBeNull();
    expect(inner?.textContent).toBe("test");
  });

  test("should skip re-rendering if props are the same", async () => {
    let renderCount = 0;
    const Inner = (props: { name: string }) => {
      renderCount++;
      return h("div", { id: "inner" }, props.name);
    };
    const MemoInner = (props: { name: string }) => memo(Inner, props);

    const container = document.createElement("div");
    const { dispatch } = app<{ name: string }, string>({
      init: noFx({ name: "test" }),
      update: (state, name) => noFx({ ...state, name }),
      view: (state) => MemoInner({ name: state.name }),
      node: container,
    });

    await tick();
    expect(renderCount).toBe(1);

    // Update with the same name → no re-render of Inner.
    dispatch("test");
    await tick();
    expect(renderCount).toBe(1);

    // Update with a different name → Inner re-renders.
    dispatch("other");
    await tick();
    expect(renderCount).toBe(2);
  });

  test("should skip entire chain if nested memo props are the same", async () => {
    let innerRenderCount = 0;
    let outerRenderCount = 0;

    const Inner = (props: { name: string }) => {
      innerRenderCount++;
      return h("div", { id: "inner" }, props.name);
    };
    const MemoInner = (props: { name: string }) => memo(Inner, props);

    const Outer = (props: { name: string }) => {
      outerRenderCount++;
      return MemoInner(props);
    };
    const MemoOuter = (props: { name: string }) => memo(Outer, props);

    const container = document.createElement("div");
    const { dispatch } = app<{ name: string }, string>({
      init: noFx({ name: "test" }),
      update: (state, name) => noFx({ ...state, name }),
      view: (state) => MemoOuter({ name: state.name }),
      node: container,
    });

    await tick();
    expect(outerRenderCount).toBe(1);
    expect(innerRenderCount).toBe(1);

    dispatch("test");
    await tick();
    expect(outerRenderCount).toBe(1);
    expect(innerRenderCount).toBe(1);

    dispatch("other");
    await tick();
    expect(outerRenderCount).toBe(2);
    expect(innerRenderCount).toBe(2);
  });

  test("should handle non-memoized components (JSX style) with null props", async () => {
    const Component = (props: { name?: string }) =>
      h("div", { id: "jsx" }, props.name || "default");

    const container = document.createElement("div");
    app({
      init: noFx({}),
      update: (state) => noFx(state),
      view: () => h(Component as never, null),
      node: container,
    });

    await tick();
    const el = container.querySelector("#jsx");
    expect(el).not.toBeNull();
    expect(el?.textContent).toBe("default");
  });
});
