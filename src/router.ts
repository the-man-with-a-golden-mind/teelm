// Teelm — Advanced SPA Router
// Typed URL parsing, Page protocol, lifecycle management, guards

import {
  app, h, mapEffect, mapSub, mapDispatch, none, batch,
  type AppInstance, type RenderHook, type UnmountHook,
  type Dispatch, type Sub, type Subs, type Effect, type Cmd, type VNode,
  type SubFn,
} from "./teelm";
import { navigate as navFxEffect } from "./fx";

// Internal helper: brand a raw [fn, props] tuple as a Sub<Msg, P>.
const brandSub = <Msg, P>(fn: SubFn<Msg, P>, props: P): Sub<Msg, P> =>
  [fn, props] as unknown as Sub<Msg, P>;
// Internal helper: brand a raw effect array as a Cmd<Msg>.
const brandCmd = <Msg>(effects: readonly Effect<Msg>[]): Cmd<Msg> =>
  effects as unknown as Cmd<Msg>;

// ══════════════════════════════════════════════════════════════
// URL Parser
// ══════════════════════════════════════════════════════════════

export interface Parser<T> {
  readonly _tag: "path";
  readonly parse: (raw: string) => T | null;
}

export interface QueryParser<T> {
  readonly _tag: "query";
  readonly parse: (raw: string | null) => T;
}

// ── Path segment parsers ──────────────────────────────────────

export const str: Parser<string> = {
  _tag: "path",
  parse: (raw) => raw,
};

export const int: Parser<number> = {
  _tag: "path",
  parse: (raw) => {
    if (raw === "") return null;
    const n = Number(raw);
    return Number.isInteger(n) ? n : null;
  },
};

export const float: Parser<number> = {
  _tag: "path",
  parse: (raw) => {
    if (raw === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  },
};

export function oneOf<T extends string>(values: readonly T[]): Parser<T> {
  const set = new Set<string>(values);
  return { _tag: "path", parse: (raw) => (set.has(raw) ? (raw as T) : null) };
}

// ── Query param parsers ───────────────────────────────────────

export const q = {
  str(fallback: string): QueryParser<string> {
    return { _tag: "query", parse: (raw) => raw ?? fallback };
  },
  int(fallback: number): QueryParser<number> {
    return {
      _tag: "query",
      parse: (raw) => {
        if (raw === null) return fallback;
        const n = Number(raw);
        return Number.isInteger(n) ? n : fallback;
      },
    };
  },
  float(fallback: number): QueryParser<number> {
    return {
      _tag: "query",
      parse: (raw) => {
        if (raw === null) return fallback;
        const n = Number(raw);
        return Number.isFinite(n) ? n : fallback;
      },
    };
  },
  bool(fallback: boolean): QueryParser<boolean> {
    return {
      _tag: "query",
      parse: (raw) => (raw === null ? fallback : raw === "true" || raw === "1"),
    };
  },
  optional: {
    str(): QueryParser<string | undefined> {
      return { _tag: "query", parse: (raw) => raw ?? undefined };
    },
    int(): QueryParser<number | undefined> {
      return {
        _tag: "query",
        parse: (raw) => {
          if (raw === null) return undefined;
          const n = Number(raw);
          return Number.isInteger(n) ? n : undefined;
        },
      };
    },
  },
};

// ── Route definition ──────────────────────────────────────────

type ParamSpec = Record<string, Parser<any> | QueryParser<any>>;

type ExtractParams<Spec extends ParamSpec> = {
  [K in keyof Spec]: Spec[K] extends Parser<infer T>
    ? T
    : Spec[K] extends QueryParser<infer T>
      ? T
      : never;
};

export interface RouteDef<Params extends Record<string, any> = Record<string, any>> {
  readonly pattern: string;
  parse(pathname: string, search?: string): Params | null;
  toUrl(params: Params): string;
}

function normalizePath(path: string): string {
  return "/" + path.split("/").filter(Boolean).join("/");
}

function safeDecode(component: string): string | null {
  try {
    return decodeURIComponent(component);
  } catch {
    return null;
  }
}

export function route(path: string): RouteDef<{}>;
export function route<Spec extends ParamSpec>(
  path: string,
  spec: Spec,
): RouteDef<ExtractParams<Spec>>;
export function route(path: string, spec?: ParamSpec): RouteDef<any> {
  const normalized = normalizePath(path);
  const segments = normalized.split("/").filter(Boolean);

  const pathParsers: Record<string, Parser<any>> = {};
  const queryParsers: Record<string, QueryParser<any>> = {};

  if (spec) {
    for (const key in spec) {
      if (!Object.prototype.hasOwnProperty.call(spec, key)) continue;
      const p = spec[key]!;
      if (p._tag === "query") {
        queryParsers[key] = p;
      } else {
        pathParsers[key] = p;
      }
    }
  }

  return {
    pattern: normalized,

    parse(pathname: string, search?: string): any {
      const norm = normalizePath(pathname);
      const urlSegs = norm.split("/").filter(Boolean);
      const hasWild = segments.length > 0 && segments[segments.length - 1] === "*";

      if (!hasWild && segments.length !== urlSegs.length) return null;
      if (hasWild && urlSegs.length < segments.length - 1) return null;

      const result: Record<string, any> = {};

      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i]!;
        if (seg === "*") {
          result["*"] = urlSegs.slice(i).join("/");
          break;
        }
        if (i >= urlSegs.length) return null;
        if (seg.startsWith(":")) {
          const name = seg.slice(1);
          const decoded = safeDecode(urlSegs[i]!);
          if (decoded === null) return null;
          const parser = pathParsers[name];
          const parsed = parser ? parser.parse(decoded) : decoded;
          if (parsed === null) return null;
          result[name] = parsed;
        } else if (seg !== urlSegs[i]) {
          return null;
        }
      }

      if (Object.keys(queryParsers).length > 0) {
        const sp = new URLSearchParams(search || "");
        for (const key in queryParsers) {
          result[key] = queryParsers[key]!.parse(sp.get(key));
        }
      }

      return result;
    },

    toUrl(params: Record<string, any>): string {
      let url =
        "/" +
        segments
          .filter((s) => s !== "*")
          .map((seg) =>
            seg.startsWith(":")
              ? encodeURIComponent(String(params[seg.slice(1)]))
              : seg,
          )
          .join("/");

      const qKeys = Object.keys(queryParsers);
      if (qKeys.length > 0) {
        const qp = new URLSearchParams();
        for (const key of qKeys) {
          if (params[key] !== undefined && params[key] !== null) {
            qp.set(key, String(params[key]));
          }
        }
        const qs = qp.toString();
        if (qs) url += "?" + qs;
      }

      return url;
    },
  };
}

// ══════════════════════════════════════════════════════════════
// Page Protocol
// ══════════════════════════════════════════════════════════════

export interface PageConfig<
  Model,
  Msg,
  Shared,
  Params extends Record<string, any>,
> {
  init(params: Params, shared: Shared): readonly [Model, Cmd<Msg>];
  update(
    model: Readonly<Model>,
    msg: Msg,
    shared: Readonly<Shared>,
  ): readonly [Model, Cmd<Msg>];
  view(
    model: Readonly<Model>,
    shared: Readonly<Shared>,
    dispatch: Dispatch<Msg>,
  ): VNode;
  subscriptions?(
    model: Readonly<Model>,
    shared: Readonly<Shared>,
  ): Subs<Msg>;
  save?(model: Readonly<Model>): unknown;
  load?(
    saved: unknown,
    params: Params,
    shared: Shared,
  ): readonly [Model, Cmd<Msg>];
  onMount?(ctx: PageMountContext<Model, Msg, Shared, Params>): void;
  onUnmount?(ctx: PageMountContext<Model, Msg, Shared, Params>): void;
  afterUpdate?(ctx: PageAfterUpdateContext<Model, Msg, Shared, Params>): void;
  onError?(ctx: PageErrorContext<Model, Msg, Shared, Params>): void;
  errorView?(ctx: PageErrorContext<Model, Msg, Shared, Params>): VNode;
}

export interface PageRenderContext<
  Model,
  Msg,
  Shared,
  Params extends Record<string, any>,
> {
  readonly model: Readonly<Model>;
  readonly params: Params;
  readonly shared: Readonly<Shared>;
  readonly dispatch: Dispatch<Msg>;
}

export interface PageMountContext<
  Model,
  Msg,
  Shared,
  Params extends Record<string, any>,
> extends PageRenderContext<Model, Msg, Shared, Params> {
  readonly root: HTMLElement;
}

export interface PageAfterUpdateContext<
  Model,
  Msg,
  Shared,
  Params extends Record<string, any>,
> extends PageMountContext<Model, Msg, Shared, Params> {
  readonly prevModel: Readonly<Model>;
  readonly prevParams: Params;
  readonly prevShared: Readonly<Shared>;
}

export interface PageErrorContext<
  Model,
  Msg,
  Shared,
  Params extends Record<string, any>,
> extends PageRenderContext<Model, Msg, Shared, Params> {
  readonly phase: "view" | "onMount" | "onUnmount" | "afterUpdate";
  readonly error: unknown;
  readonly root?: HTMLElement;
  readonly prevModel?: Readonly<Model>;
  readonly prevParams?: Params;
  readonly prevShared?: Readonly<Shared>;
}

// ── Page route binding ────────────────────────────────────────

export interface PageRoute<Shared> {
  readonly _tag: "page-route";
  readonly _routeDef: RouteDef<any>;
  readonly _config: PageConfig<any, any, Shared, any>;
  readonly _guard?: (params: any, shared: Readonly<Shared>) => true | string;
}

export function page<Model, Msg, Shared, Params extends Record<string, any>>(
  routeDef: RouteDef<Params>,
  config: PageConfig<Model, Msg, Shared, Params>,
  options?: {
    guard?: (params: Params, shared: Readonly<Shared>) => true | string;
  },
): PageRoute<Shared> {
  const out: PageRoute<Shared> = {
    _tag: "page-route",
    _routeDef: routeDef,
    _config: config,
  };
  if (options?.guard) (out as { _guard?: typeof options.guard })._guard = options.guard;
  return out;
}

// ══════════════════════════════════════════════════════════════
// Router
// ══════════════════════════════════════════════════════════════

export interface RouterModel<Shared> {
  readonly shared: Shared;
  readonly url: URL;
  readonly _page: {
    readonly key: string;
    readonly model: unknown;
    readonly routeIdx: number;
    readonly params: unknown;
  } | null;
  readonly _cache: Map<string, unknown>;
}

export type RouterMsg<Shared> =
  | { readonly tag: "@@router/UrlChanged"; readonly url: URL }
  | { readonly tag: "@@router/PageMsg"; readonly msg: unknown }
  | {
      readonly tag: "@@router/UpdateShared";
      readonly fn: (s: Shared) => Shared;
    };

export interface Router<Shared> {
  init(url?: URL): readonly [RouterModel<Shared>, Cmd<RouterMsg<Shared>>];
  update(
    model: RouterModel<Shared>,
    msg: RouterMsg<Shared>,
  ): readonly [RouterModel<Shared>, Cmd<RouterMsg<Shared>>];
  view(
    model: Readonly<RouterModel<Shared>>,
    dispatch: Dispatch<RouterMsg<Shared>>,
  ): VNode;
  subscriptions(
    model: Readonly<RouterModel<Shared>>,
  ): Subs<RouterMsg<Shared>>;
  listen(): Sub<RouterMsg<Shared>>;
  navigate(url: string, replace?: boolean): Effect<RouterMsg<Shared>>;
  updateShared(fn: (s: Shared) => Shared): RouterMsg<Shared>;
  href<P extends Record<string, any>>(
    routeDef: RouteDef<P>,
    params: P,
  ): string;
  __unsafeGetConfig?(routeIdx: number): PageConfig<any, any, Shared, any> | undefined;
  __unsafeGetNotFoundConfig?(): PageConfig<any, any, Shared, { path: string }> | undefined;
}

export function createRouter<Shared>(config: {
  routes: PageRoute<Shared>[];
  shared: Shared;
  notFound?: PageConfig<any, any, Shared, { path: string }>;
}): Router<Shared> {
  const routes = config.routes;
  const notFoundConfig = config.notFound;

  // ── Internal helpers ────────────────────────────────────────

  function matchUrl(
    url: URL,
  ): { routeIdx: number; params: any } | null {
    for (let i = 0; i < routes.length; i++) {
      const r = routes[i]!;
      const params = r._routeDef.parse(url.pathname, url.search);
      if (params) return { routeIdx: i, params };
    }
    return null;
  }

  type Resolved =
    | {
        routeIdx: number;
        params: any;
        config: PageConfig<any, any, Shared, any>;
        finalUrl: URL;
      }
    | { notFound: true; path: string };

  function resolveUrl(url: URL, shared: Shared, depth = 0): Resolved {
    if (depth > 5) return { notFound: true, path: url.pathname };

    const match = matchUrl(url);
    if (!match) return { notFound: true, path: url.pathname };

    const r = routes[match.routeIdx]!;
    if (r._guard) {
      const result = r._guard(match.params, shared);
      if (result !== true) {
        return resolveUrl(new URL(result, url.origin), shared, depth + 1);
      }
    }

    return {
      routeIdx: match.routeIdx,
      params: match.params,
      config: r._config,
      finalUrl: url,
    };
  }

  function initPage(
    cfg: PageConfig<any, any, Shared, any>,
    params: any,
    shared: Shared,
    cacheKey: string,
    cache: Map<string, unknown>,
  ): { model: unknown; effects: Cmd<any> } {
    const saved = cache.get(cacheKey);
    if (saved !== undefined && cfg.load) {
      const [model, effects] = cfg.load(saved, params, shared);
      return { model, effects };
    }
    const [model, effects] = cfg.init(params, shared);
    return { model, effects };
  }

  function mapPageEffects(
    effects: Cmd<any>,
  ): Effect<RouterMsg<Shared>>[] {
    return (effects as readonly Effect<any>[]).map((fx) =>
      mapEffect(fx, (msg: any): RouterMsg<Shared> => ({
        tag: "@@router/PageMsg",
        msg,
      })),
    );
  }

  function mapPageSubs(
    subs: Subs<any>,
  ): Subs<RouterMsg<Shared>> {
    const out: (Sub<RouterMsg<Shared>> | false | null | undefined)[] = [];
    for (const s of subs) {
      out.push(
        mapSub(s as Sub<any> | false | null | undefined, (msg: any): RouterMsg<Shared> => ({
          tag: "@@router/PageMsg",
          msg,
        })),
      );
    }
    return out;
  }

  function getConfig(
    routeIdx: number,
  ): PageConfig<any, any, Shared, any> | undefined {
    return routeIdx >= 0 ? routes[routeIdx]!._config : notFoundConfig;
  }

  function transitionTo(
    model: RouterModel<Shared>,
    url: URL,
    resolved: Exclude<Resolved, { notFound: true }>,
  ): readonly [RouterModel<Shared>, Cmd<RouterMsg<Shared>>] {
    const redirected =
      resolved.finalUrl.pathname !== url.pathname ||
      resolved.finalUrl.search !== url.search;
    const cacheKey = resolved.finalUrl.pathname + resolved.finalUrl.search;
    const redirectEffects: Effect<RouterMsg<Shared>>[] = redirected
      ? [
          navFxEffect(
            resolved.finalUrl.pathname + resolved.finalUrl.search,
            true,
          ) as Effect<RouterMsg<Shared>>,
        ]
      : [];

    // Same page check — return same model reference to avoid re-render
    if (
      model._page &&
      model._page.key === cacheKey &&
      model._page.routeIdx === resolved.routeIdx
    ) {
      return [model, brandCmd(redirectEffects)];
    }

    const cache = new Map(model._cache);

    if (model._page) {
      const cfg = getConfig(model._page.routeIdx);
      if (cfg?.save) {
        const saved = cfg.save(model._page.model as any);
        if (saved !== undefined) cache.set(model._page.key, saved);
      }
    }

    const { model: pageModel, effects } = initPage(
      resolved.config,
      resolved.params,
      model.shared,
      cacheKey,
      cache,
    );

    const next: RouterModel<Shared> = {
      ...model,
      url: resolved.finalUrl,
      _page: {
        key: cacheKey,
        model: pageModel,
        routeIdx: resolved.routeIdx,
        params: resolved.params,
      },
      _cache: cache,
    };

    const allEffects: Effect<RouterMsg<Shared>>[] = [
      ...mapPageEffects(effects),
      ...redirectEffects,
    ];

    return [next, brandCmd(allEffects)];
  }

  function transitionToNotFound(
    model: RouterModel<Shared>,
    url: URL,
    path: string,
  ): readonly [RouterModel<Shared>, Cmd<RouterMsg<Shared>>] {
    const cache = new Map(model._cache);

    if (model._page) {
      const cfg = getConfig(model._page.routeIdx);
      if (cfg?.save) {
        const saved = cfg.save(model._page.model as any);
        if (saved !== undefined) cache.set(model._page.key, saved);
      }
    }

    if (!notFoundConfig) {
      return [{ ...model, url, _page: null, _cache: cache }, none];
    }

    const { model: pageModel, effects } = initPage(
      notFoundConfig,
      { path },
      model.shared,
      "@@notfound:" + path,
      cache,
    );

    const next: RouterModel<Shared> = {
      ...model,
      url,
      _page: {
        key: "@@notfound:" + path,
        model: pageModel,
        routeIdx: -1,
        params: { path },
      },
      _cache: cache,
    };

    return [next, brandCmd(mapPageEffects(effects))];
  }

  // ── Stable listen subscription (memoized to avoid re-subscribe loop) ──

  const LISTEN_PROPS = {};
  const listenRunner: SubFn<RouterMsg<Shared>, typeof LISTEN_PROPS> = (dispatch) => {
    const handler = () => {
      dispatch({ tag: "@@router/UrlChanged", url: new URL(location.href) });
    };
    handler();
    addEventListener("popstate", handler);
    return () => removeEventListener("popstate", handler);
  };
  const listenSub: Sub<RouterMsg<Shared>> = brandSub(listenRunner, LISTEN_PROPS);

  // ── Router object ───────────────────────────────────────────

  return {
    init(url?: URL) {
      const u = url ?? new URL(location.href);
      const shared = config.shared;
      const emptyModel: RouterModel<Shared> = {
        shared,
        url: u,
        _page: null,
        _cache: new Map(),
      };

      const resolved = resolveUrl(u, shared);

      if ("notFound" in resolved) {
        return transitionToNotFound(emptyModel, u, resolved.path);
      }

      return transitionTo(emptyModel, u, resolved);
    },

    update(model, msg) {
      switch (msg.tag) {
        case "@@router/UrlChanged": {
          const url = msg.url;
          const resolved = resolveUrl(url, model.shared);

          if ("notFound" in resolved) {
            return transitionToNotFound(model, url, resolved.path);
          }

          return transitionTo(model, url, resolved);
        }

        case "@@router/PageMsg": {
          if (!model._page) return [model, none];
          const cfg = getConfig(model._page.routeIdx);
          if (!cfg) return [model, none];

          const [newPageModel, cmd] = cfg.update(
            model._page.model as any,
            msg.msg,
            model.shared,
          );

          return [
            {
              ...model,
              _page: { ...model._page, model: newPageModel },
            },
            brandCmd(mapPageEffects(cmd as Cmd<any>)),
          ];
        }

        case "@@router/UpdateShared": {
          return [{ ...model, shared: msg.fn(model.shared) }, none];
        }
      }
    },

    view(model, dispatch) {
      if (!model._page) return h("div", {});
      const cfg = getConfig(model._page.routeIdx);
      if (!cfg) return h("div", {});

      const pageDispatch = mapDispatch<any, RouterMsg<Shared>>(
        dispatch,
        (msg: any): RouterMsg<Shared> => ({ tag: "@@router/PageMsg", msg }),
      );
      const renderCtx = {
        model: model._page.model as any,
        params: model._page.params as any,
        shared: model.shared,
        dispatch: pageDispatch,
      };

      try {
        return cfg.view(model._page.model as any, model.shared, pageDispatch);
      } catch (error) {
        const errorCtx: PageErrorContext<any, any, Shared, any> = {
          ...renderCtx,
          phase: "view",
          error,
        };
        try {
          cfg.onError?.(errorCtx);
        } catch {
          // Swallow secondary boundary failures to preserve the fallback UI.
        }
        return cfg.errorView?.(errorCtx) ?? defaultPageErrorView(error);
      }
    },

    subscriptions(model) {
      if (!model._page) return [];
      const cfg = getConfig(model._page.routeIdx);
      if (!cfg?.subscriptions) return [];
      return mapPageSubs(cfg.subscriptions(model._page.model as any, model.shared));
    },

    listen() {
      return listenSub;
    },

    navigate(url: string, replace = false) {
      return navFxEffect(url, replace) as Effect<RouterMsg<Shared>>;
    },

    updateShared(fn) {
      return { tag: "@@router/UpdateShared", fn };
    },

    href(routeDef, params) {
      return routeDef.toUrl(params);
    },

    __unsafeGetConfig(routeIdx) {
      return getConfig(routeIdx);
    },

    __unsafeGetNotFoundConfig() {
      return notFoundConfig;
    },
  };
}

// ── SPA link helper (dispatch-free) ───────────────────────────

export function routerLink(
  url: string,
): { href: string; onClick: (e: MouseEvent) => void } {
  return {
    href: url,
    onClick: (e: MouseEvent) => {
      if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) {
        e.preventDefault();
        history.pushState(null, "", url);
        dispatchEvent(new PopStateEvent("popstate"));
      }
    },
  };
}

// ── routerApp() — zero-boilerplate app with router ────────────

function defaultPageErrorView(error: unknown): VNode {
  const message = error instanceof Error ? error.message : String(error);
  return h(
    "section",
    {
      role: "alert",
      "data-teelm-error-boundary": "page",
      style: {
        padding: "1rem",
        borderRadius: "0.75rem",
        border: "1px solid #f5c2c7",
        background: "#fff5f5",
        color: "#842029",
      },
    },
    h("strong", {}, "This page crashed."),
    h("p", { style: { margin: "0.5rem 0 0" } }, message || "Unknown error"),
  );
}

export function routerApp<Shared>(config: {
  router: Router<Shared>;
  layout: (
    content: VNode,
    shared: Readonly<Shared>,
    dispatch: Dispatch<RouterMsg<Shared>>,
  ) => VNode;
  node: HTMLElement;
  url?: URL;
  listen?: boolean;
  debug?: boolean | { console?: boolean; history?: boolean; maxHistory?: number };
}): AppInstance<{ router: RouterModel<Shared> }, RouterMsg<Shared>> {
  const { router } = config;

  type S = { router: RouterModel<Shared> };
  type M = RouterMsg<Shared>;

  const getConfig = (routeIdx: number): PageConfig<any, any, Shared, any> | undefined =>
    routeIdx >= 0
      ? router.__unsafeGetConfig?.(routeIdx)
      : router.__unsafeGetNotFoundConfig?.();

  const resolvePage = (model: RouterModel<Shared>) => {
    if (!model._page) return null;
    const cfg = getConfig(model._page.routeIdx);
    if (!cfg) return null;
    return { cfg, page: model._page };
  };

  const pageDispatch = (dispatch: Dispatch<M>): Dispatch<any> =>
    mapDispatch<any, M>(dispatch, (msg: any): M => ({ tag: "@@router/PageMsg", msg }));

  const mountContext = (
    entry: NonNullable<ReturnType<typeof resolvePage>>,
    shared: Readonly<Shared>,
    dispatch: Dispatch<M>,
    root: HTMLElement,
  ): PageMountContext<any, any, Shared, any> => ({
    model: entry.page.model as any,
    params: entry.page.params as any,
    shared,
    dispatch: pageDispatch(dispatch),
    root,
  });

  const runLifecycleHook = (
    entry: NonNullable<ReturnType<typeof resolvePage>>,
    phase: "onMount" | "onUnmount",
    shared: Readonly<Shared>,
    dispatch: Dispatch<M>,
    root: HTMLElement,
  ) => {
    const hook = phase === "onMount" ? entry.cfg.onMount : entry.cfg.onUnmount;
    if (!hook) return;
    const ctx = mountContext(entry, shared, dispatch, root);
    try {
      hook(ctx);
    } catch (error) {
      try {
        entry.cfg.onError?.({ ...ctx, phase, error });
      } catch {
        // Swallow secondary boundary failures from lifecycle hooks.
      }
    }
  };

  const runAfterUpdate = (
    entry: NonNullable<ReturnType<typeof resolvePage>>,
    prev: NonNullable<ReturnType<typeof resolvePage>>,
    shared: Readonly<Shared>,
    prevShared: Readonly<Shared>,
    dispatch: Dispatch<M>,
    root: HTMLElement,
  ) => {
    if (!entry.cfg.afterUpdate) return;
    const ctx: PageAfterUpdateContext<any, any, Shared, any> = {
      ...mountContext(entry, shared, dispatch, root),
      prevModel: prev.page.model as any,
      prevParams: prev.page.params as any,
      prevShared,
    };
    try {
      entry.cfg.afterUpdate(ctx);
    } catch (error) {
      try {
        entry.cfg.onError?.({ ...ctx, phase: "afterUpdate", error });
      } catch {
        // Swallow secondary boundary failures from lifecycle hooks.
      }
    }
  };

  const wrap = (r: readonly [RouterModel<Shared>, Cmd<M>]): readonly [S, Cmd<M>] =>
    [{ router: r[0] }, r[1]];

  return app<S, M>({
    init: wrap(router.init(config.url)),
    update: (state, msg) => wrap(router.update(state.router, msg)),
    view: (state, dispatch) =>
      config.layout(router.view(state.router, dispatch), state.router.shared, dispatch),
    afterRender: ({ state, prevState, dispatch, node }: RenderHook<S, M>) => {
      const current = resolvePage(state.router);
      const prev = prevState ? resolvePage(prevState.router) : null;

      if (!current) {
        if (prev && prevState) runLifecycleHook(prev, "onUnmount", prevState.router.shared, dispatch, node);
        return;
      }

      if (!prev || !prevState || prev.page.key !== current.page.key) {
        if (prev && prevState) runLifecycleHook(prev, "onUnmount", prevState.router.shared, dispatch, node);
        runLifecycleHook(current, "onMount", state.router.shared, dispatch, node);
        return;
      }

      runAfterUpdate(current, prev, state.router.shared, prevState.router.shared, dispatch, node);
    },
    onUnmount: ({ state, node }: UnmountHook<S>) => {
      const current = resolvePage(state.router);
      if (!current) return;
      runLifecycleHook(current, "onUnmount", state.router.shared, () => {}, node);
    },
    subscriptions: (state) => config.listen === false
      ? router.subscriptions(state.router)
      : [
          ...router.subscriptions(state.router),
          router.listen(),
        ],
    node: config.node,
    ...(config.debug !== undefined ? { debug: config.debug } : {}),
  });
}

// ══════════════════════════════════════════════════════════════
// Backward Compatibility (deprecated)
// ══════════════════════════════════════════════════════════════

export type RouteParams = Readonly<Record<string, string>>;

export interface Route<Msg> {
  path: string;
  handler: (params: RouteParams) => Msg;
}

/** @deprecated Use route() with typed parsers instead */
export function matchRoute(
  pattern: string,
  pathname: string,
): Record<string, string> | null {
  pattern = normalizePath(pattern);
  pathname = normalizePath(pathname);

  const patternSegments = pattern.split("/").filter(Boolean);
  const urlSegments = pathname.split("/").filter(Boolean);
  const params: Record<string, string> = {};

  for (let i = 0; i < patternSegments.length; i++) {
    const seg = patternSegments[i]!;
    if (seg === "*") {
      params["*"] = urlSegments.slice(i).join("/");
      return params;
    }
    if (i >= urlSegments.length) return null;
    if (seg.startsWith(":")) {
      const decoded = safeDecode(urlSegments[i]!);
      if (decoded === null) return null;
      params[seg.slice(1)] = decoded;
    } else if (seg !== urlSegments[i]) {
      return null;
    }
  }

  return patternSegments.length === urlSegments.length ? params : null;
}

/** @deprecated Use createRouter().listen() instead */
export function onRoute<Msg>(
  routes: Route<Msg>[],
  notFound?: (path: string) => Msg,
): Sub<Msg, { routes: Route<Msg>[]; notFound?: (path: string) => Msg }> {
  const fn: SubFn<Msg, { routes: Route<Msg>[]; notFound?: (path: string) => Msg }> = (
    dispatch,
    props,
  ) => {
    const resolve = () => {
      const path = location.pathname;
      for (const r of props.routes) {
        const p = matchRoute(r.path, path);
        if (p) {
          dispatch(r.handler(p));
          return;
        }
      }
      if (props.notFound) dispatch(props.notFound(path));
    };
    resolve();
    addEventListener("popstate", resolve);
    return () => removeEventListener("popstate", resolve);
  };
  return brandSub(fn, { routes, ...(notFound ? { notFound } : {}) });
}

/** @deprecated Use navigate from teelm/fx or router.navigate() */
export function navigate<Msg>(
  url: string,
  replace = false,
): Effect<Msg> {
  return navFxEffect(url, replace);
}

/** @deprecated Use routerLink() instead */
export function linkTo<Msg>(
  url: string,
  dispatch: Dispatch<Msg>,
  msg: Msg,
): Record<string, any> {
  const isMalicious = url.trim().toLowerCase().startsWith("javascript:");
  const safeUrl = isMalicious ? "about:blank" : url;

  return {
    href: safeUrl,
    onClick: (e: MouseEvent) => {
      if (isMalicious) {
        e.preventDefault();
        return;
      }
      if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) {
        e.preventDefault();
        history.pushState(null, "", url);
        dispatchEvent(new PopStateEvent("popstate"));
        dispatch(msg);
      }
    },
  };
}
