# Effects and Subscriptions

Teelm manages side effects through three mechanisms:

- **Effects** -- One-shot actions triggered by state updates (HTTP requests, timers, navigation)
- **Subscriptions** -- Ongoing event sources managed declaratively based on state (intervals, keyboard, WebSocket)
- **Tasks** -- Lazy, composable async values; converted to a single effect via `Task.attempt`/`Task.perform`

All three are represented as data, not imperative calls. The runtime executes them.

---

## Effects

An effect is a `[EffectFn, props]` tuple. Effects are produced from `update` (or `init`) by wrapping state with `withFx`.

```ts
type Effect<Msg, P = any> = readonly [EffectFn<Msg, P>, P];
type EffectFn<Msg, P>     = (dispatch: Dispatch<Msg>, props: P) => void;
```

A `Cmd<Msg>` is a list of effects. `Cmd<Msg>` is a *branded* type — the only way to obtain one is via `none`, `withFx`, `batch`, `mapCmd`, or `mapEffect`.

### Returning Effects from Update

`update` always returns a `[State, Cmd<Msg>]` tuple. Use `noFx` (no effects) or `withFx` (one or more effects):

```ts
import { noFx, withFx } from "teelm";
import { storageSet, log } from "teelm/fx";

function update(state: State, msg: Msg) {
  switch (msg.tag) {
    case "Save":
      return withFx(state, storageSet("data", JSON.stringify(state.data)));

    case "NoChange":
      return noFx(state);

    case "MultipleEffects":
      return withFx(state,
        storageSet("data", JSON.stringify(state.data)),
        log("Saved!"),
      );

    case "PlainUpdate":
      return noFx({ ...state, count: state.count + 1 });
  }
}
```

There is no bare-state shorthand for `update` or `init` — every branch must return a tuple. The compiler enforces this via `UpdateResult<S, Msg> = readonly [S, Cmd<Msg>]`.

### Built-in Effects

#### http

Fetch a resource and validate the body with a `Decoder<T>`. The result is a `Result<T, HttpError>` that you pattern-match in `update`.

```ts
import { http } from "teelm/fx";
import { Decode, type HttpError } from "teelm/functional";

interface User { id: number; name: string }

const userDecoder = Decode.object({
  id: Decode.number,
  name: Decode.string,
});

http({
  url: "/api/users/42",
  options: { method: "GET" },        // optional RequestInit
  expect: "json",                    // "json" (default) or "text"
  decoder: userDecoder,
  timeoutMs: 5000,                   // optional; aborts via AbortController
  toMsg: (result) =>
    result.tag === "Ok"
      ? { tag: "GotUser", user: result.value }
      : { tag: "FetchFailed", error: result.error },
})
```

`HttpError` is a discriminated union with explicit cases — pattern-match on `tag` for precise messaging:

```ts
import { HttpError } from "teelm/functional";

case "FetchFailed": {
  const e = msg.error;
  switch (e.tag) {
    case "BadUrl":       return noFx({ ...state, message: `Bad URL: ${e.url}` });
    case "Timeout":      return noFx({ ...state, message: "Request timed out" });
    case "NetworkError": return noFx({ ...state, message: e.message });
    case "BadStatus":    return noFx({ ...state, message: `HTTP ${e.status}: ${e.statusText}` });
    case "BadBody":      return noFx({ ...state, message: `Decoder failed: ${e.reason}` });
  }
}

// or just stringify with the helper:
HttpError.toString(e)  // "BadStatus 404 Not Found"
```

When `expect: "text"` is set, the decoder receives the raw body string. Use `Decode.string` for plain text, or `Decode.fromJsonString(...)` if you want to parse JSON yourself.

#### delay

Dispatch a message after a timeout.

```ts
import { delay } from "teelm/fx";

delay<Msg>(500, { tag: "TimerDone" })
// Dispatches { tag: "TimerDone" } after 500ms
```

#### navigate

Push or replace browser history and trigger the router.

```ts
import { navigate } from "teelm/fx";

navigate<Msg>("/users/42")         // pushState
navigate<Msg>("/login", true)      // replaceState
```

Dispatches a `popstate` event after updating history so the router picks up the change.

#### storageSet

Write a string to localStorage. The optional `toMsg` reports a `Result<undefined, StorageError>` so you can react to quota / security failures.

```ts
import { storageSet, type StorageError } from "teelm/fx";

// Fire-and-forget (errors swallowed silently)
storageSet<Msg>("theme", "dark")

// Explicit Result variant (recommended):
storageSet("theme", "dark", (r) =>
  r.tag === "Ok"
    ? { tag: "ThemeSaved" }
    : { tag: "SaveFailed", error: r.error })
```

`StorageError`:

```ts
type StorageError =
  | { tag: "QuotaExceeded"; message: string }
  | { tag: "SecurityError"; message: string }
  | { tag: "Unavailable";   message: string }
  | { tag: "Unknown";       message: string };
```

#### storageGet

Read from localStorage and decode the value. By default the stored value is JSON-parsed before decoding (`json: true`). Set `json: false` to feed the raw string into the decoder (e.g., with `Decode.string`).

```ts
import { storageGet } from "teelm/fx";
import { Decode } from "teelm/functional";

interface Settings { theme: "light" | "dark"; fontSize: number }

const settingsDecoder = Decode.object({
  theme: Decode.oneOf(
    Decode.map(Decode.string, (s) => s === "dark" ? "dark" as const : "light" as const),
  ),
  fontSize: Decode.number,
});

storageGet({
  key: "settings",
  decoder: settingsDecoder,
  toMsg: (result) =>
    result.tag === "Ok"
      ? { tag: "GotSettings", settings: result.value /* Settings | undefined */ }
      : { tag: "SettingsFailed", error: result.error /* StorageError | string */ },
})
```

The dispatched `Result.value` is `T | undefined`. `undefined` means the key was missing. The `Err` channel is `StorageError | string` — `string` carries decoder/JSON-parse errors; `StorageError` carries DOM-level failures.

#### log

Console.log as an effect. Useful for tracing dispatch flow in `withFx` chains.

```ts
import { log } from "teelm/fx";

log<Msg>("current state:", state)
```

#### dispatchMsg

Dispatch a message as an effect. Useful inside batched effect lists where you want to trigger another update cycle as part of the same dispatch.

```ts
import { dispatchMsg } from "teelm/fx";

dispatchMsg<Msg>({ tag: "Refresh" })
```

#### compactEffects

Filter out falsy values from an effect list and spread into `withFx`:

```ts
import { compactEffects } from "teelm/fx";

return withFx(state, ...compactEffects(
  shouldSave && storageSet("data", JSON.stringify(state)),
  shouldLog && log("Updated"),
  http({
    url: "/api/sync",
    decoder: syncDecoder,
    toMsg: (r) => r.tag === "Ok" ? { tag: "Synced", v: r.value } : { tag: "SyncErr", e: r.error },
  }),
));
```

### Creating Custom Effects

An effect is just a `[function, props]` pair. The function receives `dispatch` and the props, performs async work, and dispatches results back. `Effect<Msg, P>` is **not** branded — you can construct one directly.

```ts
import type { Dispatch, Effect } from "teelm";
import { Result } from "teelm/functional";

// 1. Effect runner
function clipboardWriteFx<Msg>(
  dispatch: Dispatch<Msg>,
  props: { text: string; toMsg: (r: Result<undefined, string>) => Msg },
): void {
  navigator.clipboard.writeText(props.text)
    .then(() => dispatch(props.toMsg(Result.ok(undefined))))
    .catch((e) => dispatch(props.toMsg(Result.err(String(e)))));
}

// 2. Public creator
export function clipboardWrite<Msg>(
  text: string,
  toMsg: (r: Result<undefined, string>) => Msg,
): Effect<Msg, { text: string; toMsg: (r: Result<undefined, string>) => Msg }> {
  return [clipboardWriteFx, { text, toMsg }];
}

// 3. Use in update
case "CopyLink":
  return withFx(state,
    clipboardWrite(state.shareUrl, (r) =>
      r.tag === "Ok" ? { tag: "Copied" } : { tag: "CopyFailed", error: r.error }),
  );
```

### Batching Commands

`batch()` merges several `Cmd<Msg>` values:

```ts
import { batch, withFx } from "teelm";

const cmdA: Cmd<Msg> = withFx(state, storageSet("a", "1"))[1];
const cmdB: Cmd<Msg> = withFx(state, log("saved"))[1];
return [state, batch([cmdA, cmdB])];
```

In practice you rarely need `batch` — passing multiple effects to `withFx` produces the same result.

---

## Subscriptions

A subscription is a `[SubFn, props]` tuple. The runner function receives `dispatch` and props, sets up a listener, and returns a cleanup function. `Sub<Msg>` is a **branded** type — you obtain values of this type by calling the creators in `teelm/subs`, never by writing a literal tuple.

```ts
type Sub<Msg, P = any>   = readonly [SubFn<Msg, P>, P] & { /* branded */ };
type Subs<Msg>           = readonly (Sub<Msg> | false | null | undefined)[];
type SubFn<Msg, P>       = (dispatch: Dispatch<Msg>, props: P) => () => void;
```

### Declaring Subscriptions

The `subscriptions` function returns a `Subs<Msg>` based on the current state. Falsy entries are filtered, enabling conditional subscriptions in place.

```ts
import { onKeyDown, interval, websocket } from "teelm/subs";
import type { Subs } from "teelm";

function subscriptions(state: State): Subs<Msg> {
  return [
    // Always active
    onKeyDown((key) => ({ tag: "KeyPressed", key })),

    // Conditional — toggled in place via a falsy entry
    state.auto && interval(1000, { tag: "Tick" }),

    // Conditional WebSocket
    state.wsEnabled && websocket({
      url: `wss://api.example.com/ws?token=${state.token}`,
      onMessage: (data) => ({ tag: "WsMsg", data }),
      onOpen: () => ({ tag: "WsConnected" }),
      onClose: () => ({ tag: "WsDisconnected" }),
    }),
  ];
}
```

Type your function as `Subs<Msg>` (not `Sub<Msg>[]`). `Subs<Msg>` is the new, falsy-aware list type; the bare `Sub<Msg>[]` form has been removed because it could not capture the falsy-passthrough.

### How the Runtime Manages Subscriptions

After every state update, the runtime diffs the old and new subscription arrays:

1. **Same position, same runner, same props** -- Keep the existing subscription alive (no restart)
2. **Same position, different runner or changed props** -- Tear down old, start new
3. **New subscription at a position** -- Start it
4. **Removed (or falsy) at a position** -- Tear it down

Props comparison is shallow and uses identity (`===`) for every prop, including callbacks. If a closure changes between renders, the runtime will re-subscribe so handlers cannot keep a stale dispatch reference.

### Built-in Subscriptions

#### interval

```ts
import { interval } from "teelm/subs";

interval<Msg>(1000, { tag: "Tick" })
interval<Msg>(16, (now) => ({ tag: "Frame", timestamp: now }))
```

#### onKeyDown / onKeyUp

```ts
import { onKeyDown, onKeyUp } from "teelm/subs";

onKeyDown<Msg>((key, event) => ({ tag: "KeyDown", key }))
onKeyUp<Msg>((key, event) => ({ tag: "KeyUp", key }))
```

The callback receives the `key` string (e.g., `"Enter"`, `"ArrowUp"`) and the full `KeyboardEvent`.

#### onMouseMove

```ts
import { onMouseMove } from "teelm/subs";

onMouseMove<Msg>((x, y) => ({ tag: "MouseMoved", x, y }))
```

Coordinates are `clientX` and `clientY`.

#### onResize

```ts
import { onResize } from "teelm/subs";

onResize<Msg>((width, height) => ({ tag: "Resized", width, height }))
```

#### onUrlChange

```ts
import { onUrlChange } from "teelm/subs";

onUrlChange<Msg>((url) => ({ tag: "UrlChanged", url }))
```

If you use `routerApp`, URL listening is handled automatically — only use `onUrlChange` for manual setups.

#### onAnimationFrame

```ts
import { onAnimationFrame } from "teelm/subs";

onAnimationFrame<Msg>((timestamp) => ({ tag: "Frame", t: timestamp }))
```

#### onEvent

Generic DOM event listener. Attach to any `EventTarget`.

```ts
import { onEvent } from "teelm/subs";

onEvent<Msg>("online", () => ({ tag: "Online" }))
onEvent<Msg>("scroll", (e) => ({ tag: "Scrolled", e }), document)
```

#### websocket

```ts
import { websocket } from "teelm/subs";

websocket<Msg>({
  url: "wss://api.example.com/ws",
  protocols: "v1",
  onMessage: (data) => ({ tag: "WsMessage", data }),
  onOpen: () => ({ tag: "WsConnected" }),
  onClose: () => ({ tag: "WsDisconnected" }),
  onError: (e) => ({ tag: "WsError", event: e }),
})
```

The `onMessage` callback receives `event.data` (typically a string; parse JSON yourself or via `Decode.fromJsonString`).

### Creating Custom Subscriptions

Because `Sub<Msg>` is branded, a raw `[fn, props]` literal cannot satisfy the type. Cast through `Sub<Msg, P>` once inside your creator:

```ts
import type { Dispatch, Sub, SubFn } from "teelm";

function mediaQuerySub<Msg>(
  dispatch: Dispatch<Msg>,
  props: { query: string; msg: (matches: boolean) => Msg },
): () => void {
  const mql = matchMedia(props.query);
  const handler = (e: MediaQueryListEvent) => dispatch(props.msg(e.matches));

  // Initial dispatch
  dispatch(props.msg(mql.matches));

  mql.addEventListener("change", handler);
  return () => mql.removeEventListener("change", handler);
}

export function onMediaQuery<Msg>(
  query: string,
  msg: (matches: boolean) => Msg,
): Sub<Msg, { query: string; msg: (matches: boolean) => Msg }> {
  return [mediaQuerySub, { query, msg }] as unknown as Sub<Msg, { query: string; msg: (matches: boolean) => Msg }>;
}
```

The cast is the contract: the helpers in `teelm/subs` do exactly this internally, and using it inside your creator means callers consume the branded type without further ceremony.

### Combining Subscriptions from Child Modules

Use `mapSub` and `batchSubs` to compose subscriptions from nested TEA modules:

```ts
import { mapSub, batchSubs, type Subs } from "teelm";
import * as ChildA from "./child-a";
import * as ChildB from "./child-b";

function subscriptions(state: State): Subs<Msg> {
  return batchSubs(
    ChildA.subscriptions(state.childA).map((s) =>
      mapSub(s, (m): Msg => ({ tag: "ChildA", msg: m })),
    ),
    ChildB.subscriptions(state.childB).map((s) =>
      mapSub(s, (m): Msg => ({ tag: "ChildB", msg: m })),
    ),
    onKeyDown((key) => ({ tag: "KeyPressed", key })),
  );
}
```

---

## Tasks

A `Task<E, T>` is a lazy description of async work. It composes via `andThen`/`map`/`mapError`, so chained operations don't need an intermediate `Msg` for every step.

```ts
type Task<E, T> = () => Promise<Result<T, E>>;
```

Defining a task does not start it. It runs when the runtime executes the effect produced by `Task.attempt` (or `Task.perform`).

### Constructing Tasks

```ts
import { Task } from "teelm/task";
import { Result } from "teelm/functional";

Task.succeed(42)                                        // Task<never, number>
Task.fail("nope")                                        // Task<string, never>
Task.fromTry(() => JSON.parse(input), (e) => String(e)) // Task<string, unknown>
Task.fromPromise(() => fetch("/api").then(r => r.json()), (e) => String(e))
Task.fromPromiseResult(() => Promise.resolve(Result.ok("hi")))
```

### Composing Tasks

```ts
const fetchAuth = Task.fromPromise(
  () => fetch("/api/auth").then(r => r.json() as Promise<{ token: string }>),
  (e) => ({ tag: "AuthFailed" as const, message: String(e) }),
);

const fetchProfile = (token: string) => Task.fromPromise(
  () => fetch(`/api/me?t=${token}`).then(r => r.json() as Promise<Profile>),
  (e) => ({ tag: "ProfileFailed" as const, message: String(e) }),
);

// Compose: andThen runs the second task only if the first succeeded.
const loadProfile = Task.andThen(fetchAuth, ({ token }) => fetchProfile(token));

// Map over success and error channels independently:
const loadProfileNumeric = Task.map(loadProfile, (p) => p.id);
const loadProfileWithCommonError = Task.mapError(loadProfile, (e) => ({ kind: "boot", e }));

// Recover from failure:
const safeProfile = Task.onError(loadProfile, () => Task.succeed(null as Profile | null));

// Run multiple in series (short-circuits on first Err):
Task.sequence([t1, t2, t3])
// Or in parallel:
Task.all([t1, t2, t3])
```

### Running a Task

Convert a task into an `Effect<Msg>` using `Task.attempt` (always dispatches a `Result` message) or `Task.perform` (only for `Task<never, T>` — i.e. tasks that cannot fail):

```ts
import { withFx } from "teelm";
import { Task } from "teelm/task";

case "Boot":
  return withFx(state, Task.attempt(loadProfile, (r) => ({ tag: "ProfileLoaded", r })));

// For an infallible task:
const wait = Task.fromPromise(() => new Promise<void>(r => setTimeout(r, 100)), () => undefined as never);
return withFx(state, Task.perform(wait, () => ({ tag: "Tick" })));
```

Compared to chaining via intermediate `Msg` variants (`AuthOk` → fetch profile → `ProfileOk` → ...), tasks let you keep transient steps off your `Msg` union and your `update` function entirely.

---

## Typed Events

`makeEvents(dispatch)` returns a JSX-friendly object whose methods build VNode prop fragments. Spread the result onto an element to wire it up:

```ts
import { makeEvents } from "teelm/events";

function view(state: State, dispatch: Dispatch<Msg>) {
  const E = makeEvents(dispatch);
  return h("form", E.onSubmit({ tag: "Save" }),
    h("input", {
      type: "text",
      value: state.name,
      ...E.onInput((value) => ({ tag: "SetName", value })),
      ...E.onEnter({ tag: "Save" }),
    }),
    h("label", {},
      h("input", { type: "checkbox", checked: state.opt, ...E.onChecked((on) => ({ tag: "ToggleOpt", on })) }),
      "Opt-in",
    ),
    h("button", { type: "submit" }, "Save"),
  );
}
```

Available helpers:

| Method | Resulting prop | Notes |
|--------|---------------|-------|
| `E.onClick(msg)` | `onClick` | Dispatches `msg` |
| `E.onClickWith(fn)` | `onClick` | `fn(event) => Msg \| undefined` (undefined skips dispatch) |
| `E.onDoubleClick(msg)` | `onDblclick` | |
| `E.onInput(fn)` | `onInput` | `fn(value)` reads `target.value` |
| `E.onChange(fn)` | `onChange` | `fn(value)` reads `target.value` |
| `E.onChecked(fn)` | `onChange` | `fn(checked)` reads `target.checked` |
| `E.onSubmit(msg)` | `onSubmit` | `preventDefault()` then dispatch |
| `E.onSubmitWith(fn)` | `onSubmit` | `fn(formData)` after `preventDefault()` |
| `E.onKeyDown(fn)` / `E.onKeyUp(fn)` | `onKeydown` / `onKeyup` | `fn(key, event)` |
| `E.onEnter(msg)` / `E.onEscape(msg)` | `onKeydown` | Dispatches only on the matching key |
| `E.onFocus(msg)` / `E.onBlur(msg)` | `onFocus` / `onBlur` | |

The `*With` and `on{Input,Change,Checked,KeyDown,KeyUp}` variants accept handlers that may return `undefined` to skip dispatch — useful for filtering events without an extra Msg variant.

Inline closures still work as an escape hatch; `makeEvents` is the safer default because it captures `dispatch` once and avoids accidental stale-closure bugs.
