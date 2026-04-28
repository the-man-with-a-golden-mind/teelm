import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { app, h, text, withFx, noFx, type Cmd, type Dispatch, type Effect } from "../src/teelm";

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

describe("Edge Cases & Border Cases", () => {
  describe("SSR Hydration (recycleNode)", () => {
    it("hydrates existing DOM", async () => {
      root.innerHTML = '<div id="ssr"><span>hello</span></div>';
      const ssrNode = root.firstChild!;

      app<{ text: string }, any>({
        init: noFx({ text: "hello" }),
        update: (s) => noFx(s),
        view: (s) => h("div", { id: "ssr" }, h("span", {}, s.text)),
        node: root,
      });

      expect(root.firstChild).toBe(ssrNode);
      expect(root.querySelector("span")?.textContent).toBe("hello");
    });

    it("handles hydration mismatch by replacing", () => {
       root.innerHTML = '<div id="ssr"><p>wrong</p></div>';
       app<{}, any>({
         init: noFx({}),
         update: (s) => noFx(s),
         view: () => h("div", { id: "ssr" }, h("span", {}, "correct")),
         node: root
       });

       expect(root.querySelector("span")).not.toBeNull();
       expect(root.querySelector("p")).toBeNull();
    });
  });

  describe("Boolean Attributes", () => {
    it("handles disabled, checked, required", async () => {
      const inst = app<{ disabled: boolean }, boolean>({
        init: noFx({ disabled: true }),
        update: (_s, v) => noFx({ disabled: v }),
        view: (s) => h("button", { id: "btn", disabled: s.disabled }, "click"),
        node: root
      });

      const btn = root.querySelector<HTMLButtonElement>("#btn")!;
      expect(btn.disabled).toBe(true);

      inst.dispatch(false);
      await flush();
      expect(btn.disabled).toBe(false);
    });
  });

  describe("Complex Keyed Moves", () => {
    it("handles shifting items from end to start", async () => {
      const items = ["a", "b", "c", "d"];
      const inst = app<{ items: string[] }, any>({
        init: noFx({ items }),
        update: (s, msg) => {
          if (msg.tag === "Set") return noFx({ items: msg.items });
          return noFx(s);
        },
        view: (s) => h("ul", {}, s.items.map((i: any) => h("li", { key: i }, i))),
        node: root
      });

      const liB = root.querySelectorAll("li")[1]!;
      expect(liB.textContent).toBe("b");

      inst.dispatch({ tag: "Set", items: ["d", "a", "b", "c"] });
      await flush();

      const lis = root.querySelectorAll("li");
      expect(lis[0]!.textContent).toBe("d");
      expect(lis[1]!.textContent).toBe("a");
      expect(lis[2]!.textContent).toBe("b");
      expect(lis[2]).toBe(liB);
    });

    it("handles swapping two items in middle", async () => {
      const inst = app<{ items: string[] }, any>({
        init: noFx({ items: ["a", "b", "c", "d"] }),
        update: (s, msg) => {
          if (msg.tag === "Set") return noFx({ items: msg.items });
          return noFx(s);
        },
        view: (s) => h("ul", {}, s.items.map((i: any) => h("li", { key: i }, i))),
        node: root
      });

      const liB = root.querySelectorAll("li")[1];
      const liC = root.querySelectorAll("li")[2];

      inst.dispatch({ tag: "Set", items: ["a", "c", "b", "d"] });
      await flush();

      const lis = root.querySelectorAll("li");
      expect(lis[1]!.textContent).toBe("c");
      expect(lis[2]!.textContent).toBe("b");
      expect(lis[1]).toBe(liC);
      expect(lis[2]).toBe(liB);
    });
  });

  describe("Multiple Effects in Init", () => {
    it("executes all initial effects", () => {
      let count = 0;
      const fx: Effect<any> = [(d) => { count++; }, null];

      app<{}, any>({
        init: [{}, [fx, fx, fx] as unknown as Cmd<any>],
        update: (s) => noFx(s),
        view: () => h("div"),
        node: root
      });

      expect(count).toBe(3);
    });
  });

  describe("Security Hardening", () => {
    it("blocks innerHTML", () => {
      app<{}, any>({
        init: noFx({}),
        update: (s) => noFx(s),
        view: () => h("div", { id: "pwn", innerHTML: "<img src=x onerror=alert(1)>" }),
        node: root
      });
      expect(root.querySelector("#pwn")?.innerHTML).toBe("");
    });

    it("sanitizes dangerous protocols", () => {
      app<{}, any>({
        init: noFx({}),
        update: (s) => noFx(s),
        view: () => h("a", { id: "link", href: "javascript:alert(1)" }),
        node: root
      });
      expect(root.querySelector<HTMLAnchorElement>("#link")?.getAttribute("href")).toBe("about:blank");
    });
  });

  describe("Dispatch Edge Cases", () => {
    it("handles empty array dispatch", async () => {
      let count = 0;
      const inst = app<number, any>({
        init: noFx(0),
        update: (s) => { count++; return noFx(s + 1); },
        view: (s) => h("div", {}, String(s)),
        node: root
      });
      inst.dispatch([]);
      await flush();
      expect(count).toBe(0);
    });
  });

  describe("Style Edge Cases", () => {
    it("handles CSS variables", () => {
      app<{}, any>({
        init: noFx({}),
        update: (s) => noFx(s),
        view: () => h("div", { style: { "--var": "red" } }),
        node: root
      });
      const div = root.querySelector<HTMLElement>("div")!;
      expect(div.style.getPropertyValue("--var")).toBe("red");
    });
  });
});
