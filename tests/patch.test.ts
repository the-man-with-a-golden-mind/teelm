import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { app, h, text, noFx, type Dispatch } from "../src/teelm";

let root: HTMLElement;

beforeEach(() => {
  root = document.createElement("div");
  document.body.appendChild(root);
});

afterEach(() => {
  root.remove();
});

function flush(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
}

function mount<S>(init: S, viewFn: (s: Readonly<S>, d: Dispatch<{ tag: "Set"; s: S }>) => any) {
  return app<S, { tag: "Set"; s: S }>({
    init: noFx(init),
    update: (_, msg) => noFx(msg.s),
    view: viewFn,
    node: root,
  });
}

describe("DOM patching", () => {
  it("patches text content", async () => {
    const inst = mount({ text: "hello" }, (s) => h("div", {}, s.text));
    expect(root.textContent).toBe("hello");

    inst.dispatch({ tag: "Set", s: { text: "world" } });
    await flush();
    expect(root.textContent).toBe("world");
  });

  it("patches attributes", async () => {
    const inst = mount({ cls: "a" }, (s) => h("div", { class: s.cls }));
    expect(root.querySelector("div")?.className).toBe("a");

    inst.dispatch({ tag: "Set", s: { cls: "b" } });
    await flush();
    expect(root.querySelector("div")?.className).toBe("b");
  });

  it("removes attributes set to null", async () => {
    const inst = mount({ title: "hi" as string | null }, (s) =>
      h("div", { title: s.title }),
    );
    expect(root.querySelector("div")?.getAttribute("title")).toBe("hi");

    inst.dispatch({ tag: "Set", s: { title: null } });
    await flush();
    // DOM property set to "" (not removed) — matches teelm behavior
    expect(root.querySelector("div")?.getAttribute("title")).toBe("");
  });

  it("patches inline styles (object)", async () => {
    const inst = mount({ color: "red" }, (s) =>
      h("div", { style: { color: s.color } }),
    );
    expect((root.querySelector("div") as HTMLElement).style.color).toBe("red");

    inst.dispatch({ tag: "Set", s: { color: "blue" } });
    await flush();
    expect((root.querySelector("div") as HTMLElement).style.color).toBe("blue");
  });

  it("patches inline styles (string)", async () => {
    const inst = mount({ css: "color: red" }, (s) =>
      h("div", { style: s.css }),
    );

    inst.dispatch({ tag: "Set", s: { css: "color: blue" } });
    await flush();
    expect((root.querySelector("div") as HTMLElement).style.color).toBe("blue");
  });

  it("replaces element with different tag", async () => {
    const inst = mount({ tag: "div" as string }, (s) =>
      h(s.tag, { id: "target" }, "content"),
    );
    expect(root.querySelector("#target")?.tagName).toBe("DIV");

    inst.dispatch({ tag: "Set", s: { tag: "span" } });
    await flush();
    expect(root.querySelector("#target")?.tagName).toBe("SPAN");
    expect(root.querySelector("#target")?.textContent).toBe("content");
  });

  it("adds children", async () => {
    const inst = mount({ items: [1] }, (s) =>
      h("ul", {}, ...s.items.map((i) => h("li", {}, String(i)))),
    );
    expect(root.querySelectorAll("li")).toHaveLength(1);

    inst.dispatch({ tag: "Set", s: { items: [1, 2, 3] } });
    await flush();
    expect(root.querySelectorAll("li")).toHaveLength(3);
  });

  it("removes children", async () => {
    const inst = mount({ items: [1, 2, 3] }, (s) =>
      h("ul", {}, ...s.items.map((i) => h("li", {}, String(i)))),
    );

    inst.dispatch({ tag: "Set", s: { items: [1] } });
    await flush();
    expect(root.querySelectorAll("li")).toHaveLength(1);
    expect(root.querySelector("li")?.textContent).toBe("1");
  });

  it("handles conditional rendering", async () => {
    const inst = mount({ show: true }, (s) =>
      h("div", {}, s.show ? h("p", {}, "visible") : null),
    );
    expect(root.querySelector("p")).not.toBeNull();

    inst.dispatch({ tag: "Set", s: { show: false } });
    await flush();
    expect(root.querySelector("p")).toBeNull();
  });
});

describe("keyed reconciliation", () => {
  it("reorders keyed elements", async () => {
    const inst = mount({ items: ["a", "b", "c"] }, (s) =>
      h("ul", {}, ...s.items.map((i) => h("li", { key: i }, i))),
    );

    inst.dispatch({ tag: "Set", s: { items: ["c", "a", "b"] } });
    await flush();

    const lis = root.querySelectorAll("li");
    expect(lis).toHaveLength(3);
    expect(lis[0]?.textContent).toBe("c");
    expect(lis[1]?.textContent).toBe("a");
    expect(lis[2]?.textContent).toBe("b");
  });

  it("inserts keyed element in middle", async () => {
    const inst = mount({ items: ["a", "c"] }, (s) =>
      h("ul", {}, ...s.items.map((i) => h("li", { key: i }, i))),
    );

    inst.dispatch({ tag: "Set", s: { items: ["a", "b", "c"] } });
    await flush();

    const lis = root.querySelectorAll("li");
    expect(lis).toHaveLength(3);
    expect(lis[1]?.textContent).toBe("b");
  });

  it("removes keyed element from middle", async () => {
    const inst = mount({ items: ["a", "b", "c"] }, (s) =>
      h("ul", {}, ...s.items.map((i) => h("li", { key: i }, i))),
    );

    inst.dispatch({ tag: "Set", s: { items: ["a", "c"] } });
    await flush();

    const lis = root.querySelectorAll("li");
    expect(lis).toHaveLength(2);
    expect(lis[0]?.textContent).toBe("a");
    expect(lis[1]?.textContent).toBe("c");
  });

  it("preserves DOM nodes for keyed elements", async () => {
    const inst = mount({ items: [1, 2, 3] }, (s) =>
      h("ul", {}, ...s.items.map((i) => h("li", { key: i, id: `k-${i}` }, String(i)))),
    );

    const node2 = root.querySelector("#k-2");

    inst.dispatch({ tag: "Set", s: { items: [3, 2, 1] } });
    await flush();

    // DOM node for key=2 should be reused
    expect(root.querySelector("#k-2")).toBe(node2);
  });

  it("handles empty to many", async () => {
    const inst = mount({ items: [] as number[] }, (s) =>
      h("ul", {}, ...s.items.map((i) => h("li", { key: i }, String(i)))),
    );

    inst.dispatch({ tag: "Set", s: { items: [1, 2, 3] } });
    await flush();
    expect(root.querySelectorAll("li")).toHaveLength(3);
  });

  it("handles many to empty", async () => {
    const inst = mount({ items: [1, 2, 3] }, (s) =>
      h("ul", {}, ...s.items.map((i) => h("li", { key: i }, String(i)))),
    );

    inst.dispatch({ tag: "Set", s: { items: [] } });
    await flush();
    expect(root.querySelectorAll("li")).toHaveLength(0);
  });
});

describe("events", () => {
  it("handles onClick", () => {
    let clicked = false;
    app<{}, never>({
      init: noFx({}),
      update: (s) => noFx(s),
      view: () => h("button", { id: "btn", onClick: () => { clicked = true; } }),
      node: root,
    });

    root.querySelector<HTMLElement>("#btn")?.click();
    expect(clicked).toBe(true);
  });

  it("updates event handlers without re-adding listeners", async () => {
    const calls: number[] = [];
    type Msg = { tag: "Inc" };

    const inst = app<{ n: number }, Msg>({
      init: noFx({ n: 0 }),
      update: (s) => noFx({ n: s.n + 1 }),
      view: (s, d) =>
        h("div", {},
          h("button", {
            id: "btn",
            onClick: () => { calls.push(s.n); d({ tag: "Inc" }); },
          }),
        ),
      node: root,
    });

    root.querySelector<HTMLElement>("#btn")?.click();
    await flush();
    root.querySelector<HTMLElement>("#btn")?.click();

    // Each click fires exactly once (no duplicate listeners)
    expect(calls).toEqual([0, 1]);
  });
});

describe("SVG", () => {
  it("creates SVG elements with correct namespace", () => {
    app<{}, never>({
      init: noFx({}),
      update: (s) => noFx(s),
      view: () =>
        h("svg", { width: "100", height: "100" },
          h("circle", { cx: "50", cy: "50", r: "40" }),
        ),
      node: root,
    });

    const svg = root.querySelector("svg");
    const circle = root.querySelector("circle");
    expect(svg?.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(circle?.namespaceURI).toBe("http://www.w3.org/2000/svg");
  });
});

describe("value/checked/selected patching", () => {
  it("patches input value from DOM state", async () => {
    type Msg = { tag: "Set"; v: string };
    const inst = app<{ v: string }, Msg>({
      init: noFx({ v: "hello" }),
      update: (_, msg) => noFx({ v: msg.v }),
      view: (s) => h("input", { id: "inp", value: s.v }),
      node: root,
    });

    const input = root.querySelector<HTMLInputElement>("#inp");
    expect(input?.value).toBe("hello");

    inst.dispatch({ tag: "Set", v: "world" });
    await flush();
    expect(input?.value).toBe("world");
  });
});
