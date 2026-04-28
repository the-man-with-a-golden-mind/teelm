import { describe, it, expect } from "bun:test";
import { h, text, memo, lazy, resolveClass, type VNode } from "../src/teelm";

describe("h()", () => {
  it("creates element VNode", () => {
    const node = h("div", { id: "app" }, "hello");
    expect(node.tag).toBe("div");
    expect(node.props.id).toBe("app");
    expect(node.children).toHaveLength(1);
    expect(node.children[0]!.type).toBe(3); // TEXT
    expect(node.children[0]!.tag).toBe("hello");
  });

  it("extracts key from props", () => {
    const node = h("li", { key: "a", class: "item" });
    expect(node.key).toBe("a");
    expect(node.props.key).toBeUndefined();
  });

  it("handles no props", () => {
    const node = h("div");
    expect(node.props).toEqual({});
    expect(node.children).toEqual([]);
  });

  it("flattens nested children", () => {
    const node = h("div", {}, "a", ["b", ["c"]], "d");
    expect(node.children).toHaveLength(4);
    expect(node.children.map((c) => c.tag)).toEqual(["a", "b", "c", "d"]);
  });

  it("skips null/undefined/boolean children", () => {
    const node = h("div", {}, null, undefined, false, true, "real");
    expect(node.children).toHaveLength(1);
    expect(node.children[0]!.tag).toBe("real");
  });

  it("handles number children", () => {
    const node = h("span", {}, 42);
    expect(node.children[0]!.tag).toBe("42");
    expect(node.children[0]!.type).toBe(3);
  });

  it("resolves class from string", () => {
    const node = h("div", { class: "foo bar" });
    expect(node.props.class).toBe("foo bar");
  });

  it("resolves class from array", () => {
    const node = h("div", { class: ["foo", "bar", null, "baz"] });
    expect(node.props.class).toBe("foo bar baz");
  });

  it("resolves class from object", () => {
    const node = h("div", { class: { active: true, hidden: false, visible: 1 } });
    expect(node.props.class).toBe("active visible");
  });

  it("resolves class from mixed array", () => {
    const node = h("div", { class: ["base", { active: true, hidden: false }] });
    expect(node.props.class).toBe("base active");
  });

  it("supports className alias", () => {
    const node = h("div", { className: "test" });
    expect(node.props.class).toBe("test");
  });

  it("prefers class over className", () => {
    const node = h("div", { class: "a", className: "b" });
    expect(node.props.class).toBe("a");
  });
});

describe("text()", () => {
  it("creates text VNode", () => {
    const node = text("hello");
    expect(node.tag).toBe("hello");
    expect(node.type).toBe(3);
    expect(node.children).toEqual([]);
  });

  it("converts numbers", () => {
    expect(text(42).tag).toBe("42");
  });

  it("converts booleans", () => {
    expect(text(true).tag).toBe("true");
  });
});

describe("memo()", () => {
  it("creates memo VNode with component and props", () => {
    const component = (props: { name: string }) => h("span", {}, props.name);
    const node = memo(component, { name: "test" });
    expect(node.tag).toBe(component);
    expect(node.memo).toEqual({ name: "test" });
  });

  it("extracts key from memo props", () => {
    const component = (props: { key: string; n: number }) => h("div", {}, String(props.n));
    const node = memo(component, { key: "k1", n: 5 });
    expect(node.key).toBe("k1");
  });
});

describe("lazy()", () => {
  it("creates lazy VNode with view function and data", () => {
    const view = (n: number) => h("span", {}, String(n));
    const node = lazy(view, 42);
    expect(node.tag).toBe(view);
    expect(node.memo).toBe(42);
  });
});

describe("resolveClass()", () => {
  it("returns empty string for falsy values", () => {
    expect(resolveClass(null)).toBe("");
    expect(resolveClass(undefined)).toBe("");
    expect(resolveClass(false)).toBe("");
    expect(resolveClass(0)).toBe("");
  });

  it("handles deeply nested arrays", () => {
    expect(resolveClass(["a", ["b", ["c"]]])).toBe("a b c");
  });
});
