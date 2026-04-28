import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { app, h, text, noFx, type Dispatch } from "../src/teelm";
import { createRouter, page, route, routerApp, type PageConfig, str } from "../src/router";

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

describe("Router Integration & View Rendering", () => {
  interface Shared { user: string; }
  
  const CounterPage: PageConfig<{ count: number }, "Inc", Shared, { id: string }> = {
    init: () => noFx({ count: 0 }),
    update: (m, msg) => {
      if (msg === "Inc") return noFx({ count: m.count + 1 });
      return noFx(m);
    },
    view: (m, shared, dispatch) => h("div", { id: "page-counter" }, [
      h("h1", {}, `User: ${shared.user}`),
      h("p", { id: "count-val" }, String(m.count)),
      h("button", { id: "inc-btn", onClick: () => dispatch("Inc") }, "Increment")
    ]),
  };

  const AboutPage: PageConfig<{}, never, Shared, {}> = {
    init: () => noFx({}),
    update: (m) => noFx(m),
    view: (_, shared) => h("div", { id: "page-about" }, `About ${shared.user}`),
  };

  it("renders the correct page and responds to model changes", async () => {
    const router = createRouter<Shared>({
      routes: [
        page(route("/counter/:id", { id: str }), CounterPage),
        page(route("/about"), AboutPage),
      ],
      shared: { user: "Alice" }
    });

    const instance = routerApp({
      router,
      layout: (content) => h("main", { id: "layout" }, content),
      node: root,
      url: new URL("http://localhost/counter/1"),
      listen: false
    });

    // Initial render check
    expect(root.querySelector("h1")?.textContent).toBe("User: Alice");
    expect(root.querySelector("#count-val")?.textContent).toBe("0");

    // Trigger model change within page
    const btn = root.querySelector<HTMLButtonElement>("#inc-btn")!;
    btn.click();
    await flush();

    // Verify view re-rendered with new model
    expect(root.querySelector("#count-val")?.textContent).toBe("1");

    // Change route
    instance.dispatch({ tag: "@@router/UrlChanged", url: new URL("http://localhost/about") });
    await flush();

    // Verify new page rendered
    expect(root.querySelector("#page-about")).not.toBeNull();
    expect(root.querySelector("#page-about")?.textContent).toBe("About Alice");
    expect(root.querySelector("#page-counter")).toBeNull();

    // Change shared state and check view update
    instance.dispatch(router.updateShared(s => ({ ...s, user: "Bob" })));
    await flush();
    expect(root.querySelector("#page-about")?.textContent).toBe("About Bob");
  });

  it("preserves state when navigating back (if caching is enabled via save/load)", async () => {
    const CachedCounter: PageConfig<{ count: number }, "Inc", Shared, { id: string }> = {
      ...CounterPage,
      save: (m) => m,
      load: (saved) => noFx(saved as { count: number })
    };

    const router = createRouter<Shared>({
      routes: [
        page(route("/counter/:id", { id: str }), CachedCounter),
        page(route("/about"), AboutPage),
      ],
      shared: { user: "Alice" }
    });

    const instance = routerApp({
      router,
      layout: (c) => c,
      node: root,
      url: new URL("http://localhost/counter/1"),
      listen: false
    });

    // Increment to 5
    const btn = () => root.querySelector<HTMLButtonElement>("#inc-btn")!;
    for(let i=0; i<5; i++) {
        btn().click();
        await flush();
    }
    expect(root.querySelector("#count-val")?.textContent).toBe("5");

    // Navigate away
    instance.dispatch({ tag: "@@router/UrlChanged", url: new URL("http://localhost/about") });
    await flush();
    expect(root.querySelector("#page-about")).not.toBeNull();

    // Navigate back to same ID
    instance.dispatch({ tag: "@@router/UrlChanged", url: new URL("http://localhost/counter/1") });
    await flush();
    
    // Should be restored to 5
    expect(root.querySelector("#count-val")?.textContent).toBe("5");

    // Navigate to different ID
    instance.dispatch({ tag: "@@router/UrlChanged", url: new URL("http://localhost/counter/2") });
    await flush();
    
    // Should be fresh (0)
    expect(root.querySelector("#count-val")?.textContent).toBe("0");
  });
});
