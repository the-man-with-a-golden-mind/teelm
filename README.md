```
  ╔═╗╦ ╦╔═╗╔═╗╦═╗╔═╗╔═╗╔═╗
  ╚═╗║ ║╠═╝║╣ ╠╦╝╠═╣╠═╝╠═╝
  ╚═╝╚═╝╩  ╚═╝╩╚═╩ ╩╩  ╩
```

**Elm-inspired TypeScript framework**

[![version](https://img.shields.io/badge/version-0.1.0-blue)](https://github.com/nickabal/teelm)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6)](https://www.typescriptlang.org/)
[![tests](https://img.shields.io/badge/tests-bun%20test-yellow)](https://bun.sh)

Teelm is a functional, type-safe web framework built on The Elm Architecture. It brings Elm's proven patterns -- immutable state, message-driven updates, effects as data, and declarative subscriptions -- to TypeScript with zero runtime dependencies.

---

## Feature Highlights

- **The Elm Architecture (TEA)** -- State, Update, View with immutable state and discriminated union messages
- **Tuple-only init/update** -- `init` and `update` always return `[state, cmd]`. Use `noFx(state)` for no effects.
- **Branded `Cmd<Msg>` & `Sub<Msg>`** -- only constructable through helpers (`none`, `withFx`, `batch`, `mapCmd`)
- **`Result` / `Maybe` / `Decoder`** in `teelm/functional` for principled error handling
- **`Task<E, T>`** in `teelm/task` for composable async operations (Elm-style `andThen`/`map`/`mapError`)
- **Typed event helpers** in `teelm/events` (`makeEvents(dispatch)`)
- **Decoder-based HTTP** -- `http()` validates the body and surfaces a `Result<T, HttpError>` discriminated union (`BadUrl | Timeout | NetworkError | BadStatus | BadBody`)
- **Storage as `Result`** -- `storageGet`/`storageSet` report quota/security errors instead of swallowing them
- **Branded `Url` / `Path` / `RouteName`** in `teelm/functional` to prevent unvalidated string passthrough
- **Always-frozen state** -- mutation bugs surface immediately, not only with `debug: true`. Opt-out via `freezeState: false`.
- **Typed URL routing** -- Page protocol with typed parsers, guards, redirects, and page caching (like elm-spa)
- **Page lifecycle & error boundaries** -- `onMount`, `onUnmount`, `afterUpdate`, and per-page fallback UI
- **Effects & Subscriptions** -- HTTP, timers, localStorage, WebSocket, keyboard, resize, animation frames
- **Keyed VDOM reconciliation** -- Head/tail optimized diffing with keyed children
- **JSX and h() support** -- Use JSX with automatic transform or plain `h()` calls
- **CLI tool** -- `new`, `add page`, `gen` router, `dev`, `build`
- **Time-travel debugger** -- Visual overlay with state inspection and history navigation
- **Zero runtime dependencies** -- The entire framework is self-contained

---

## Quick Start

```bash
bunx teelm new my-app
cd my-app
bun install
bunx teelm dev
```

This scaffolds a project with Vite, Tailwind CSS v4, a home page, an about page, a 404 page, and a generated router.

---

## Core Concepts

### 1. State, Update, View

The fundamental TEA cycle: define your state, messages, update function, and view.
`init` and `update` always return a tuple `[state, cmd]`. Use `noFx(state)` when there are no effects.

```ts
import { app, h, noFx, type Dispatch, type Init, type UpdateResult } from "teelm";

interface State { count: number }

type Msg = { tag: "Inc" } | { tag: "Dec" };

const init: Init<State, Msg> = noFx({ count: 0 });

function update(state: State, msg: Msg): UpdateResult<State, Msg> {
  switch (msg.tag) {
    case "Inc": return noFx({ ...state, count: state.count + 1 });
    case "Dec": return noFx({ ...state, count: state.count - 1 });
  }
}

function view(state: State, dispatch: Dispatch<Msg>) {
  return h("div", {},
    h("h1", {}, String(state.count)),
    h("button", { onClick: () => dispatch({ tag: "Inc" }) }, "+"),
    h("button", { onClick: () => dispatch({ tag: "Dec" }) }, "-"),
  );
}

app({ init, update, view, node: document.getElementById("app")! });
```

### 2. Effects

Side effects are returned from `update` as `[State, Cmd<Msg>]` tuples. They run after the state update.

Effects are generic over their props, so custom effect creators can now enforce the payload shape at compile time:

```ts
type Effect<Msg, Props = unknown> = readonly [EffectFn<Msg, Props>, Props];
```

```ts
import { withFx, noFx } from "teelm";
import { delay, http } from "teelm/fx";
import { Decode } from "teelm/functional";

const usersDecoder = Decode.array(Decode.object({
  id: Decode.number,
  name: Decode.string,
}));

function update(state: State, msg: Msg) {
  switch (msg.tag) {
    case "DelayedInc":
      return withFx(state, delay(500, { tag: "Inc" }));

    case "FetchUsers":
      return withFx(state,
        http({
          url: "/api/users",
          decoder: usersDecoder,
          // result: Result<User[], HttpError> — pattern-match on tag
          toMsg: (result) => result.tag === "Ok"
            ? { tag: "GotUsers", users: result.value }
            : { tag: "FetchFailed", error: result.error },
        }),
      );

    case "Inc":
      return noFx({ ...state, count: state.count + 1 });
  }
}
```

`HttpError` is a discriminated union (`BadUrl | Timeout | NetworkError | BadStatus | BadBody`) — you can branch on `error.tag` for precise messaging without parsing strings.

### 3. Subscriptions

Declarative event sources. Return active subscriptions based on state; the runtime manages start/stop.

```ts
import { interval, onKeyDown } from "teelm/subs";
import type { Subs } from "teelm";

function subscriptions(state: State): Subs<Msg> {
  // Subs<Msg> allows falsy entries (`false | null | undefined`) for ergonomic
  // conditional subs — they are filtered by the runtime.
  return [
    state.auto && interval(1000, { tag: "Tick" }),
    onKeyDown((key) => ({ tag: "KeyPressed", key })),
  ];
}

app({ init, update, view, subscriptions, node: document.getElementById("app")! });
```

### 3.5 App Lifecycle Hooks

`app()` can also run code after the DOM commit:

```ts
app({
  init,
  update,
  view,
  onMount: ({ node }) => {
    node.querySelector("#search")?.focus();
  },
  afterRender: ({ state, prevState }) => {
    if (state.count !== prevState?.count) {
      document.title = `Count: ${state.count}`;
    }
  },
  onUnmount: () => {
    document.title = "Teelm";
  },
  node: document.getElementById("app")!,
});
```

### 4. Router & Pages

File-based routing with typed URL parsers and a Page protocol.

```ts
import { createRouter, routerApp, routerLink, route, page, str, int } from "teelm/router";

// Define typed routes
const homeRoute   = route("/");
const userRoute   = route("/users/:id", { id: int });

// Each page implements the PageConfig protocol
const homePage: PageConfig<{}, never, Shared, {}> = {
  init: () => ({}),
  update: (model) => model,
  view: (_model, shared) => h("h1", {}, `Welcome to ${shared.appName}`),
};

// Create router and boot
const router = createRouter({
  routes: [
    page(homeRoute, homePage),
    page(userRoute, userDetailPage),
  ],
  shared: { appName: "MyApp" },
  notFound: notFoundPage,
});

routerApp({
  router,
  layout: (content, shared) => h("div", {}, content),
  node: document.getElementById("app")!,
});
```

Pages can opt into DOM-aware lifecycle hooks and an error boundary:

```ts
const pageWithChart: PageConfig<Model, Msg, Shared, {}> = {
  // ...
  onMount: ({ root }) => mountChart(root.querySelector("#chart")!),
  afterUpdate: ({ model, prevModel }) => {
    if (model.series !== prevModel.series) redrawChart(model.series);
  },
  onUnmount: () => destroyChart(),
  onError: ({ error, phase }) => console.error("page failed", phase, error),
  errorView: ({ error }) => h("div", { role: "alert" }, String(error)),
};
```

If you need deterministic bootstrapping outside the browser's current URL, `routerApp()` also accepts `url` and `listen: false`.

### Page File Conventions

`teelm gen` treats only route files in `src/pages/` as pages. The generator skips:

- files and directories prefixed with `_`
- `*.component.ts(x)`
- `*.test.ts(x)`, `*.spec.ts(x)`, and `*.d.ts`
- patterns listed in project-root `.teelmignore`

Use `src/components/` or `src/lib/` for shared non-route code. Lowercase `index.ts(x)` is supported as a route entrypoint.

Use `routerLink` for SPA navigation without full page reloads:

```ts
h("a", { ...routerLink("/users/42") }, "View User")
```

### 5. JSX Support

Configure `tsconfig.json`:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "teelm"
  }
}
```

Then use JSX in your pages:

```tsx
const view = (state: State, dispatch: Dispatch<Msg>) => (
  <div>
    <h1>{state.count}</h1>
    <button onClick={() => dispatch({ tag: "Inc" })}>+</button>
  </div>
);
```

### 6. Nested TEA (Composition)

Compose child modules with `mapDispatch`, `mapCmd`, and `mapSub`:

```ts
import { mapDispatch, mapCmd, mapSub } from "teelm";
import * as Counter from "./counter";

type Msg = { tag: "Child"; msg: Counter.Msg };

// In view:
Counter.view(
  state.child,
  mapDispatch(dispatch, (m: Counter.Msg): Msg => ({ tag: "Child", msg: m })),
);

// In update, lift the child Cmd into the parent's Msg space:
const [childState, childCmd] = Counter.update(state.child, msg.msg);
return [
  { ...state, child: childState },
  mapCmd(childCmd, (m): Msg => ({ tag: "Child", msg: m })),
];
```

### 7. Tasks (composable async)

`Task<E, T>` describes async work that may fail with `E` or succeed with `T`. Tasks compose via `andThen`/`map`/`mapError`, so you don't need an intermediate `Msg` for every step in a chain.

```ts
import { Task } from "teelm/task";
import { withFx } from "teelm";

const fetchAuth = Task.fromPromise(
  () => fetch("/api/auth").then(r => r.json()),
  (e) => ({ tag: "AuthFailed" as const, message: String(e) }),
);

const fetchUser = (token: string) => Task.fromPromise(
  () => fetch(`/api/me?t=${token}`).then(r => r.json()),
  (e) => ({ tag: "UserFailed" as const, message: String(e) }),
);

const loadCurrentUser = Task.andThen(fetchAuth, ({ token }) => fetchUser(token));

// In update:
return withFx(state, Task.attempt(loadCurrentUser, (r) => ({ tag: "GotUser", r })));
```

### 8. Typed event helpers

```ts
import { makeEvents } from "teelm/events";

function view(state: State, dispatch: Dispatch<Msg>) {
  const E = makeEvents(dispatch);
  return h("form", E.onSubmit({ tag: "Save" }),
    h("input", E.onInput((value) => ({ tag: "SetName", value }))),
    h("button", E.onClick({ tag: "Save" }), "Save"),
  );
}
```

### 9. Decoders & branded URLs

```ts
import { Decode, Url, Path } from "teelm/functional";

// Validate untrusted JSON before it reaches your model
const userDecoder = Decode.object({
  id: Decode.number,
  name: Decode.string,
  email: Decode.optional(Decode.string),
});

// Branded types prevent passing raw strings where validated values are required
const u: Url = Url.parse("https://example.com").value!;
const p: Path = Path.fromString("/users/42");
```

---

## API Reference

### `teelm` (core)

| Export | Description |
|--------|-------------|
| `h(tag, props?, ...children)` | Create a VNode |
| `text(value)` | Create a text VNode |
| `memo(component, props)` | Memoized component (skips re-render if props unchanged) |
| `lazy(view, data)` | Lazy VNode (alias for memo pattern) |
| `app(config)` | Mount an application, returns `AppInstance`; config supports `onMount`, `afterRender`, `onUnmount`, `freezeState` |
| `noFx(state)` | Wrap state with no effects: `[state, none]` |
| `withFx(state, ...effects)` | Wrap state with effects: `[state, Cmd<Msg>]` |
| `batch(commands)` | Merge multiple `Cmd` arrays into one |
| `none` | Empty command (Cmd&lt;never&gt;, polymorphic) |
| `mapEffect(effect, fn)` | Transform an effect's message type |
| `mapCmd(cmd, fn)` | Transform every effect in a Cmd |
| `mapSub(sub, fn)` | Transform a subscription's message type |
| `mapDispatch(dispatch, fn)` | Transform a dispatch function's message type |
| `batchSubs(...subs)` | Merge subscriptions from multiple sources |
| `resolveClass(value)` | Resolve class values (string, array, or object) |
| `type Init<S, Msg>`, `Update<S, Msg>`, `UpdateResult<S, Msg>` | Tuple-only types: `readonly [S, Cmd<Msg>]` |
| `type Cmd<Msg>`, `Sub<Msg, P>`, `Subs<Msg>` | Branded; `Subs<Msg>` allows falsy entries |

### `teelm/testing`

| Export | Description |
|--------|-------------|
| `getModel(result)` | Unwrap `State` from `State | [State, Cmd]` |
| `getEffects(result)` | Unwrap `Cmd` from an update result |
| `hasEffects(result)` | Type guard for tuple-style update results |
| `createDispatchSpy()` | Record dispatched messages in tests |
| `runEffect(effect, dispatch)` | Execute an effect tuple with its props |

### `teelm/fx` (effects)

| Export | Description |
|--------|-------------|
| `http({ url, decoder, toMsg, options?, expect?, timeoutMs? })` | Fetch + decode; dispatches `Result<T, HttpError>` |
| `delay(ms, msg)` | Dispatch a message after a delay |
| `navigate(url, replace?)` | Push or replace browser history |
| `storageSet(key, value, toMsg?)` | Write to localStorage; optional `Result<undefined, StorageError>` callback |
| `storageGet({ key, decoder, json?, toMsg })` | Read + decode; dispatches `Result<T \| undefined, StorageError \| string>` |
| `log(...args)` | Console.log (debug effect) |
| `dispatchMsg(msg)` | Dispatch a message as an effect |
| `compactEffects(...effects)` | Filter out falsy effects from a list |
| `type StorageError` | `QuotaExceeded \| SecurityError \| Unavailable \| Unknown` |

### `teelm/functional` (Result, Maybe, Decoder, brands)

| Export | Description |
|--------|-------------|
| `Result.ok / err / map / mapError / andThen / withDefault / toMaybe` | Discriminated union for fallible computations |
| `Maybe.just / nothing / map / andThen / withDefault / fromNullable` | Optional values |
| `Decode.string / number / boolean / null / unknown` | Primitive decoders |
| `Decode.array / field / optional / oneOf / object / map / andThen` | Decoder combinators |
| `Decode.fromJsonString(decoder)` | Parse JSON text and decode |
| `HttpError` constructors + `.toString()` | `BadUrl \| Timeout \| NetworkError \| BadStatus \| BadBody` |
| `Url.parse / fromString / toString / isAbsolute` | Branded URL strings |
| `Path.parse / fromString / toString` | Branded path strings |
| `RouteName.fromString / toString` | Branded route name strings |
| `Opaque<T, K>`, `brand<T, K>(val)` | Build your own branded type |
| `pipe(x, ...fns)` | Left-to-right function composition |

### `teelm/task` (Task&lt;E, T&gt;)

| Export | Description |
|--------|-------------|
| `Task.succeed(v) / fail(e)` | Constant tasks |
| `Task.fromTry(fn, onError)` | Wrap a sync thunk |
| `Task.fromPromise(create, onError)` | Wrap a Promise; rejections become Err |
| `Task.fromPromiseResult(create)` | Wrap a Promise&lt;Result&gt; |
| `Task.map / mapError / andThen / onError` | Compose tasks |
| `Task.sequence(tasks) / Task.all(tasks)` | Run in series / parallel |
| `Task.attempt(task, toMsg)` | Effect that always dispatches a Result message |
| `Task.perform(task, toMsg)` | Like `attempt` but for `Task<never, T>` |

### `teelm/events` (typed event helpers)

| Export | Description |
|--------|-------------|
| `makeEvents(dispatch)` | Returns object with `onClick`, `onInput`, `onChange`, `onChecked`, `onSubmit`, `onSubmitWith`, `onKeyDown`, `onKeyUp`, `onEnter`, `onEscape`, `onFocus`, `onBlur`, `onClickWith`, `onDoubleClick` |

### `teelm/subs` (subscriptions)

| Export | Description |
|--------|-------------|
| `interval(ms, msg)` | Recurring timer. `msg` can be a value or `(now) => Msg` |
| `onKeyDown(msg)` | Keyboard keydown. `msg: (key, event) => Msg` |
| `onKeyUp(msg)` | Keyboard keyup. `msg: (key, event) => Msg` |
| `onMouseMove(msg)` | Mouse movement. `msg: (x, y) => Msg` |
| `onResize(msg)` | Window resize. `msg: (width, height) => Msg` |
| `onUrlChange(msg)` | URL popstate. `msg: (url: URL) => Msg` |
| `onAnimationFrame(msg)` | requestAnimationFrame loop. `msg: (timestamp) => Msg` |
| `onEvent(event, msg, target?)` | Generic DOM event listener |
| `websocket({ url, onMessage, onOpen?, onClose?, onError? })` | WebSocket connection |

### `teelm/router`

| Export | Description |
|--------|-------------|
| `route(path, spec?)` | Define a typed route with path/query parsers |
| `str` | Path parser: any string segment |
| `int` | Path parser: integer segment |
| `float` | Path parser: float segment |
| `oneOf(values)` | Path parser: one of a set of string literals |
| `q.str(fallback)` | Query parser: string with default |
| `q.int(fallback)` | Query parser: integer with default |
| `q.float(fallback)` | Query parser: float with default |
| `q.bool(fallback)` | Query parser: boolean with default |
| `q.optional.str()` | Query parser: optional string |
| `q.optional.int()` | Query parser: optional integer |
| `page(routeDef, config, options?)` | Bind a route to a PageConfig |
| `createRouter({ routes, shared, notFound? })` | Create a Router instance |
| `routerApp({ router, layout, node, url?, listen?, debug? })` | Boot an app with routing, optional deterministic URL bootstrap |
| `routerLink(url)` | Returns `{ href, onClick }` for SPA links |

### `teelm/debugger`

| Export | Description |
|--------|-------------|
| `attachDebugger(instance, config?)` | Attach a floating debugger overlay with time-travel |

---

## CLI

```bash
teelm new <name> [--jsx]     # Scaffold a new project
teelm add <pattern> [--jsx]  # Add a page (auto-runs gen)
teelm gen                    # Regenerate router from src/pages/
teelm dev                    # Start Vite dev server (auto-runs gen)
teelm build                  # Production build (auto-runs gen)
```

### Page pattern syntax

```bash
teelm add "About"                  # /about
teelm add "users/[id]"             # /users/:id (string param)
teelm add "users/[id:int]"         # /users/:id (integer param)
teelm add "products/[slug]/Edit"   # /products/:slug/edit
teelm add "Home"                   # / (special: root route)
teelm add "NotFound"               # 404 handler
teelm add "Blog/Index"             # /blog (Index maps to parent)
```

### File naming conventions

| File | Route |
|------|-------|
| `Home.ts` | `/` |
| `About.ts` | `/about` |
| `users/[id].ts` | `/users/:id` |
| `users/[id:int]/Edit.ts` | `/users/:id/edit` |
| `NotFound.ts` | 404 handler |
| `Blog/Index.ts` | `/blog` |

CamelCase filenames are converted to kebab-case routes (e.g., `UserProfile.ts` -> `/user-profile`).

Ignored by `teelm gen`:

- files and directories prefixed with `_`
- `*.component.ts(x)`
- `*.test.ts(x)`, `*.spec.ts(x)`, and `*.d.ts`
- patterns from project-root `.teelmignore`

---

## Examples

| Example | Description |
|---------|-------------|
| `examples/counter` | Counter with effects, subscriptions, and app lifecycle hooks |
| `examples/todo` | Todo app with localStorage persistence plus post-render focus/scroll hooks |
| `examples/nested-tea` | Two independent Counter modules composed via mapDispatch/mapEffect/mapSub |
| `examples/spa-router` | Full SPA with typed routes, page lifecycle hooks, cached page state, error boundaries, and ignored helper files inside `pages/` |

Run an example:

```bash
cd examples/counter
bun install
bunx vite
```

---

## Comparison

| Feature | Teelm | Elm | Teelm | React |
|---------|----------|-----|----------|-------|
| Architecture | TEA | TEA | TEA | Components |
| Language | TypeScript | Elm | JavaScript | JavaScript/TS |
| Runtime deps | 0 | 0 | 0 | react-dom |
| Effects | Return values | Commands | Return values | Hooks/useEffect |
| Subscriptions | Declarative | Ports | Declarative | useEffect |
| Routing | Built-in typed | elm-spa | Community | react-router |
| JSX | Optional | No | Optional | Required |
| VDOM | Keyed | Keyed | Keyed | Fiber |
| Bundle size | ~4KB | ~30KB | ~1KB | ~40KB |
| Time-travel debug | Built-in | Elm Debugger | No | Redux DevTools |
| Nested TEA | mapDispatch/mapEffect/mapSub | Cmd.map/Sub.map | Manual | N/A |

---

## License

MIT
