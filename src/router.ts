// SuperApp — Advanced SPA Router
// Typed URL parsing, Page protocol, lifecycle management, guards

import {
  h, mapEffect, mapSub, mapDispatch,
  type Dispatch, type Sub, type Effect, type Cmd, type VNode,
} from "./hyperapp";
import { navigate as navFxEffect } from "./fx";

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
  init(params: Params, shared: Shared): Model | readonly [Model, Cmd<Msg>];
  update(
    model: Readonly<Model>,
    msg: Msg,
    shared: Readonly<Shared>,
  ): Model | readonly [Model, Cmd<Msg>];
  view(
    model: Readonly<Model>,
    shared: Readonly<Shared>,
    dispatch: Dispatch<Msg>,
  ): VNode;
  subscriptions?(
    model: Readonly<Model>,
    shared: Readonly<Shared>,
  ): Sub<Msg>[];
  save?(model: Readonly<Model>): unknown;
  load?(
    saved: unknown,
    params: Params,
    shared: Shared,
  ): Model | readonly [Model, Cmd<Msg>];
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
  return {
    _tag: "page-route",
    _routeDef: routeDef,
    _config: config,
    _guard: options?.guard,
  };
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
  init(
    url?: URL,
  ): RouterModel<Shared> | readonly [RouterModel<Shared>, Cmd<RouterMsg<Shared>>];
  update(
    model: RouterModel<Shared>,
    msg: RouterMsg<Shared>,
  ):
    | RouterModel<Shared>
    | readonly [RouterModel<Shared>, Cmd<RouterMsg<Shared>>];
  view(
    model: Readonly<RouterModel<Shared>>,
    dispatch: Dispatch<RouterMsg<Shared>>,
  ): VNode;
  subscriptions(
    model: Readonly<RouterModel<Shared>>,
  ): Sub<RouterMsg<Shared>>[];
  listen(): Sub<RouterMsg<Shared>>;
  navigate(url: string, replace?: boolean): Effect<RouterMsg<Shared>>;
  updateShared(fn: (s: Shared) => Shared): RouterMsg<Shared>;
  href<P extends Record<string, any>>(
    routeDef: RouteDef<P>,
    params: P,
  ): string;
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
      const result = cfg.load(saved, params, shared);
      if (Array.isArray(result))
        return { model: result[0], effects: result[1] as Cmd<any> };
      return { model: result, effects: [] };
    }
    const result = cfg.init(params, shared);
    if (Array.isArray(result))
      return { model: result[0], effects: result[1] as Cmd<any> };
    return { model: result, effects: [] };
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
    subs: Sub<any>[],
  ): Sub<RouterMsg<Shared>>[] {
    return subs.map((s) =>
      mapSub(s, (msg: any): RouterMsg<Shared> => ({
        tag: "@@router/PageMsg",
        msg,
      })),
    );
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
  ): RouterModel<Shared> | readonly [RouterModel<Shared>, Cmd<RouterMsg<Shared>>] {
    const cache = new Map(model._cache);
    const redirected =
      resolved.finalUrl.pathname !== url.pathname ||
      resolved.finalUrl.search !== url.search;
    const cacheKey = resolved.finalUrl.pathname + resolved.finalUrl.search;
    const redirectEffects: Effect<RouterMsg<Shared>>[] = redirected
      ? [
          navFxEffect(
            resolved.finalUrl.pathname + resolved.finalUrl.search,
            true,
          ) as Effect<any>,
        ]
      : [];

    // Save current page
    if (model._page) {
      const cfg = getConfig(model._page.routeIdx);
      if (cfg?.save) {
        const saved = cfg.save(model._page.model as any);
        if (saved !== undefined) cache.set(model._page.key, saved);
      }
    }

    // Same page check — return exact same reference to avoid re-render
    if (
      model._page &&
      model._page.key === cacheKey &&
      model._page.routeIdx === resolved.routeIdx
    ) {
      return redirectEffects.length > 0 ? [model, redirectEffects] : model;
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

    return allEffects.length > 0 ? [next, allEffects] : next;
  }

  function transitionToNotFound(
    model: RouterModel<Shared>,
    url: URL,
    path: string,
  ): RouterModel<Shared> | readonly [RouterModel<Shared>, Cmd<RouterMsg<Shared>>] {
    const cache = new Map(model._cache);

    if (model._page) {
      const cfg = getConfig(model._page.routeIdx);
      if (cfg?.save) {
        const saved = cfg.save(model._page.model as any);
        if (saved !== undefined) cache.set(model._page.key, saved);
      }
    }

    if (!notFoundConfig) {
      return { ...model, url, _page: null, _cache: cache };
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

    return effects.length > 0 ? [next, mapPageEffects(effects)] : next;
  }

  // ── Stable listen subscription (memoized to avoid re-subscribe loop) ──

  const LISTEN_PROPS = {};
  const listenRunner = (dispatch: Dispatch<RouterMsg<Shared>>) => {
    const handler = () => {
      dispatch({ tag: "@@router/UrlChanged", url: new URL(location.href) });
    };
    handler();
    addEventListener("popstate", handler);
    return () => removeEventListener("popstate", handler);
  };
  const listenSub: Sub<RouterMsg<Shared>> = [listenRunner, LISTEN_PROPS];

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
          if (!model._page) return model;
          const cfg = getConfig(model._page.routeIdx);
          if (!cfg) return model;

          const result = cfg.update(
            model._page.model as any,
            msg.msg,
            model.shared,
          );

          if (Array.isArray(result)) {
            const [newPageModel, cmd] = result;
            return [
              {
                ...model,
                _page: { ...model._page, model: newPageModel },
              },
              mapPageEffects(cmd as Cmd<any>),
            ];
          }

          return {
            ...model,
            _page: { ...model._page, model: result },
          };
        }

        case "@@router/UpdateShared": {
          return { ...model, shared: msg.fn(model.shared) };
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

      return cfg.view(model._page.model as any, model.shared, pageDispatch);
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
      return navFxEffect(url, replace) as Effect<any>;
    },

    updateShared(fn) {
      return { tag: "@@router/UpdateShared", fn };
    },

    href(routeDef, params) {
      return routeDef.toUrl(params);
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

import { app, type AppInstance } from "./hyperapp";

export function routerApp<Shared>(config: {
  router: Router<Shared>;
  layout: (
    content: VNode,
    shared: Readonly<Shared>,
    dispatch: Dispatch<RouterMsg<Shared>>,
  ) => VNode;
  node: HTMLElement;
  debug?: boolean | { console?: boolean; history?: boolean; maxHistory?: number };
}): AppInstance<{ router: RouterModel<Shared> }, RouterMsg<Shared>> {
  const { router } = config;

  type S = { router: RouterModel<Shared> };
  type M = RouterMsg<Shared>;

  const wrap = (r: RouterModel<Shared> | readonly [RouterModel<Shared>, Cmd<M>]): S | readonly [S, Cmd<M>] =>
    Array.isArray(r) ? [{ router: r[0] as RouterModel<Shared> }, r[1] as Cmd<M>] : { router: r as RouterModel<Shared> };

  return app<S, M>({
    init: wrap(router.init()) as S,
    update: (state, msg) => wrap(router.update(state.router, msg)),
    view: (state, dispatch) =>
      config.layout(router.view(state.router, dispatch), state.router.shared, dispatch),
    subscriptions: (state) => [
      ...router.subscriptions(state.router),
      router.listen(),
    ],
    node: config.node,
    debug: config.debug,
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
): Sub<Msg> {
  return [
    (
      dispatch: Dispatch<Msg>,
      props: { routes: Route<Msg>[]; notFound?: (path: string) => Msg },
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
    },
    { routes, notFound },
  ];
}

/** @deprecated Use navigate from superapp/fx or router.navigate() */
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
