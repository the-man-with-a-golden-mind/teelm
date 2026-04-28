import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { app, h, text, lazy, resolveClass, withFx, noFx, type Dispatch, type Effect, type Sub, type Subs } from "../src/teelm";

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

describe("app()", () => {
  it("renders initial state", () => {
    app<{ n: number }, never>({
      init: noFx({ n: 42 }),
      update: (s) => noFx(s),
      view: (s) => h("div", {}, String(s.n)),
      node: root,
    });

    expect(root.textContent).toBe("42");
  });

  it("updates on dispatch", async () => {
    type Msg = { tag: "Inc" };
    const instance = app<{ n: number }, Msg>({
      init: noFx({ n: 0 }),
      update: (s) => noFx({ n: s.n + 1 }),
      view: (s, d) =>
        h("div", {},
          h("span", { id: "val" }, String(s.n)),
          h("button", { id: "btn", onClick: () => d({ tag: "Inc" }) }),
        ),
      node: root,
    });

    expect(root.querySelector("#val")?.textContent).toBe("0");
    instance.dispatch({ tag: "Inc" });
    await flush();
    expect(root.querySelector("#val")?.textContent).toBe("1");
  });

  it("runs effects", async () => {
    let effectRan = false;
    type Msg = { tag: "Go" } | { tag: "Done" };

    const myEffect: Effect<Msg> = [
      (dispatch) => {
        effectRan = true;
        dispatch({ tag: "Done" });
      },
      null,
    ];

    const instance = app<{ done: boolean }, Msg>({
      init: noFx({ done: false }),
      update: (s, msg) => {
        switch (msg.tag) {
          case "Go": return withFx<{ done: boolean }, Msg>(s, myEffect);
          case "Done": return noFx({ done: true });
        }
      },
      view: (s) => h("div", {}, s.done ? "done" : "pending"),
      node: root,
    });

    instance.dispatch({ tag: "Go" });
    await flush();
    expect(effectRan).toBe(true);
    expect(root.textContent).toBe("done");
  });

  it("runs init effects", () => {
    let effectRan = false;
    type Msg = { tag: "X" };

    const initEffect: Effect<Msg> = [(d) => { effectRan = true; }, null];
    app<{ n: number }, Msg>({
      init: withFx<{ n: number }, Msg>({ n: 0 }, initEffect),
      update: (s) => noFx(s),
      view: (s) => h("div", {}, String(s.n)),
      node: root,
    });

    expect(effectRan).toBe(true);
  });

  it("batches renders via rAF", async () => {
    let renderCount = 0;
    type Msg = { tag: "Inc" };

    const instance = app<{ n: number }, Msg>({
      init: noFx({ n: 0 }),
      update: (s) => noFx({ n: s.n + 1 }),
      view: (s) => {
        renderCount++;
        return h("div", {}, String(s.n));
      },
      node: root,
    });

    renderCount = 0; // reset after initial render
    instance.dispatch({ tag: "Inc" });
    instance.dispatch({ tag: "Inc" });
    instance.dispatch({ tag: "Inc" });

    // Before rAF — no re-renders yet
    expect(renderCount).toBe(0);

    await flush();

    // After rAF — only 1 render for all 3 dispatches
    expect(renderCount).toBe(1);
    expect(root.textContent).toBe("3");
  });

  it("lazy() skips view execution when data is the same", async () => {
    let viewCount = 0;
    const item = { id: 1, text: "foo" };

    const itemView = (data: typeof item) => {
      viewCount++;
      return h("div", { id: "item" }, data.text);
    };

    type State = { val: number; data: typeof item };
    const instance = app<State, { tag: "Update" }>({
      init: noFx({ val: 1, data: item }),
      update: (s) => noFx({ ...s, val: s.val + 1 }),
      view: (s) =>
        h("div", {}, [
          h("span", { id: "val" }, String(s.val)),
          lazy(itemView, s.data),
        ]),
      node: root,
    });

    await flush();
    expect(viewCount).toBe(1);
    expect(root.querySelector("#item")?.textContent).toBe("foo");

    instance.dispatch({ tag: "Update" });
    await flush();

    expect(root.querySelector("#val")?.textContent).toBe("2");
    expect(viewCount).toBe(1); // Skips because item reference didn't change
  });

  it("renders only once when dispatching an array of messages (Batch MSG)", async () => {
    let renderCount = 0;
    type Msg = { tag: "Inc" };

    const instance = app<{ n: number }, Msg>({
      init: noFx({ n: 0 }),
      update: (s) => noFx({ n: s.n + 1 }),
      view: (s) => {
        renderCount++;
        return h("div", {}, String(s.n));
      },
      node: root,
    });

    await flush(); // Initial render
    renderCount = 0;

    instance.dispatch([{ tag: "Inc" }, { tag: "Inc" }, { tag: "Inc" }]);

    expect(renderCount).toBe(0); // rAF hasn't fired yet
    await flush();
    expect(renderCount).toBe(1); // Processed all 3, rendered only once
    expect(root.textContent).toBe("3");
  });

  it("getState returns current state", () => {
    type Msg = { tag: "Set"; v: number };
    const instance = app<{ n: number }, Msg>({
      init: noFx({ n: 0 }),
      update: (_, msg) => noFx({ n: msg.v }),
      view: (s) => h("div", {}, String(s.n)),
      node: root,
    });

    expect(instance.getState().n).toBe(0);
    instance.dispatch({ tag: "Set", v: 99 });
    expect(instance.getState().n).toBe(99);
  });

  it("destroy stops rendering and clears DOM", async () => {
    type Msg = { tag: "Inc" };
    const instance = app<{ n: number }, Msg>({
      init: noFx({ n: 0 }),
      update: (s) => noFx({ n: s.n + 1 }),
      view: (s) => h("div", {}, String(s.n)),
      node: root,
    });

    instance.destroy();
    expect(root.textContent).toBe("");

    instance.dispatch({ tag: "Inc" });
    await flush();
    expect(root.textContent).toBe(""); // still empty
  });

  it("fires mount, afterRender, and unmount hooks", async () => {
    const calls: string[] = [];
    type Msg = { tag: "Inc" };

    const instance = app<{ n: number }, Msg>({
      init: noFx({ n: 0 }),
      update: (s) => noFx({ n: s.n + 1 }),
      view: (s) => h("div", {}, String(s.n)),
      onMount: ({ state, node }) => calls.push(`mount:${state.n}:${node.tagName}`),
      afterRender: ({ state, prevState }) =>
        calls.push(`after:${prevState?.n ?? "none"}->${state.n}`),
      onUnmount: ({ state }) => calls.push(`unmount:${state.n}`),
      node: root,
    });

    expect(calls).toEqual(["mount:0:DIV", "after:none->0"]);

    instance.dispatch({ tag: "Inc" });
    await flush();
    instance.destroy();

    expect(calls).toEqual([
      "mount:0:DIV",
      "after:none->0",
      "after:0->1",
      "unmount:1",
    ]);
  });

  it("explicit destroy() clears the DOM", async () => {
    type Msg = { tag: "Kill" };
    const instance = app<{ n: number }, Msg>({
      init: noFx({ n: 1 }),
      update: (s) => noFx(s),
      view: (s) => h("div", {}, String(s.n)),
      node: root,
    });

    instance.destroy();
    await flush();
    expect(root.textContent).toBe("");
  });
});

describe("history (time-travel)", () => {
  it("tracks state history", () => {
    type Msg = { tag: "Inc" };
    const instance = app<{ n: number }, Msg>({
      init: noFx({ n: 0 }),
      update: (s) => noFx({ n: s.n + 1 }),
      view: (s) => h("div", {}, String(s.n)),
      node: root,
      debug: { history: true },
    });

    instance.dispatch({ tag: "Inc" });
    instance.dispatch({ tag: "Inc" });

    expect(instance.getHistory()).toHaveLength(3);
    expect(instance.getHistoryIndex()).toBe(2);
  });

  it("goBack restores previous state", async () => {
    type Msg = { tag: "Inc" };
    const instance = app<{ n: number }, Msg>({
      init: noFx({ n: 0 }),
      update: (s) => noFx({ n: s.n + 1 }),
      view: (s) => h("div", {}, String(s.n)),
      node: root,
      debug: { history: true },
    });

    instance.dispatch({ tag: "Inc" });
    instance.dispatch({ tag: "Inc" });
    instance.goBack();
    await flush();

    expect(instance.getState().n).toBe(1);
    expect(instance.getHistoryIndex()).toBe(1);
  });

  it("goForward advances", async () => {
    type Msg = { tag: "Inc" };
    const instance = app<{ n: number }, Msg>({
      init: noFx({ n: 0 }),
      update: (s) => noFx({ n: s.n + 1 }),
      view: (s) => h("div", {}, String(s.n)),
      node: root,
      debug: { history: true },
    });

    instance.dispatch({ tag: "Inc" });
    instance.dispatch({ tag: "Inc" });
    instance.goBack();
    instance.goForward();
    await flush();

    expect(instance.getState().n).toBe(2);
  });

  it("jumpTo goes to specific index", async () => {
    type Msg = { tag: "Inc" };
    const instance = app<{ n: number }, Msg>({
      init: noFx({ n: 0 }),
      update: (s) => noFx({ n: s.n + 1 }),
      view: (s) => h("div", {}, String(s.n)),
      node: root,
      debug: { history: true },
    });

    instance.dispatch({ tag: "Inc" });
    instance.dispatch({ tag: "Inc" });
    instance.dispatch({ tag: "Inc" });
    instance.jumpTo(0);
    await flush();

    expect(instance.getState().n).toBe(0);
    expect(root.textContent).toBe("0");
  });

  it("respects maxHistory", () => {
    type Msg = { tag: "Inc" };
    const instance = app<{ n: number }, Msg>({
      init: noFx({ n: 0 }),
      update: (s) => noFx({ n: s.n + 1 }),
      view: (s) => h("div", {}, String(s.n)),
      node: root,
      debug: { history: true, maxHistory: 3 },
    });

    for (let i = 0; i < 10; i++) instance.dispatch({ tag: "Inc" });
    expect(instance.getHistory().length).toBeLessThanOrEqual(3);
  });
});

describe("subscriptions", () => {
  it("starts subscriptions on boot", () => {
    let started = false;
    type Msg = { tag: "X" };

    app<{ n: number }, Msg>({
      init: noFx({ n: 0 }),
      update: (s) => noFx(s),
      view: (s) => h("div", {}, String(s.n)),
      subscriptions: () => [
        [(_d: Dispatch<Msg>, _p: any) => { started = true; return () => { }; }, {}] as unknown as Sub<Msg>,
      ],
      node: root,
    });

    expect(started).toBe(true);
  });

  it("stops subscriptions on state change when removed", async () => {
    let stopped = false;
    type Msg = { tag: "Disable" };

    const instance = app<{ active: boolean }, Msg>({
      init: noFx({ active: true }),
      update: () => noFx({ active: false }),
      view: (s) => h("div", {}, String(s.active)),
      subscriptions: (s) => [
        s.active && ([(_d: Dispatch<Msg>, _p: any) => { return () => { stopped = true; }; }, {}] as unknown as Sub<Msg>),
      ],
      node: root,
    });

    expect(stopped).toBe(false);
    instance.dispatch({ tag: "Disable" });
    expect(stopped).toBe(true);
  });

  it("restarts subscriptions when callback props change", async () => {
    const events: string[] = [];
    type Msg = { tag: "Swap" };

    const instance = app<{ version: number }, Msg>({
      init: noFx({ version: 1 }),
      update: (s) => noFx({ version: s.version + 1 }),
      view: () => h("div"),
      subscriptions: (s) => [
        [(_dispatch: Dispatch<Msg>, props: { handler: () => number }) => {
          events.push(`start:${props.handler()}`);
          return () => events.push(`stop:${props.handler()}`);
        }, { handler: () => s.version }] as unknown as Sub<Msg>,
      ],
      node: root,
    });

    expect(events).toEqual(["start:1"]);

    instance.dispatch({ tag: "Swap" });
    await flush();

    expect(events).toEqual(["start:1", "stop:1", "start:2"]);
  });

  it("cleans up subscriptions on destroy", () => {
    let cleaned = false;
    type Msg = never;

    const instance = app<{ n: number }, Msg>({
      init: noFx({ n: 0 }),
      update: (s) => noFx(s),
      view: () => h("div"),
      subscriptions: () => [
        [() => () => { cleaned = true; }, {}] as unknown as Sub<Msg>,
      ],
      node: root,
    });

    instance.destroy();
    expect(cleaned).toBe(true);
  });
});

describe("middleware", () => {
  it("wraps dispatch", async () => {
    const log: string[] = [];
    type Msg = { tag: "A" } | { tag: "B" };

    const instance = app<{ n: number }, Msg>({
      init: noFx({ n: 0 }),
      update: (s) => noFx({ n: s.n + 1 }),
      view: (s) => h("div", {}, String(s.n)),
      node: root,
      middleware: (next) => (msg) => {
        log.push((msg as any).tag);
        next(msg);
      },
    });

    instance.dispatch({ tag: "A" });
    instance.dispatch({ tag: "B" });

    expect(log).toEqual(["A", "B"]);
  });
});

describe("resolveClass()", () => {
  it("ignores inherited properties from prototype chain", () => {
    const input = Object.create({ hidden: true });
    input.visible = true;

    expect(resolveClass(input)).toBe("visible");
  });
});

describe("withFx / noFx", () => {
  it("noFx wraps state in tuple", () => {
    const result = noFx({ n: 1 });
    expect(result[0]).toEqual({ n: 1 });
    expect(result[1]).toEqual([] as any);
    expect(Array.isArray(result)).toBe(true);
  });

  it("withFx creates state + effects tuple", () => {
    const fx: Effect<string> = [() => { }, null];
    const result = withFx<{ n: number }, string>({ n: 1 }, fx);
    expect(result[0]).toEqual({ n: 1 });
    expect(result[1] as readonly Effect<string>[]).toEqual([fx]);
  });
});
