# Router

Teelm includes a built-in SPA router with typed URL parsing, a Page protocol for lifecycle management, guards, redirects, page caching, error boundaries, and code generation from file conventions.

## Overview

The router system has four layers:

1. **Route definitions** -- Typed URL patterns with parsers
2. **Page protocol** -- Lifecycle interface (`init`, `update`, `view`, `subscriptions`, `save`, `load`, `onMount`, `onUnmount`, `afterUpdate`, `onError`, `errorView`)
3. **Router instance** -- Matches URLs to pages, manages transitions
4. **routerApp()** -- Zero-boilerplate app setup with layout

---

## Typed URL Parser

### route()

Define routes with typed path and query parameters.

```ts
import { route, str, int, float, oneOf, q } from "teelm/router";

// Static route
const homeRoute = route("/");
const aboutRoute = route("/about");

// Dynamic path parameters
const userRoute = route("/users/:id", { id: str });
const postRoute = route("/posts/:id", { id: int });
const priceRoute = route("/prices/:value", { value: float });

// Constrained parameter
const statusRoute = route("/filter/:status", {
  status: oneOf(["active", "archived", "draft"] as const),
});

// Query parameters
const searchRoute = route("/search", {
  q: q.str(""),
  page: q.int(1),
  sort: q.optional.str(),
});

// Mixed path + query
const userPostsRoute = route("/users/:id/posts", {
  id: int,
  page: q.int(1),
  drafts: q.bool(false),
});

// Wildcard
const catchAllRoute = route("/docs/*");
```

### Path Parsers

| Parser | Type | Description |
|--------|------|-------------|
| `str` | `string` | Any non-empty string segment |
| `int` | `number` | Integer value |
| `float` | `number` | Finite numeric value |
| `oneOf(values)` | `T` | One of a fixed set of string values |

### Query Parsers

| Parser | Type | Description |
|--------|------|-------------|
| `q.str(fallback)` | `string` | String with default |
| `q.int(fallback)` | `number` | Integer with default |
| `q.float(fallback)` | `number` | Float with default |
| `q.bool(fallback)` | `boolean` | Boolean (`"true"`/`"1"` = true) with default |
| `q.optional.str()` | `string \| undefined` | Optional string |
| `q.optional.int()` | `number \| undefined` | Optional integer |

### RouteDef Interface

Every `route()` call returns a `RouteDef<Params>` with:

- `pattern` -- The normalized URL pattern string
- `parse(pathname, search?)` -- Try to match a URL, returns `Params | null`
- `toUrl(params)` -- Generate a URL string from parameters

```ts
const r = route("/users/:id", { id: int });

r.parse("/users/42");         // { id: 42 }
r.parse("/users/abc");        // null (not an integer)
r.toUrl({ id: 42 });          // "/users/42"
```

---

## PageConfig Protocol

Each page implements the `PageConfig` interface. This is the contract between your page and the router.

```ts
interface PageConfig<Model, Msg, Shared, Params> {
  // Required — all return tuples
  init(params: Params, shared: Shared): readonly [Model, Cmd<Msg>];
  update(model: Readonly<Model>, msg: Msg, shared: Readonly<Shared>): readonly [Model, Cmd<Msg>];
  view(model: Readonly<Model>, shared: Readonly<Shared>, dispatch: Dispatch<Msg>): VNode;

  // Optional
  subscriptions?(model: Readonly<Model>, shared: Readonly<Shared>): Subs<Msg>;
  save?(model: Readonly<Model>): unknown;
  load?(saved: unknown, params: Params, shared: Shared): readonly [Model, Cmd<Msg>];
  onMount?(ctx: PageMountContext<Model, Msg, Shared, Params>): void;
  onUnmount?(ctx: PageMountContext<Model, Msg, Shared, Params>): void;
  afterUpdate?(ctx: PageAfterUpdateContext<Model, Msg, Shared, Params>): void;
  onError?(ctx: PageErrorContext<Model, Msg, Shared, Params>): void;
  errorView?(ctx: PageErrorContext<Model, Msg, Shared, Params>): VNode;
}
```

`init`, `update`, and `load` always return `readonly [Model, Cmd<Msg>]`. Use `noFx(model)` when there are no effects, or `withFx(model, ...effects)` when there are.

### Type Parameters

| Parameter | Meaning |
|-----------|---------|
| `Model` | Page-local state |
| `Msg` | Page-local message type |
| `Shared` | Application-wide shared state (passed down from router) |
| `Params` | URL parameters extracted by the route parser |

### Lifecycle

1. **Navigation to page**: `init(params, shared)` is called (or `load(saved, params, shared)` if cache exists)
2. **User interaction**: `update(model, msg, shared)` handles messages
3. **Rendering**: `view(model, shared, dispatch)` produces the page's VNode
4. **Active subscriptions**: `subscriptions(model, shared)` declares event sources
5. **Navigation away**: `save(model)` caches page state (if defined)
6. **Return to page**: `load(saved, params, shared)` restores from cache
7. **DOM mounted**: `onMount(ctx)` runs after the page has been rendered into the DOM
8. **DOM updated**: `afterUpdate(ctx)` runs after subsequent renders, including shared-state changes
9. **DOM removed**: `onUnmount(ctx)` runs before the page is torn down

If `view()` throws, the router calls `onError(ctx)` and renders `errorView(ctx)` (or a built-in fallback if `errorView` is omitted) instead of crashing the entire app. Lifecycle hooks (`onMount`, `onUnmount`, `afterUpdate`) that throw also route through `onError` with the corresponding `phase`.

### Page Caching with save/load

When a user navigates away from a page, `save()` is called to extract cacheable data. When they return, `load()` restores it as a `[Model, Cmd<Msg>]` tuple — so you can re-trigger any "freshen on reopen" effects from `load`.

```ts
import { noFx, withFx } from "teelm";
import { type PageConfig } from "teelm/router";

const userPage: PageConfig<UserModel, UserMsg, Shared, { id: string }> = {
  init: (params) => noFx({ id: params.id, data: null, loading: true }),
  // ...

  save: (model) => model,                    // capture full model
  load: (saved) => noFx(saved as UserModel), // restore as-is, no effects
};
```

The cache key is `pathname + search`. If `save` is not defined, the page always re-initializes via `init`.

### Example Page

```ts
import { h, noFx, withFx, type Dispatch } from "teelm";
import { http } from "teelm/fx";
import { Decode, HttpError } from "teelm/functional";
import { type PageConfig } from "teelm/router";
import type { Shared } from "../shared";

interface User { id: number; name: string }

interface Model {
  id: number;
  user: User | null;
  loading: boolean;
  error: string | null;
}

type Msg =
  | { tag: "GotUser"; user: User }
  | { tag: "FetchFailed"; error: HttpError };

const userDecoder = Decode.object({
  id: Decode.number,
  name: Decode.string,
});

export const page: PageConfig<Model, Msg, Shared, { id: number }> = {
  init: (params) => withFx(
    { id: params.id, user: null, loading: true, error: null },
    http({
      url: `/api/users/${params.id}`,
      decoder: userDecoder,
      toMsg: (r) => r.tag === "Ok"
        ? { tag: "GotUser", user: r.value }
        : { tag: "FetchFailed", error: r.error },
    }),
  ),

  update: (model, msg) => {
    switch (msg.tag) {
      case "GotUser":
        return noFx({ ...model, user: msg.user, loading: false });
      case "FetchFailed":
        return noFx({ ...model, error: HttpError.toString(msg.error), loading: false });
    }
  },

  view: (model) => {
    if (model.loading) return h("p", {}, "Loading...");
    if (model.error)   return h("p", { class: "error" }, model.error);
    return h("h1", {}, model.user!.name);
  },

  save: (model) => model,
  load: (saved) => noFx(saved as Model),
};
```

---

## Guards and Redirects

Guards run before a page is initialized. Return `true` to allow access, or a URL string to redirect.

```ts
import { page, route } from "teelm/router";

page(route("/admin"), adminPage, {
  guard: (params, shared) => {
    if (!shared.user) return "/login";
    if (!shared.user.isAdmin) return "/";
    return true;
  },
});
```

Guards can chain: if a redirect target also has a guard, it will be evaluated (up to 5 levels deep to prevent infinite loops; if the chain exhausts, the router falls through to `notFound`).

When a guard redirects, the browser URL is updated via `history.replaceState` so the user sees the final URL.

---

## createRouter()

Creates a `Router` instance that manages page transitions.

```ts
const router = createRouter<Shared>({
  routes: [
    page(route("/"), homePage),
    page(route("/users"), usersPage),
    page(route("/users/:id", { id: str }), userDetailPage),
  ],
  shared: { appName: "MyApp", user: null },
  notFound: notFoundPage,  // optional
});
```

### Router Interface

```ts
interface Router<Shared> {
  init(url?: URL): readonly [RouterModel<Shared>, Cmd<RouterMsg<Shared>>];
  update(model: RouterModel<Shared>, msg: RouterMsg<Shared>):
    readonly [RouterModel<Shared>, Cmd<RouterMsg<Shared>>];
  view(model: RouterModel<Shared>, dispatch: Dispatch<RouterMsg<Shared>>): VNode;
  subscriptions(model: RouterModel<Shared>): Subs<RouterMsg<Shared>>;
  listen(): Sub<RouterMsg<Shared>>;
  navigate(url: string, replace?: boolean): Effect<RouterMsg<Shared>>;
  updateShared(fn: (s: Shared) => Shared): RouterMsg<Shared>;
  href<P>(routeDef: RouteDef<P>, params: P): string;
}
```

`init(url?)` and `routerApp({ url })` let you bootstrap the router from a deterministic URL instead of the current browser location.

### RouterMsg

The router uses three internal message types:

| Message | Triggered by |
|---------|-------------|
| `@@router/UrlChanged` | Browser navigation (popstate) |
| `@@router/PageMsg` | Page-local messages (wrapped automatically) |
| `@@router/UpdateShared` | `router.updateShared()` calls |

### Updating Shared State

Dispatch `router.updateShared()` to modify shared state from any page:

```ts
// In a page's update, return an effect that updates shared state
import { dispatchMsg } from "teelm/fx";

return withFx(
  model,
  // Cast through the router-Msg <-> page-Msg boundary if needed,
  // or dispatch directly from a lifecycle hook (onMount, afterUpdate).
  dispatchMsg(router.updateShared((s) => ({ ...s, user: loggedInUser }))),
);
```

---

## routerApp()

Zero-boilerplate convenience that wires router, layout, and app together.

```ts
import { routerApp, routerLink } from "teelm/router";

routerApp({
  router,
  layout: (content, shared, dispatch) =>
    h("div", {},
      h("nav", {},
        h("a", { ...routerLink("/") }, shared.appName),
        h("a", { ...routerLink("/about") }, "About"),
      ),
      h("main", {}, content),
    ),
  node: document.getElementById("app")!,
  url: new URL("https://example.test/users"),  // optional: deterministic boot
  listen: false,                                // optional: skip popstate listener
  debug: true,
});
```

The `layout` function receives:
- `content` -- The VNode produced by the current page's `view`
- `shared` -- The shared state
- `dispatch` -- A `Dispatch<RouterMsg<Shared>>` for dispatching router-level messages

`listen` defaults to `true`. Set `listen: false` when you want to control navigation messages yourself in tests, previews, or custom embedding environments.

---

## routerLink()

Creates SPA link props. Spread onto `<a>` elements to get client-side navigation.

```ts
h("a", { ...routerLink("/users/42") }, "View User")
```

Returns `{ href: string, onClick: (e: MouseEvent) => void }`. The onClick handler:
- Prevents default browser navigation
- Pushes to history via `history.pushState`
- Dispatches a `popstate` event so the router picks up the change
- Respects modifier keys (Ctrl/Meta/Shift + click opens in new tab normally)

### Generating URLs

Use `router.href()` to generate URL strings from a `RouteDef`:

```ts
const url = router.href(userRoute, { id: 42 });
// "/users/42"

h("a", { ...routerLink(url) }, "View user 42")
```

If your code paths require a typed `Path` or `Url`, the branded constructors from `teelm/functional` give you opaque values without unchecked passthrough:

```ts
import { Path, Url } from "teelm/functional";

const userPath: Path = Path.fromString(router.href(userRoute, { id: 42 }));
const homepage: Url | null = Url.parse("https://example.com").tag === "Just"
  ? Url.parse("https://example.com").value as Url
  : null;
```

`Path.fromString` normalizes the leading `/`, while `Path.parse` rejects empty strings. `Url.parse` returns `Maybe<Url>` and rejects malformed inputs.

---

## Code Generation

The CLI can generate router code from your file structure.

### File Conventions

Place page files in `src/pages/`. Each file must export `page` as a `PageConfig`.

Route discovery conventions used by `teelm gen`:

- lowercase `index.ts` / `index.tsx` maps to the parent directory route
- files or folders prefixed with `_` are ignored
- `*.component.ts(x)`, `*.test.ts(x)`, `*.spec.ts(x)`, and `*.d.ts` are ignored
- project-root `.teelmignore` adds extra ignore patterns

```
src/pages/
  Home.ts          -> /
  About.ts         -> /about
  NotFound.ts      -> 404 handler
  users/
    Index.ts       -> /users
    [id].ts        -> /users/:id
    _users.ts      -> ignored helper
    [id:int]/
      Edit.ts      -> /users/:id/edit
  Blog/
    Index.ts       -> /blog
    [slug].ts      -> /blog/:slug
```

### Naming Rules

- `Home.ts` always maps to `/`
- `NotFound.ts` is used as the 404 handler
- `Index.ts` maps to the parent directory's route
- `[param].ts` creates a dynamic `:param` segment (default: string)
- `[param:int].ts` creates a typed integer parameter
- `[param:float].ts` creates a typed float parameter
- CamelCase names become kebab-case routes (`UserProfile` -> `user-profile`)

### Running gen

```bash
teelm gen
```

This scans `src/pages/`, sorts routes (static before dynamic, more-specific first), and writes `src/generated/router.ts`:

```ts
// AUTO-GENERATED by teelm gen -- do not edit
import { createRouter, route, page, str, int } from "teelm/router";
import type { Shared } from "../shared";
import { initialShared } from "../shared";

import { page as Home } from "../pages/Home";
import { page as About } from "../pages/About";
import { page as UsersIndex } from "../pages/users/Index";
import { page as UsersId } from "../pages/users/[id]";
import { page as NotFound } from "../pages/NotFound";

export const router = createRouter<Shared>({
  routes: [
    page(route("/"), Home),
    page(route("/about"), About),
    page(route("/users"), UsersIndex),
    page(route("/users/:id", { id: str }), UsersId),
  ],
  shared: initialShared,
  notFound: NotFound,
});
```

### Route Sorting

Routes are sorted for correct matching priority:
1. Static routes before dynamic routes
2. More specific routes (more segments) before less specific
3. Alphabetical as tiebreaker

### Shared State Convention

The generated router imports `Shared` type and `initialShared` value from `src/shared.ts`:

```ts
// src/shared.ts
export interface Shared {
  appName: string;
}

export const initialShared: Shared = {
  appName: "MyApp",
};
```

---

## Adding Pages via CLI

```bash
teelm add "users/[id:int]/Edit"
```

This creates `src/pages/users/[id:int]/Edit.ts` with a scaffold and automatically runs `teelm gen` to update the router. The generated scaffold uses tuple-only `init`/`update`:

```ts
import { h, noFx, type Dispatch } from "teelm";
import { type PageConfig } from "teelm/router";
import type { Shared } from "../../../shared";

export const page: PageConfig<{ id: number }, never, Shared, { id: number }> = {
  init: (params) => noFx({ ...params }),
  update: (model) => noFx(model),
  view: (model, shared) =>
    h("div", { class: "prose max-w-none" },
      h("h1", {}, "/users/:id/edit"),
    ),
};
```

Use `--jsx` to generate `.tsx` files:

```bash
teelm add "Dashboard" --jsx
```
