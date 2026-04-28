# The Elm Architecture in Teelm

Teelm implements The Elm Architecture (TEA), a pattern for building web applications using unidirectional data flow. Every Teelm application is driven by three things: **State**, **Update**, and **View**.

## The Cycle

```
                    ┌──────────────────────────────┐
                    │                              │
                    v                              │
              ┌──────────┐                         │
              │  State   │                         │
              └────┬─────┘                         │
                   │                               │
                   v                               │
              ┌──────────┐      ┌──────────┐       │
              │   View   │─────>│   DOM    │       │
              └──────────┘      └────┬─────┘       │
                                     │             │
                                 user event        │
                                     │             │
                                     v             │
                                ┌─────────┐        │
                                │   Msg   │        │
                                └────┬────┘        │
                                     │             │
                                     v             │
              ┌──────────┐      ┌──────────┐       │
              │ Effects  │<─────│  Update  │───────┘
              └────┬─────┘      └──────────┘
                   │
                   v
              ┌──────────┐
              │ External │  (HTTP, timers, storage, ...)
              │  World   │───> dispatches Msg back into Update
              └──────────┘
```

## State

State is a plain, immutable TypeScript object. It is the single source of truth for your entire application.

```ts
interface State {
  count: number;
  loading: boolean;
  items: Item[];
}
```

State is **deep-frozen on every transition** by default — accidental mutations throw immediately, not only in debug mode. Opt out with `freezeState: false` on `app()` for known hot paths.

### Init

`init` is always a `[State, Cmd<Msg>]` tuple. Use `noFx(state)` when there are no startup effects.

```ts
import { noFx, withFx, type Init } from "teelm";
import { storageGet } from "teelm/fx";
import { Decode } from "teelm/functional";

// No startup effects
const init: Init<State, Msg> = noFx({ count: 0, items: [] });

// With startup effects (e.g., load from localStorage)
const init: Init<State, Msg> = withFx(
  { count: 0, items: [] },
  storageGet({
    key: "items",
    decoder: Decode.array(Decode.object({ id: Decode.number, name: Decode.string })),
    toMsg: (r) => r.tag === "Ok"
      ? { tag: "LoadedItems", items: r.value ?? [] }
      : { tag: "LoadFailed", error: String(r.error) },
  }),
);
```

## Messages (Msg)

Messages are discriminated unions that describe what happened. Every state change is triggered by a message.

```ts
type Msg =
  | { tag: "Inc" }
  | { tag: "Dec" }
  | { tag: "SetInput"; value: string }
  | { tag: "GotData"; data: Item[] }
  | { tag: "FetchFailed"; error: HttpError };
```

Using discriminated unions with a `tag` field gives you exhaustive pattern matching in `switch` statements and full type safety.

## Update

The update function is a pure function: `(State, Msg) -> [State, Cmd<Msg>]`. It always returns a tuple.

- Use `noFx(state)` when there are no side effects.
- Use `withFx(state, ...effects)` when one or more effects should run after the update.

```ts
import { noFx, withFx, type Update } from "teelm";
import { http } from "teelm/fx";
import { Decode } from "teelm/functional";

const itemsDecoder = Decode.array(Decode.object({
  id: Decode.number,
  title: Decode.string,
}));

const update: Update<State, Msg> = (state, msg) => {
  switch (msg.tag) {
    case "Inc":
      return noFx({ ...state, count: state.count + 1 });

    case "FetchItems":
      return withFx(
        { ...state, loading: true },
        http({
          url: "/api/items",
          decoder: itemsDecoder,
          toMsg: (r) => r.tag === "Ok"
            ? { tag: "GotData", data: r.value }
            : { tag: "FetchFailed", error: r.error },
        }),
      );

    case "GotData":
      return noFx({ ...state, loading: false, items: msg.data });

    case "FetchFailed":
      return noFx({ ...state, loading: false, error: msg.error });
  }
};
```

### Helpers

| Helper | Signature | Description |
|--------|-----------|-------------|
| `noFx(state)` | `S -> [S, Cmd<never>]` | Wrap state with no effects |
| `withFx(state, ...effects)` | `(S, ...Effect<Msg>[]) -> [S, Cmd<Msg>]` | Wrap state with one or more effects |
| `batch(commands)` | `Cmd<Msg>[] -> Cmd<Msg>` | Merge multiple commands into one |
| `none` | `Cmd<never>` | Empty command |
| `mapCmd(cmd, fn)` | `(Cmd<A>, A=>B) -> Cmd<B>` | Lift a child Cmd into a parent's Msg space |

`Cmd<Msg>` is a *branded* type. The only way to construct a value of type `Cmd<Msg>` is through `none`, `withFx`, `batch`, `mapCmd`, or `mapEffect` — a raw `[fn, props]` array does not satisfy the type. The same applies to `Sub<Msg>` (constructed via the helpers in `teelm/subs`). This makes pure-data effects/subs an invariant the compiler enforces.

## Effects

Effects are `[EffectFn, props]` tuples. They are **data**, not imperative calls. The runtime executes them after the state update completes.

```ts
type Effect<Msg, P = any> = readonly [EffectFn<Msg, P>, P];
type EffectFn<Msg, P>     = (dispatch: Dispatch<Msg>, props: P) => void;
```

Built-in effects: `http`, `delay`, `navigate`, `storageSet`, `storageGet`, `log`, `dispatchMsg`. See [Effects and Subscriptions](./effects-and-subs.md) for full details.

Effects dispatch messages back into the update cycle when their async work completes. This keeps the update function pure — it never performs I/O directly.

### Creating Custom Effects

```ts
import type { Dispatch, Effect } from "teelm";
import { Result } from "teelm/functional";

function geolocationFx<Msg>(
  dispatch: Dispatch<Msg>,
  props: { toMsg: (r: Result<{ lat: number; lng: number }, string>) => Msg },
): void {
  navigator.geolocation.getCurrentPosition(
    (pos) => dispatch(props.toMsg(Result.ok({ lat: pos.coords.latitude, lng: pos.coords.longitude }))),
    (err) => dispatch(props.toMsg(Result.err(err.message))),
  );
}

export function getLocation<Msg>(
  toMsg: (r: Result<{ lat: number; lng: number }, string>) => Msg,
): Effect<Msg, { toMsg: (r: Result<{ lat: number; lng: number }, string>) => Msg }> {
  return [geolocationFx, { toMsg }];
}
```

`Effect<Msg, P>` is **not** branded — you can construct one directly. Only `Cmd<Msg>` (a list of effects) is branded.

## Subscriptions

Subscriptions are declarative event sources. You declare which events you want based on the current state, and the runtime manages subscribing/unsubscribing automatically.

```ts
type Sub<Msg, P = any>   = readonly [SubFn<Msg, P>, P] & { /* branded */ };
type Subs<Msg>           = readonly (Sub<Msg> | false | null | undefined)[];
type SubFn<Msg, P>       = (dispatch: Dispatch<Msg>, props: P) => () => void;
```

The `subscriptions` function returns a `Subs<Msg>`. Falsy values (`false | null | undefined`) are filtered by the runtime — perfect for conditional subscriptions.

```ts
import { onKeyDown, interval, websocket } from "teelm/subs";
import type { Subs } from "teelm";

function subscriptions(state: State): Subs<Msg> {
  return [
    // Always active
    onKeyDown((key) => ({ tag: "KeyPressed", key })),

    // Conditional — only active when state.auto is true
    state.auto && interval(1000, { tag: "Tick" }),

    // Conditional WebSocket
    state.connected && websocket({
      url: "wss://api.example.com/ws",
      onMessage: (data) => ({ tag: "WsMessage", data }),
    }),
  ];
}
```

When the state changes, the runtime diffs the old subscription list against the new one. If a subscription's runner function or non-function props changed, the old one is torn down and a new one starts. If nothing changed, the existing subscription is kept alive.

## View

The view is a pure function: `(State, Dispatch<Msg>) -> VNode`. It produces a virtual DOM tree. The runtime diffs it against the previous tree and patches the real DOM.

```ts
import { h, type Dispatch } from "teelm";

function view(state: State, dispatch: Dispatch<Msg>): VNode {
  return h("div", {},
    h("h1", {}, String(state.count)),
    h("button", { onClick: () => dispatch({ tag: "Inc" }) }, "+"),
  );
}
```

For more ergonomic event wiring, the typed event helpers in `teelm/events` build handler props for you:

```ts
import { makeEvents } from "teelm/events";

function view(state: State, dispatch: Dispatch<Msg>) {
  const E = makeEvents(dispatch);
  return h("div", {},
    h("h1", {}, String(state.count)),
    h("button", E.onClick({ tag: "Inc" }), "+"),
  );
}
```

### VDOM Reconciliation

Teelm uses a keyed VDOM reconciliation algorithm with head/tail optimization:

1. Match children from the head of both old and new lists
2. Match children from the tail
3. Handle insertions, removals, and moves for remaining children using a key map

Provide `key` props on list items for optimal performance:

```ts
state.items.map((item) =>
  h("li", { key: item.id }, item.name),
)
```

## AppInstance

`app()` returns an `AppInstance` with methods for programmatic control:

```ts
interface AppInstance<S, Msg> {
  dispatch: Dispatch<Msg>;       // Send messages programmatically
  getState: () => Readonly<S>;   // Read current state
  destroy: () => void;           // Tear down the app (call this to unmount)
  getHistory: () => readonly Readonly<S>[];  // State history (debug mode)
  getHistoryIndex: () => number;
  goBack: () => void;            // Time-travel back
  goForward: () => void;         // Time-travel forward
  jumpTo: (index: number) => void;
}
```

To stop the app, call `instance.destroy()`. There is no "return null from update to destroy" magic.

## Debug Mode

Enable with `debug: true` or a config object:

```ts
app({
  // ...
  debug: { console: true, history: true, maxHistory: 200 },
});
```

- `console: true` -- Log every message with prev/next state to the console
- `history: true` -- Record state history for time-travel
- `maxHistory` -- Maximum number of states to keep (default: 200)

State is **always** deep-frozen, regardless of debug mode — the only way to disable freezing is to pass `freezeState: false` on `AppConfig`.

Combine with `attachDebugger` for a visual overlay:

```ts
import { attachDebugger } from "teelm/debugger";
const instance = app({ /* ... */ debug: true });
attachDebugger(instance, { position: "bottom-right" });
```

## Composition (Nested TEA)

For larger applications, split logic into child modules that each export their own `State`, `Msg`, `init`, `update`, `view`, and `subscriptions`. The parent composes them using mapping functions:

| Function | Purpose |
|----------|---------|
| `mapDispatch(dispatch, fn)` | Wrap child dispatch to produce parent messages |
| `mapEffect(effect, fn)` | Lift one effect into a parent's Msg space |
| `mapCmd(cmd, fn)` | Lift every effect in a Cmd into a parent's Msg space |
| `mapSub(sub, fn)` | Lift a subscription into a parent's Msg space |
| `batchSubs(...subs)` | Flatten subscription lists from multiple sources |

```ts
import { mapDispatch, mapCmd, mapSub, type Subs } from "teelm";
import * as Counter from "./counter";

type Msg = { tag: "Child"; msg: Counter.Msg };

// In view:
Counter.view(
  state.child,
  mapDispatch(dispatch, (m: Counter.Msg): Msg => ({ tag: "Child", msg: m })),
);

// In update — lift the child's Cmd into the parent's Msg space:
case "Child": {
  const [childState, childCmd] = Counter.update(state.child, msg.msg);
  return [
    { ...state, child: childState },
    mapCmd(childCmd, (m): Msg => ({ tag: "Child", msg: m })),
  ];
}

// In subscriptions:
function subscriptions(state: State): Subs<Msg> {
  return Counter.subscriptions(state.child).map((s) =>
    mapSub(s, (m: Counter.Msg): Msg => ({ tag: "Child", msg: m })),
  );
}
```

See `examples/nested-tea/` for a complete working example.
