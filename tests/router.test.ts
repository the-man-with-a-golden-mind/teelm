import { describe, it, expect, beforeEach } from "bun:test";
import {
  str, int, float, oneOf, q, route, routerLink,
  page, createRouter,
  type PageConfig, type RouterModel, type RouterMsg, type Router,
  matchRoute, onRoute, type Route,
} from "../src/router";
import { h, type VNode, type Cmd, type Effect } from "../src/hyperapp";

// ══════════════════════════════════════════════════════════════
// Helper: unwrap init/update result
// ══════════════════════════════════════════════════════════════

function model<S>(r: S | readonly [S, any]): S {
  return Array.isArray(r) ? r[0] : r;
}

function effects<M>(r: any): Effect<M>[] {
  return Array.isArray(r) ? r[1] : [];
}

// ══════════════════════════════════════════════════════════════
// 1. Path segment parsers
// ══════════════════════════════════════════════════════════════

describe("str parser", () => {
  it("parses any non-empty string", () => {
    expect(str.parse("hello")).toBe("hello");
    expect(str.parse("42")).toBe("42");
    expect(str.parse("a/b")).toBe("a/b");
  });

  it("parses empty string", () => {
    expect(str.parse("")).toBe("");
  });

  it("has correct _tag", () => {
    expect(str._tag).toBe("path");
  });
});

describe("int parser", () => {
  it("parses positive integers", () => {
    expect(int.parse("42")).toBe(42);
    expect(int.parse("0")).toBe(0);
    expect(int.parse("999999")).toBe(999999);
  });

  it("parses negative integers", () => {
    expect(int.parse("-5")).toBe(-5);
    expect(Object.is(int.parse("-0"), -0)).toBe(true);
  });

  it("accepts numeric strings whose numeric value is an integer", () => {
    expect(int.parse("1.0")).toBe(1);
  });

  it("rejects non-integer numbers", () => {
    expect(int.parse("3.14")).toBeNull();
    expect(int.parse("1.5")).toBeNull();
  });

  it("rejects non-numeric strings", () => {
    expect(int.parse("abc")).toBeNull();
    expect(int.parse("12x")).toBeNull();
    expect(int.parse("x12")).toBeNull();
  });

  it("rejects empty string", () => {
    expect(int.parse("")).toBeNull();
  });

  it("rejects special values", () => {
    expect(int.parse("NaN")).toBeNull();
    expect(int.parse("Infinity")).toBeNull();
    expect(int.parse("-Infinity")).toBeNull();
  });
});

describe("float parser", () => {
  it("parses floats", () => {
    expect(float.parse("3.14")).toBe(3.14);
    expect(float.parse("0.5")).toBe(0.5);
    expect(float.parse("-1.5")).toBe(-1.5);
  });

  it("parses integers as floats", () => {
    expect(float.parse("42")).toBe(42);
    expect(float.parse("0")).toBe(0);
  });

  it("rejects non-numeric", () => {
    expect(float.parse("abc")).toBeNull();
    expect(float.parse("")).toBeNull();
  });

  it("rejects Infinity and NaN", () => {
    expect(float.parse("Infinity")).toBeNull();
    expect(float.parse("-Infinity")).toBeNull();
    expect(float.parse("NaN")).toBeNull();
  });
});

describe("oneOf parser", () => {
  const p = oneOf(["active", "inactive", "banned"] as const);

  it("matches valid values", () => {
    expect(p.parse("active")).toBe("active");
    expect(p.parse("inactive")).toBe("inactive");
    expect(p.parse("banned")).toBe("banned");
  });

  it("rejects invalid values", () => {
    expect(p.parse("other")).toBeNull();
    expect(p.parse("")).toBeNull();
    expect(p.parse("ACTIVE")).toBeNull(); // case sensitive
  });
});

// ══════════════════════════════════════════════════════════════
// 2. Query param parsers
// ══════════════════════════════════════════════════════════════

describe("q.str", () => {
  it("returns value when present", () => {
    expect(q.str("default").parse("hello")).toBe("hello");
    expect(q.str("default").parse("")).toBe("");
  });

  it("returns fallback when null", () => {
    expect(q.str("default").parse(null)).toBe("default");
    expect(q.str("").parse(null)).toBe("");
  });
});

describe("q.int", () => {
  it("parses valid integers", () => {
    expect(q.int(1).parse("5")).toBe(5);
    expect(q.int(1).parse("0")).toBe(0);
    expect(q.int(1).parse("-3")).toBe(-3);
  });

  it("returns fallback for non-integers", () => {
    expect(q.int(1).parse("abc")).toBe(1);
    expect(q.int(1).parse("3.14")).toBe(1);
    expect(q.int(99).parse("Infinity")).toBe(99);
  });

  it("returns fallback when null", () => {
    expect(q.int(1).parse(null)).toBe(1);
    expect(q.int(0).parse(null)).toBe(0);
  });
});

describe("q.float", () => {
  it("parses valid floats", () => {
    expect(q.float(0).parse("3.14")).toBe(3.14);
    expect(q.float(0).parse("42")).toBe(42);
  });

  it("returns fallback for invalid", () => {
    expect(q.float(0).parse("abc")).toBe(0);
    expect(q.float(0).parse(null)).toBe(0);
    expect(q.float(1.5).parse("Infinity")).toBe(1.5);
  });
});

describe("q.bool", () => {
  it("parses true values", () => {
    expect(q.bool(false).parse("true")).toBe(true);
    expect(q.bool(false).parse("1")).toBe(true);
  });

  it("parses false values", () => {
    expect(q.bool(true).parse("false")).toBe(false);
    expect(q.bool(true).parse("0")).toBe(false);
    expect(q.bool(true).parse("anything")).toBe(false);
  });

  it("returns fallback when null", () => {
    expect(q.bool(false).parse(null)).toBe(false);
    expect(q.bool(true).parse(null)).toBe(true);
  });
});

describe("q.optional.str", () => {
  it("returns value when present", () => {
    expect(q.optional.str().parse("hello")).toBe("hello");
    expect(q.optional.str().parse("")).toBe("");
  });

  it("returns undefined when null", () => {
    expect(q.optional.str().parse(null)).toBeUndefined();
  });
});

describe("q.optional.int", () => {
  it("returns number when valid", () => {
    expect(q.optional.int().parse("42")).toBe(42);
    expect(q.optional.int().parse("0")).toBe(0);
  });

  it("returns undefined when null or invalid", () => {
    expect(q.optional.int().parse(null)).toBeUndefined();
    expect(q.optional.int().parse("abc")).toBeUndefined();
    expect(q.optional.int().parse("3.14")).toBeUndefined();
  });
});

// ══════════════════════════════════════════════════════════════
// 3. route() — parse()
// ══════════════════════════════════════════════════════════════

describe("route().parse()", () => {
  it("matches root path", () => {
    expect(route("/").parse("/")).toEqual({});
  });

  it("root does not match non-root", () => {
    expect(route("/").parse("/about")).toBeNull();
  });

  it("matches static path", () => {
    expect(route("/about").parse("/about")).toEqual({});
  });

  it("matches multi-segment static", () => {
    expect(route("/about/team").parse("/about/team")).toEqual({});
  });

  it("rejects partial matches", () => {
    expect(route("/about/team").parse("/about")).toBeNull();
    expect(route("/about").parse("/about/team")).toBeNull();
  });

  it("extracts str param", () => {
    const r = route("/users/:id", { id: str });
    expect(r.parse("/users/alice")).toEqual({ id: "alice" });
    expect(r.parse("/users/42")).toEqual({ id: "42" });
  });

  it("extracts int param", () => {
    const r = route("/users/:id", { id: int });
    expect(r.parse("/users/42")).toEqual({ id: 42 });
  });

  it("rejects when int param is not integer", () => {
    const r = route("/users/:id", { id: int });
    expect(r.parse("/users/abc")).toBeNull();
    expect(r.parse("/users/3.14")).toBeNull();
  });

  it("extracts float param", () => {
    const r = route("/price/:amount", { amount: float });
    expect(r.parse("/price/9.99")).toEqual({ amount: 9.99 });
    expect(r.parse("/price/10")).toEqual({ amount: 10 });
    expect(r.parse("/price/abc")).toBeNull();
  });

  it("extracts oneOf param", () => {
    const r = route("/filter/:status", { status: oneOf(["active", "done"] as const) });
    expect(r.parse("/filter/active")).toEqual({ status: "active" });
    expect(r.parse("/filter/done")).toEqual({ status: "done" });
    expect(r.parse("/filter/other")).toBeNull();
  });

  it("extracts multiple params", () => {
    const r = route("/users/:userId/posts/:postId", { userId: str, postId: int });
    expect(r.parse("/users/alice/posts/7")).toEqual({ userId: "alice", postId: 7 });
  });

  it("rejects if any param fails", () => {
    const r = route("/users/:userId/posts/:postId", { userId: str, postId: int });
    expect(r.parse("/users/alice/posts/abc")).toBeNull();
  });

  it("rejects wrong segment count", () => {
    const r = route("/users/:id", { id: str });
    expect(r.parse("/users")).toBeNull();
    expect(r.parse("/users/a/b")).toBeNull();
  });

  it("param without parser falls back to string", () => {
    const r = route("/users/:id"); // no spec
    expect(r.parse("/users/42")).toEqual({ id: "42" });
  });

  it("parses query params only", () => {
    const r = route("/search", { query: q.str(""), page: q.int(1) });
    expect(r.parse("/search", "?query=hello&page=3")).toEqual({ query: "hello", page: 3 });
  });

  it("query params use fallback when missing", () => {
    const r = route("/search", { query: q.str(""), page: q.int(1) });
    expect(r.parse("/search")).toEqual({ query: "", page: 1 });
    expect(r.parse("/search", "")).toEqual({ query: "", page: 1 });
  });

  it("query params use fallback for invalid values", () => {
    const r = route("/search", { page: q.int(1) });
    expect(r.parse("/search", "?page=abc")).toEqual({ page: 1 });
  });

  it("mixes path and query params", () => {
    const r = route("/users/:id", { id: str, tab: q.str("overview") });
    expect(r.parse("/users/42", "?tab=posts")).toEqual({ id: "42", tab: "posts" });
    expect(r.parse("/users/42")).toEqual({ id: "42", tab: "overview" });
  });

  it("handles wildcard", () => {
    expect(route("/files/*").parse("/files/a/b/c")).toEqual({ "*": "a/b/c" });
    expect(route("/files/*").parse("/files/")).toEqual({ "*": "" });
  });

  it("wildcard rejects shorter paths", () => {
    expect(route("/files/*").parse("/other")).toBeNull();
  });

  it("normalizes trailing slashes", () => {
    expect(route("/about").parse("/about/")).toEqual({});
    expect(route("/about/").parse("/about")).toEqual({});
  });

  it("normalizes redundant slashes", () => {
    expect(route("//about//").parse("///about///")).toEqual({});
  });

  it("decodes URI components", () => {
    const r = route("/search/:q", { q: str });
    expect(r.parse("/search/hello%20world")).toEqual({ q: "hello world" });
  });

  it("returns null on malformed URI encoding", () => {
    const r = route("/search/:q", { q: str });
    expect(r.parse("/search/%E0%A4%A")).toBeNull();
  });

  it("path matching is case sensitive", () => {
    expect(route("/About").parse("/about")).toBeNull();
    expect(route("/about").parse("/About")).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════
// 4. route().toUrl()
// ══════════════════════════════════════════════════════════════

describe("route().toUrl()", () => {
  it("generates root URL", () => {
    expect(route("/").toUrl({})).toBe("/");
  });

  it("generates static URL", () => {
    expect(route("/about").toUrl({})).toBe("/about");
    expect(route("/about/team").toUrl({})).toBe("/about/team");
  });

  it("generates URL with str param", () => {
    expect(route("/users/:id", { id: str }).toUrl({ id: "42" })).toBe("/users/42");
  });

  it("generates URL with int param", () => {
    expect(route("/users/:id", { id: int }).toUrl({ id: 42 })).toBe("/users/42");
  });

  it("generates URL with multiple params", () => {
    const r = route("/users/:uid/posts/:pid", { uid: str, pid: int });
    expect(r.toUrl({ uid: "alice", pid: 7 })).toBe("/users/alice/posts/7");
  });

  it("encodes special characters", () => {
    const r = route("/search/:q", { q: str });
    expect(r.toUrl({ q: "hello world" })).toBe("/search/hello%20world");
    expect(r.toUrl({ q: "a/b" })).toBe("/search/a%2Fb");
  });

  it("generates URL with query params", () => {
    const r = route("/search", { query: q.str(""), page: q.int(1) });
    const url = r.toUrl({ query: "foo", page: 3 });
    expect(url).toContain("/search?");
    expect(url).toContain("query=foo");
    expect(url).toContain("page=3");
  });

  it("generates URL with mixed params", () => {
    const r = route("/users/:id", { id: str, tab: q.str("overview") });
    expect(r.toUrl({ id: "42", tab: "posts" })).toBe("/users/42?tab=posts");
  });

  it("omits query params that are null/undefined", () => {
    const r = route("/search", { q: q.optional.str() });
    expect(r.toUrl({ q: undefined })).toBe("/search");
  });

  it("stores pattern", () => {
    expect(route("/users/:id", { id: str }).pattern).toBe("/users/:id");
    expect(route("/").pattern).toBe("/");
  });
});

// ══════════════════════════════════════════════════════════════
// 5. page() binding
// ══════════════════════════════════════════════════════════════

describe("page()", () => {
  const cfg: PageConfig<{}, never, {}, {}> = {
    init: () => ({}), update: (m) => m, view: () => h("div", {}),
  };

  it("creates PageRoute with _tag", () => {
    expect(page(route("/"), cfg)._tag).toBe("page-route");
  });

  it("stores routeDef reference", () => {
    const r = route("/");
    expect(page(r, cfg)._routeDef).toBe(r);
  });

  it("stores config reference", () => {
    expect(page(route("/"), cfg)._config).toBe(cfg);
  });

  it("guard is undefined by default", () => {
    expect(page(route("/"), cfg)._guard).toBeUndefined();
  });

  it("stores guard when provided", () => {
    const guard = () => true as const;
    expect(page(route("/"), cfg, { guard })._guard).toBe(guard);
  });
});

// ══════════════════════════════════════════════════════════════
// Test infrastructure
// ══════════════════════════════════════════════════════════════

interface TestShared { user: string | null; }

function simplePage<P extends Record<string, any>>(
  label: string,
): PageConfig<{ label: string; params: P }, string, TestShared, P> {
  return {
    init: (params) => ({ label, params }),
    update: (m, msg) => ({ ...m, label: msg }),
    view: (m, shared) => h("div", {}, `${m.label}:${shared.user}`),
    subscriptions: () => [],
  };
}

const notFoundCfg: PageConfig<{ path: string }, never, TestShared, { path: string }> = {
  init: (p) => p,
  update: (m) => m,
  view: (m) => h("div", {}, `404:${m.path}`),
};

function makeRouter() {
  return createRouter<TestShared>({
    routes: [
      page(route("/"), simplePage("home")),
      page(route("/about"), simplePage("about")),
      page(route("/users"), simplePage("users")),
      page(route("/users/:id", { id: str }), simplePage<{ id: string }>("user")),
      page(route("/users/:id/posts/:pid", { id: str, pid: int }), simplePage<{ id: string; pid: number }>("post")),
    ],
    shared: { user: null },
    notFound: notFoundCfg,
  });
}

const U = (path: string) => new URL(`http://localhost${path}`);

// ══════════════════════════════════════════════════════════════
// 6. createRouter — init()
// ══════════════════════════════════════════════════════════════

describe("router.init()", () => {
  let router: Router<TestShared>;
  beforeEach(() => { router = makeRouter(); });

  it("resolves root to first matching route", () => {
    const m = model(router.init(U("/")));
    expect(m._page!.routeIdx).toBe(0);
    expect((m._page!.model as any).label).toBe("home");
  });

  it("resolves static route", () => {
    const m = model(router.init(U("/about")));
    expect(m._page!.routeIdx).toBe(1);
  });

  it("resolves route with string param", () => {
    const m = model(router.init(U("/users/42")));
    expect(m._page!.routeIdx).toBe(3);
    expect(m._page!.params).toEqual({ id: "42" });
  });

  it("resolves route with multiple params", () => {
    const m = model(router.init(U("/users/alice/posts/7")));
    expect(m._page!.routeIdx).toBe(4);
    expect(m._page!.params).toEqual({ id: "alice", pid: 7 });
  });

  it("resolves to notFound for unmatched URL", () => {
    const m = model(router.init(U("/nonexistent")));
    expect(m._page!.routeIdx).toBe(-1);
    expect((m._page!.model as any).path).toBe("/nonexistent");
  });

  it("initializes shared state", () => {
    const m = model(router.init(U("/")));
    expect(m.shared).toEqual({ user: null });
  });

  it("initializes URL", () => {
    const m = model(router.init(U("/about")));
    expect(m.url.pathname).toBe("/about");
  });

  it("initializes empty cache", () => {
    const m = model(router.init(U("/")));
    expect(m._cache.size).toBe(0);
  });

  it("returns effects from page init", () => {
    let ran = false;
    const withFx: PageConfig<string, string, {}, {}> = {
      init: () => ["m", [[(d: any) => { ran = true; d("ok"); }, null]]] as const,
      update: (m, msg) => msg,
      view: (m) => h("div", {}, m),
    };
    const r = createRouter<{}>({ routes: [page(route("/"), withFx)], shared: {} });
    const result = r.init(U("/"));
    expect(Array.isArray(result)).toBe(true);
    const fx = effects(result);
    expect(fx).toHaveLength(1);
    fx[0]![0]((msg: any) => expect(msg.tag).toBe("@@router/PageMsg"), fx[0]![1]);
    expect(ran).toBe(true);
  });

  it("returns a replace navigation effect when init guard redirects", () => {
    const r = createRouter<TestShared>({
      routes: [
        page(route("/login"), simplePage("login")),
        page(route("/admin"), simplePage("admin"), { guard: () => "/login?from=admin" }),
      ],
      shared: { user: null },
    });

    const result = r.init(U("/admin"));
    expect(Array.isArray(result)).toBe(true);

    const m = model(result);
    expect(m.url.pathname).toBe("/login");
    expect(m.url.search).toBe("?from=admin");
    expect((m._page!.model as any).label).toBe("login");

    const fx = effects(result);
    expect(fx).toHaveLength(1);
    expect(fx[0]![1]).toEqual({ url: "/login?from=admin", replace: true });
  });

  it("returns no effects when page init is plain model", () => {
    const m = router.init(U("/"));
    expect(Array.isArray(m)).toBe(false);
  });

  it("without notFound config, _page is null for unmatched", () => {
    const r = createRouter<{}>({ routes: [], shared: {} });
    const m = model(r.init(U("/xyz")));
    expect(m._page).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════
// 7. router.update() — UrlChanged
// ══════════════════════════════════════════════════════════════

describe("router.update() — UrlChanged", () => {
  let router: Router<TestShared>;
  beforeEach(() => { router = makeRouter(); });

  const urlChanged = (path: string): RouterMsg<TestShared> => ({
    tag: "@@router/UrlChanged", url: U(path),
  });

  it("transitions from one page to another", () => {
    const m1 = model(router.init(U("/")));
    const m2 = model(router.update(m1, urlChanged("/about")));
    expect(m2._page!.routeIdx).toBe(1);
    expect((m2._page!.model as any).label).toBe("about");
  });

  it("CRITICAL: same URL returns exact same model reference", () => {
    const m1 = model(router.init(U("/")));
    const result = router.update(m1, urlChanged("/"));
    expect(result).toBe(m1); // same reference — prevents infinite re-render
  });

  it("CRITICAL: same route different params creates new page", () => {
    const m1 = model(router.init(U("/users/1")));
    const m2 = model(router.update(m1, urlChanged("/users/2")));
    expect(m2._page!.params).toEqual({ id: "2" });
    expect(m2).not.toBe(m1);
  });

  it("re-initializes when only the query string changes", () => {
    const r = createRouter<{}>({
      routes: [
        page(route("/search", { term: q.str("") }), {
          init: (params) => ({ term: params.term }),
          update: (m: any) => m,
          view: () => h("div", {}),
        }),
      ],
      shared: {},
    });

    const m1 = model(r.init(U("/search?term=alpha")));
    const m2 = model(r.update(m1, { tag: "@@router/UrlChanged", url: U("/search?term=beta") }));

    expect(m2).not.toBe(m1);
    expect(m2.url.search).toBe("?term=beta");
    expect(m2._page!.key).toBe("/search?term=beta");
    expect(m2._page!.params).toEqual({ term: "beta" });
    expect(m2._page!.model).toEqual({ term: "beta" });
  });

  it("transitions to notFound", () => {
    const m1 = model(router.init(U("/")));
    const m2 = model(router.update(m1, urlChanged("/xyz")));
    expect(m2._page!.routeIdx).toBe(-1);
  });

  it("transitions from notFound to valid page", () => {
    const m1 = model(router.init(U("/xyz")));
    expect(m1._page!.routeIdx).toBe(-1);
    const m2 = model(router.update(m1, urlChanged("/")));
    expect(m2._page!.routeIdx).toBe(0);
  });

  it("transitions between two different dynamic routes", () => {
    const m1 = model(router.init(U("/users/1")));
    const m2 = model(router.update(m1, urlChanged("/users/alice/posts/5")));
    expect(m2._page!.routeIdx).toBe(4);
    expect(m2._page!.params).toEqual({ id: "alice", pid: 5 });
  });

  it("multiple sequential navigations", () => {
    let m = model(router.init(U("/")));
    m = model(router.update(m, urlChanged("/about")));
    expect((m._page!.model as any).label).toBe("about");
    m = model(router.update(m, urlChanged("/users")));
    expect((m._page!.model as any).label).toBe("users");
    m = model(router.update(m, urlChanged("/users/42")));
    expect(m._page!.params).toEqual({ id: "42" });
    m = model(router.update(m, urlChanged("/")));
    expect((m._page!.model as any).label).toBe("home");
  });

  it("returns init effects from new page", () => {
    let ran = false;
    const withFx: PageConfig<string, string, TestShared, {}> = {
      init: () => ["m", [[(d: any) => { ran = true; }, null]]] as const,
      update: (m) => m, view: () => h("div", {}),
    };
    const r = createRouter<TestShared>({
      routes: [
        page(route("/"), simplePage("home")),
        page(route("/fx"), withFx),
      ],
      shared: { user: null },
    });
    const m1 = model(r.init(U("/")));
    const result = r.update(m1, urlChanged("/fx"));
    const fx = effects(result);
    expect(fx).toHaveLength(1);
    fx[0]![0](() => {}, fx[0]![1]);
    expect(ran).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════
// 8. router.update() — PageMsg
// ══════════════════════════════════════════════════════════════

describe("router.update() — PageMsg", () => {
  let router: Router<TestShared>;
  beforeEach(() => { router = makeRouter(); });

  const pageMsg = (msg: any): RouterMsg<TestShared> => ({
    tag: "@@router/PageMsg", msg,
  });

  it("forwards to active page update", () => {
    const m1 = model(router.init(U("/")));
    const m2 = model(router.update(m1, pageMsg("new-label")));
    expect((m2._page!.model as any).label).toBe("new-label");
  });

  it("preserves other model fields", () => {
    const m1 = model(router.init(U("/")));
    const m2 = model(router.update(m1, pageMsg("x")));
    expect(m2.shared).toEqual(m1.shared);
    expect(m2.url).toBe(m1.url);
    expect(m2._page!.routeIdx).toBe(m1._page!.routeIdx);
  });

  it("does nothing when _page is null", () => {
    const m: RouterModel<TestShared> = {
      shared: { user: null }, url: U("/"), _page: null, _cache: new Map(),
    };
    expect(router.update(m, pageMsg("x"))).toBe(m);
  });

  it("returns mapped effects from page update", () => {
    let effectRan = false;
    const pageWithUpdateFx: PageConfig<string, string, TestShared, {}> = {
      init: () => "init",
      update: (_m, msg) => [msg, [[(d: any) => { effectRan = true; }, null]]] as const,
      view: (m) => h("div", {}, m),
    };
    const r = createRouter<TestShared>({
      routes: [page(route("/"), pageWithUpdateFx)],
      shared: { user: null },
    });
    const m1 = model(r.init(U("/")));
    const result = r.update(m1, pageMsg("update"));
    expect(Array.isArray(result)).toBe(true);
    const fx = effects(result);
    expect(fx).toHaveLength(1);
    fx[0]![0]((msg: any) => {
      expect(msg.tag).toBe("@@router/PageMsg");
    }, fx[0]![1]);
    expect(effectRan).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════
// 9. router.update() — UpdateShared
// ══════════════════════════════════════════════════════════════

describe("router.update() — UpdateShared", () => {
  let router: Router<TestShared>;
  beforeEach(() => { router = makeRouter(); });

  it("updates shared state", () => {
    const m1 = model(router.init(U("/")));
    const msg = router.updateShared(s => ({ ...s, user: "Alice" }));
    const m2 = model(router.update(m1, msg));
    expect(m2.shared.user).toBe("Alice");
  });

  it("preserves page state", () => {
    const m1 = model(router.init(U("/")));
    const m2 = model(router.update(m1, router.updateShared(s => ({ ...s, user: "Bob" }))));
    expect(m2._page!.model).toEqual(m1._page!.model);
    expect(m2._page!.routeIdx).toBe(m1._page!.routeIdx);
  });

  it("creates correct message", () => {
    const fn = (s: TestShared) => s;
    const msg = router.updateShared(fn);
    expect(msg.tag).toBe("@@router/UpdateShared");
    expect((msg as any).fn).toBe(fn);
  });
});

// ══════════════════════════════════════════════════════════════
// 10. Page lifecycle — save / load / cache
// ══════════════════════════════════════════════════════════════

describe("page lifecycle", () => {
  const urlChanged = (path: string): RouterMsg<any> => ({
    tag: "@@router/UrlChanged", url: U(path),
  });

  it("calls save on exit and init on entry", () => {
    const log: string[] = [];
    const pA: PageConfig<string, never, {}, {}> = {
      init: () => { log.push("A:init"); return "A"; },
      update: (m) => m, view: (m) => h("div", {}, m),
      save: () => { log.push("A:save"); return "saved"; },
    };
    const pB: PageConfig<string, never, {}, {}> = {
      init: () => { log.push("B:init"); return "B"; },
      update: (m) => m, view: (m) => h("div", {}, m),
    };
    const r = createRouter<{}>({ routes: [page(route("/a"), pA), page(route("/b"), pB)], shared: {} });
    const m1 = model(r.init(U("/a")));
    model(r.update(m1, urlChanged("/b")));
    expect(log).toEqual(["A:init", "A:save", "B:init"]);
  });

  it("uses load() on return to cached page", () => {
    const pA: PageConfig<{ n: number }, never, {}, {}> = {
      init: () => ({ n: 0 }),
      update: (m) => m, view: (m) => h("div", {}, String(m.n)),
      save: (m) => m,
      load: (saved) => saved as { n: number },
    };
    const pB: PageConfig<string, never, {}, {}> = {
      init: () => "B", update: (m) => m, view: (m) => h("div", {}, m),
    };
    const r = createRouter<{}>({ routes: [page(route("/a"), pA), page(route("/b"), pB)], shared: {} });

    let m = model(r.init(U("/a")));
    m = { ...m, _page: { ...m._page!, model: { n: 42 } } }; // simulate state change
    m = model(r.update(m, urlChanged("/b"))); // save A
    m = model(r.update(m, urlChanged("/a"))); // load A from cache
    expect((m._page!.model as any).n).toBe(42);
  });

  it("keeps separate cache entries for the same pathname with different queries", () => {
    const r = createRouter<{}>({
      routes: [
        page(route("/search", { term: q.str("") }), {
          init: (params) => ({ term: params.term, visits: 1 }),
          update: (m: any) => m,
          view: () => h("div", {}),
          save: (m: any) => m,
          load: (saved) => saved as { term: string; visits: number },
        }),
      ],
      shared: {},
    });

    let m = model(r.init(U("/search?term=alpha")));
    m = { ...m, _page: { ...m._page!, model: { term: "alpha", visits: 7 } } };
    m = model(r.update(m, urlChanged("/search?term=beta")));
    m = { ...m, _page: { ...m._page!, model: { term: "beta", visits: 9 } } };
    m = model(r.update(m, urlChanged("/search?term=alpha")));
    expect(m._page!.model).toEqual({ term: "alpha", visits: 7 });

    m = model(r.update(m, urlChanged("/search?term=beta")));
    expect(m._page!.model).toEqual({ term: "beta", visits: 9 });
  });

  it("calls init (not load) when save returns undefined", () => {
    const log: string[] = [];
    const pA: PageConfig<string, never, {}, {}> = {
      init: () => { log.push("init"); return "fresh"; },
      update: (m) => m, view: (m) => h("div", {}, m),
      save: () => { log.push("save"); return undefined; },
      load: () => { log.push("load"); return "loaded"; },
    };
    const pB: PageConfig<string, never, {}, {}> = {
      init: () => "B", update: (m) => m, view: (m) => h("div", {}, m),
    };
    const r = createRouter<{}>({ routes: [page(route("/a"), pA), page(route("/b"), pB)], shared: {} });

    let m = model(r.init(U("/a")));
    m = model(r.update(m, urlChanged("/b")));
    m = model(r.update(m, urlChanged("/a")));
    expect(log).toEqual(["init", "save", "init"]); // no "load" because save returned undefined
  });

  it("calls init when page has save but no load", () => {
    const log: string[] = [];
    const pA: PageConfig<string, never, {}, {}> = {
      init: () => { log.push("init"); return "A"; },
      update: (m) => m, view: (m) => h("div", {}, m),
      save: () => "saved-data", // save but no load
    };
    const pB: PageConfig<string, never, {}, {}> = {
      init: () => "B", update: (m) => m, view: (m) => h("div", {}, m),
    };
    const r = createRouter<{}>({ routes: [page(route("/a"), pA), page(route("/b"), pB)], shared: {} });
    let m = model(r.init(U("/a")));
    m = model(r.update(m, urlChanged("/b")));
    m = model(r.update(m, urlChanged("/a")));
    expect(log).toEqual(["init", "init"]); // no load, fresh init
  });

  it("does not call save when page has no save()", () => {
    const pA: PageConfig<string, never, {}, {}> = {
      init: () => "A", update: (m) => m, view: (m) => h("div", {}, m),
      // no save
    };
    const pB: PageConfig<string, never, {}, {}> = {
      init: () => "B", update: (m) => m, view: (m) => h("div", {}, m),
    };
    const r = createRouter<{}>({ routes: [page(route("/a"), pA), page(route("/b"), pB)], shared: {} });
    let m = model(r.init(U("/a")));
    m = model(r.update(m, urlChanged("/b")));
    expect(m._cache.size).toBe(0);
  });

  it("load receives correct params and shared", () => {
    let loadArgs: any;
    const pA: PageConfig<any, never, TestShared, { id: string }> = {
      init: (p) => p,
      update: (m) => m, view: () => h("div", {}),
      save: (m) => m,
      load: (saved, params, shared) => { loadArgs = { saved, params, shared }; return saved; },
    };
    const pB: PageConfig<string, never, TestShared, {}> = {
      init: () => "B", update: (m) => m, view: () => h("div", {}),
    };
    const r = createRouter<TestShared>({
      routes: [page(route("/users/:id", { id: str }), pA), page(route("/b"), pB)],
      shared: { user: "Alice" },
    });
    let m = model(r.init(U("/users/42")));
    m = model(r.update(m, { tag: "@@router/UrlChanged", url: U("/b") }));
    m = model(r.update(m, { tag: "@@router/UrlChanged", url: U("/users/42") }));
    expect(loadArgs.params).toEqual({ id: "42" });
    expect(loadArgs.shared).toEqual({ user: "Alice" });
  });
});

// ══════════════════════════════════════════════════════════════
// 11. Guards
// ══════════════════════════════════════════════════════════════

describe("guards", () => {
  it("allows when guard returns true", () => {
    const r = createRouter<TestShared>({
      routes: [
        page(route("/"), simplePage("home")),
        page(route("/admin"), simplePage("admin"), {
          guard: (_, s) => s.user ? true : "/",
        }),
      ],
      shared: { user: "Alice" },
    });
    expect((model(r.init(U("/admin")))._page!.model as any).label).toBe("admin");
  });

  it("redirects when guard returns URL", () => {
    const r = createRouter<TestShared>({
      routes: [
        page(route("/"), simplePage("home")),
        page(route("/admin"), simplePage("admin"), {
          guard: (_, s) => s.user ? true : "/",
        }),
      ],
      shared: { user: null },
    });
    expect((model(r.init(U("/admin")))._page!.model as any).label).toBe("home");
  });

  it("guard receives params", () => {
    let guardParams: any;
    const r = createRouter<TestShared>({
      routes: [
        page(route("/users/:id", { id: str }), simplePage<{ id: string }>("user"), {
          guard: (params) => { guardParams = params; return true; },
        }),
      ],
      shared: { user: null },
    });
    model(r.init(U("/users/42")));
    expect(guardParams).toEqual({ id: "42" });
  });

  it("guard receives shared state", () => {
    let guardShared: any;
    const r = createRouter<TestShared>({
      routes: [
        page(route("/"), simplePage("home"), {
          guard: (_, shared) => { guardShared = shared; return true; },
        }),
      ],
      shared: { user: "Bob" },
    });
    model(r.init(U("/")));
    expect(guardShared).toEqual({ user: "Bob" });
  });

  it("chain redirect: A → B → C", () => {
    const r = createRouter<TestShared>({
      routes: [
        page(route("/a"), simplePage("a"), { guard: () => "/b" }),
        page(route("/b"), simplePage("b"), { guard: () => "/c" }),
        page(route("/c"), simplePage("c")),
      ],
      shared: { user: null },
    });
    expect((model(r.init(U("/a")))._page!.model as any).label).toBe("c");
  });

  it("infinite redirect loop terminates at depth 5 → notFound", () => {
    const r = createRouter<TestShared>({
      routes: [
        page(route("/a"), simplePage("a"), { guard: () => "/b" }),
        page(route("/b"), simplePage("b"), { guard: () => "/a" }),
      ],
      shared: { user: null },
      notFound: notFoundCfg,
    });
    expect(model(r.init(U("/a")))._page!.routeIdx).toBe(-1);
  });

  it("guard works on UrlChanged (not just init)", () => {
    const r = createRouter<TestShared>({
      routes: [
        page(route("/"), simplePage("home")),
        page(route("/admin"), simplePage("admin"), {
          guard: (_, s) => s.user ? true : "/",
        }),
      ],
      shared: { user: null },
    });
    const m1 = model(r.init(U("/")));
    const m2 = model(r.update(m1, { tag: "@@router/UrlChanged", url: U("/admin") }));
    expect((m2._page!.model as any).label).toBe("home"); // redirected
  });

  it("guard redirect still produces a replace navigation effect when already on the target page", () => {
    const r = createRouter<TestShared>({
      routes: [
        page(route("/login"), simplePage("login")),
        page(route("/admin"), simplePage("admin"), { guard: () => "/login?from=admin" }),
      ],
      shared: { user: null },
    });

    const m1 = model(r.init(U("/login?from=admin")));
    const result = r.update(m1, { tag: "@@router/UrlChanged", url: U("/admin") });

    expect(Array.isArray(result)).toBe(true);
    expect(model(result)).toBe(m1);

    const fx = effects(result);
    expect(fx).toHaveLength(1);
    expect(fx[0]![1]).toEqual({ url: "/login?from=admin", replace: true });
  });
});

// ══════════════════════════════════════════════════════════════
// 12. router.view()
// ══════════════════════════════════════════════════════════════

describe("router.view()", () => {
  let router: Router<TestShared>;
  beforeEach(() => { router = makeRouter(); });

  it("renders active page via page config view", () => {
    const m = model(router.init(U("/")));
    const vnode = router.view(m, () => {});
    expect(vnode.tag).toBe("div");
    // home page renders "home:null"
    expect(vnode.children.length).toBeGreaterThan(0);
  });

  it("renders notFound page", () => {
    const m = model(router.init(U("/xyz")));
    const vnode = router.view(m, () => {});
    expect(vnode.children.length).toBeGreaterThan(0);
  });

  it("renders empty div when _page is null", () => {
    const m: RouterModel<TestShared> = {
      shared: { user: null }, url: U("/"), _page: null, _cache: new Map(),
    };
    const vnode = router.view(m, () => {});
    expect(vnode.tag).toBe("div");
    expect(vnode.children).toHaveLength(0);
  });

  it("dispatch in view wraps messages as @@router/PageMsg", () => {
    const r = createRouter<TestShared>({
      routes: [page(route("/"), {
        init: () => ({}),
        update: (m: any) => m,
        view: (_m: any, _shared: any, dispatch: any) =>
          h("button", { onClick: () => dispatch("clicked") }, "go"),
      })],
      shared: { user: null },
    });

    const m = model(r.init(U("/")));
    const msgs: any[] = [];
    const vnode = r.view(m, (msg) => msgs.push(msg));
    vnode.props.onClick();

    expect(msgs).toEqual([{ tag: "@@router/PageMsg", msg: "clicked" }]);
  });

  it("passes shared state to page view", () => {
    const r = createRouter<TestShared>({
      routes: [page(route("/"), {
        init: () => ({}),
        update: (m: any) => m,
        view: (_m: any, shared: any) => h("div", {}, `user:${shared.user}`),
      })],
      shared: { user: "Alice" },
    });
    const m = model(r.init(U("/")));
    const vnode = r.view(m, () => {});
    expect(vnode.children[0]!.tag).toContain("Alice");
  });
});

// ══════════════════════════════════════════════════════════════
// 13. router.subscriptions()
// ══════════════════════════════════════════════════════════════

describe("router.subscriptions()", () => {
  it("returns empty when no page", () => {
    const r = makeRouter();
    const m: RouterModel<TestShared> = {
      shared: { user: null }, url: U("/"), _page: null, _cache: new Map(),
    };
    expect(r.subscriptions(m)).toEqual([]);
  });

  it("returns empty when page has no subscriptions", () => {
    const r = createRouter<{}>({
      routes: [page(route("/"), { init: () => ({}), update: (m: any) => m, view: () => h("div", {}) })],
      shared: {},
    });
    const m = model(r.init(U("/")));
    expect(r.subscriptions(m)).toEqual([]);
  });

  it("returns mapped subscriptions from page", () => {
    const subRunner = (dispatch: any, _p: any) => {
      dispatch("tick");
      return () => {};
    };
    const r = createRouter<{}>({
      routes: [page(route("/"), {
        init: () => ({}), update: (m: any) => m, view: () => h("div", {}),
        subscriptions: () => [[subRunner, {}]],
      })],
      shared: {},
    });
    const m = model(r.init(U("/")));
    const subs = r.subscriptions(m);
    expect(subs).toHaveLength(1);
    const [runner, props] = subs[0] as [any, any];
    const msgs: any[] = [];
    const cleanup = runner((msg: any) => msgs.push(msg), props);
    cleanup();
    expect(msgs).toEqual([{ tag: "@@router/PageMsg", msg: "tick" }]);
  });
});

// ══════════════════════════════════════════════════════════════
// 14. router.listen() — CRITICAL stability tests
// ══════════════════════════════════════════════════════════════

describe("router.listen()", () => {
  let router: Router<TestShared>;
  beforeEach(() => { router = makeRouter(); });

  it("returns a valid [runner, props] tuple", () => {
    const sub = router.listen();
    expect(sub).toHaveLength(2);
    expect(typeof (sub as any)[0]).toBe("function");
  });

  it("fires UrlChanged immediately on subscribe", () => {
    const msgs: any[] = [];
    const [runner, props] = router.listen() as [any, any];
    const cleanup = runner((msg: any) => msgs.push(msg), props);
    cleanup();
    expect(msgs.length).toBe(1);
    expect(msgs[0].tag).toBe("@@router/UrlChanged");
  });

  it("CRITICAL: returns same reference on multiple calls", () => {
    const sub1 = router.listen();
    const sub2 = router.listen();
    expect(sub1).toBe(sub2); // same tuple — prevents subscription churn
    expect((sub1 as any)[0]).toBe((sub2 as any)[0]); // same runner fn
    expect((sub1 as any)[1]).toBe((sub2 as any)[1]); // same props
  });

  it("cleanup removes popstate listener", () => {
    const msgs: any[] = [];
    const [runner, props] = router.listen() as [any, any];
    const cleanup = runner((msg: any) => msgs.push(msg), props);
    msgs.length = 0; // clear initial fire

    cleanup();
    dispatchEvent(new PopStateEvent("popstate"));
    expect(msgs).toHaveLength(0); // no more messages after cleanup
  });
});

// ══════════════════════════════════════════════════════════════
// 15. router.navigate() and router.href()
// ══════════════════════════════════════════════════════════════

describe("router.navigate()", () => {
  it("returns an effect tuple", () => {
    const r = makeRouter();
    const fx = r.navigate("/about");
    expect(fx).toHaveLength(2);
    expect(typeof fx[0]).toBe("function");
  });

  it("pushes history and dispatches popstate by default", () => {
    const r = makeRouter();
    const fx = r.navigate("/about");
    const originalPushState = history.pushState;
    const originalDispatchEvent = globalThis.dispatchEvent;
    const calls: any[] = [];
    const events: Event[] = [];

    (history as any).pushState = (...args: any[]) => {
      calls.push(args);
    };
    (globalThis as any).dispatchEvent = (event: Event) => {
      events.push(event);
      return true;
    };

    try {
      fx[0](() => {}, fx[1]);
    } finally {
      (history as any).pushState = originalPushState;
      (globalThis as any).dispatchEvent = originalDispatchEvent;
    }

    expect(calls).toEqual([[null, "", "/about"]]);
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("popstate");
  });

  it("uses replaceState when replace=true", () => {
    const r = makeRouter();
    const fx = r.navigate("/about", true);
    const originalReplaceState = history.replaceState;
    const calls: any[] = [];

    (history as any).replaceState = (...args: any[]) => {
      calls.push(args);
    };

    try {
      fx[0](() => {}, fx[1]);
    } finally {
      (history as any).replaceState = originalReplaceState;
    }

    expect(calls).toEqual([[null, "", "/about"]]);
  });
});

describe("router.href()", () => {
  it("delegates to routeDef.toUrl()", () => {
    const r = makeRouter();
    const userRoute = route("/users/:id", { id: str });
    expect(r.href(userRoute, { id: "42" })).toBe("/users/42");
  });
});

// ══════════════════════════════════════════════════════════════
// 16. routerLink()
// ══════════════════════════════════════════════════════════════

describe("routerLink()", () => {
  it("returns href", () => {
    expect(routerLink("/about").href).toBe("/about");
  });

  it("returns onClick function", () => {
    expect(typeof routerLink("/about").onClick).toBe("function");
  });

  it("onClick calls pushState and dispatches popstate for plain left clicks", () => {
    const link = routerLink("/test-link-route");
    const originalPushState = history.pushState;
    const originalDispatchEvent = globalThis.dispatchEvent;
    const pushCalls: any[] = [];
    const events: Event[] = [];
    let prevented = false;

    (history as any).pushState = (...args: any[]) => {
      pushCalls.push(args);
    };
    (globalThis as any).dispatchEvent = (event: Event) => {
      events.push(event);
      return true;
    };

    try {
      link.onClick({
        button: 0,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        preventDefault: () => { prevented = true; },
      } as any);
    } finally {
      (history as any).pushState = originalPushState;
      (globalThis as any).dispatchEvent = originalDispatchEvent;
    }

    expect(prevented).toBe(true);
    expect(pushCalls).toEqual([[null, "", "/test-link-route"]]);
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("popstate");
  });

  it("does not intercept modified clicks", () => {
    const link = routerLink("/test-link-route");
    const originalPushState = history.pushState;
    const pushCalls: any[] = [];
    let prevented = false;

    (history as any).pushState = (...args: any[]) => {
      pushCalls.push(args);
    };

    try {
      link.onClick({
        button: 0,
        ctrlKey: true,
        metaKey: false,
        shiftKey: false,
        preventDefault: () => { prevented = true; },
      } as any);
    } finally {
      (history as any).pushState = originalPushState;
    }

    expect(prevented).toBe(false);
    expect(pushCalls).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════
// 17. Edge cases and regression tests
// ══════════════════════════════════════════════════════════════

describe("edge cases", () => {
  it("router with zero routes → notFound", () => {
    const r = createRouter<{}>({ routes: [], shared: {}, notFound: {
      init: (p: any) => p, update: (m: any) => m, view: () => h("div", {}, "nf"),
    }});
    const m = model(r.init(U("/")));
    expect(m._page!.routeIdx).toBe(-1);
  });

  it("router with zero routes and no notFound → null page", () => {
    const r = createRouter<{}>({ routes: [], shared: {} });
    const m = model(r.init(U("/")));
    expect(m._page).toBeNull();
  });

  it("route ordering: first match wins", () => {
    const r = createRouter<{}>({
      routes: [
        page(route("/users/:id", { id: str }), { init: () => "dynamic", update: (m: any) => m, view: (m: any) => h("div", {}, m) }),
        page(route("/users/special"), { init: () => "static", update: (m: any) => m, view: (m: any) => h("div", {}, m) }),
      ],
      shared: {},
    });
    // /users/special matches the dynamic route first (because it's listed first)
    const m = model(r.init(U("/users/special")));
    expect(m._page!.model).toBe("dynamic");
  });

  it("notFound page receives correct path", () => {
    const r = createRouter<{}>({
      routes: [], shared: {},
      notFound: { init: (p: any) => p, update: (m: any) => m, view: () => h("div", {}) },
    });
    const m = model(r.init(U("/some/deep/path")));
    expect((m._page!.model as any).path).toBe("/some/deep/path");
  });

  it("different notFound paths get different cache keys", () => {
    const r = createRouter<{}>({
      routes: [page(route("/"), { init: () => "h", update: (m: any) => m, view: () => h("div", {}) })],
      shared: {},
      notFound: { init: (p: any) => p, update: (m: any) => m, view: () => h("div", {}), save: (m: any) => m },
    });
    let m = model(r.init(U("/aaa")));
    m = model(r.update(m, { tag: "@@router/UrlChanged", url: U("/") }));
    m = model(r.update(m, { tag: "@@router/UrlChanged", url: U("/bbb") }));
    // Both /aaa and /bbb are notFound but should have different cache keys
    expect(m._page!.key).toContain("bbb");
  });

  it("page init receives shared state", () => {
    let initShared: any;
    const r = createRouter<TestShared>({
      routes: [page(route("/"), {
        init: (_p: any, shared: any) => { initShared = shared; return {}; },
        update: (m: any) => m, view: () => h("div", {}),
      })],
      shared: { user: "Test" },
    });
    model(r.init(U("/")));
    expect(initShared).toEqual({ user: "Test" });
  });

  it("page update receives shared state", () => {
    let updateShared: any;
    const r = createRouter<TestShared>({
      routes: [page(route("/"), {
        init: () => ({}),
        update: (_m: any, _msg: any, shared: any) => { updateShared = shared; return {}; },
        view: () => h("div", {}),
      })],
      shared: { user: "Test" },
    });
    const m = model(r.init(U("/")));
    r.update(m, { tag: "@@router/PageMsg", msg: "x" });
    expect(updateShared).toEqual({ user: "Test" });
  });
});

// ══════════════════════════════════════════════════════════════
// 18. Backward compatibility
// ══════════════════════════════════════════════════════════════

describe("matchRoute() (deprecated)", () => {
  it("exact match", () => {
    expect(matchRoute("/", "/")).toEqual({});
    expect(matchRoute("/about", "/about")).toEqual({});
  });

  it("no match", () => {
    expect(matchRoute("/about", "/contact")).toBeNull();
    expect(matchRoute("/a/b", "/a")).toBeNull();
    expect(matchRoute("/a", "/a/b")).toBeNull();
  });

  it("named params", () => {
    expect(matchRoute("/user/:id", "/user/42")).toEqual({ id: "42" });
    expect(matchRoute("/user/:id/post/:pid", "/user/1/post/99")).toEqual({ id: "1", pid: "99" });
  });

  it("URI decoding", () => {
    expect(matchRoute("/search/:q", "/search/hello%20world")).toEqual({ q: "hello world" });
  });

  it("wildcard", () => {
    expect(matchRoute("/files/*", "/files/a/b/c")).toEqual({ "*": "a/b/c" });
    expect(matchRoute("/files/*", "/files/")).toEqual({ "*": "" });
  });

  it("trailing slashes", () => {
    expect(matchRoute("/about", "/about/")).toEqual({});
  });

  it("malformed URI", () => {
    expect(matchRoute("/search/:q", "/search/%E0%A4%A")).toBeNull();
  });

  it("redundant slashes", () => {
    expect(matchRoute("//user//:id//", "///user///42///")).toEqual({ id: "42" });
  });
});

describe("onRoute() (deprecated)", () => {
  it("creates valid sub", () => {
    const sub = onRoute([{ path: "/", handler: () => "home" }]);
    expect(sub).toHaveLength(2);
    expect(typeof (sub as any)[0]).toBe("function");
  });

  it("fires for current path", () => {
    let got: string | undefined;
    history.replaceState(null, "", "/");
    const [runner, props] = onRoute([{ path: location.pathname, handler: () => "matched" }]) as [any, any];
    const cleanup = runner((msg: string) => { got = msg; }, props);
    cleanup();
    expect(got).toBe("matched");
  });

  it("fires notFound", () => {
    let got: string | undefined;
    history.replaceState(null, "", "/nope-xyz");
    const [runner, props] = onRoute(
      [{ path: "/only", handler: () => "ok" }],
      (p) => `404:${p}`,
    ) as [any, any];
    const cleanup = runner((msg: string) => { got = msg; }, props);
    cleanup();
    history.replaceState(null, "", "/");
    expect(got).toContain("404:");
  });
});
