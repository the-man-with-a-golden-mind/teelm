import { app, h, withFx, noFx, type Dispatch, type Subs, type UpdateResult, type Init } from "./src/teelm";
import { delay } from "./src/fx";
import { interval, onKeyDown } from "./src/subs";
import { attachDebugger } from "./src/debugger";

// ── State ──────────────────────────────────────────────────────

interface State {
  count: number;
  message: string;
  time: number;
  lastKey: string;
}

// ── Messages ───────────────────────────────────────────────────

type Msg =
  | { tag: "Increment" }
  | { tag: "Decrement" }
  | { tag: "DelayedIncrement" }
  | { tag: "SetMessage"; value: string }
  | { tag: "Tick"; now: number }
  | { tag: "KeyPressed"; key: string }
  | { tag: "Reset" };

// ── Init ───────────────────────────────────────────────────────

const initState: State = { count: 0, message: "", time: Date.now(), lastKey: "" };
const init: Init<State, Msg> = noFx(initState);

// ── Update ─────────────────────────────────────────────────────

function update(state: Readonly<State>, msg: Msg): UpdateResult<State, Msg> {
  switch (msg.tag) {
    case "Increment":
      return noFx({ ...state, count: state.count + 1 });
    case "Decrement":
      return noFx({ ...state, count: state.count - 1 });
    case "DelayedIncrement":
      return withFx<State, Msg>(state, delay(1000, { tag: "Increment" }));
    case "SetMessage":
      return noFx({ ...state, message: msg.value });
    case "Tick":
      return noFx({ ...state, time: msg.now });
    case "KeyPressed":
      return noFx({ ...state, lastKey: msg.key });
    case "Reset":
      return noFx({ ...initState, time: state.time });
  }
}

// ── Subscriptions ──────────────────────────────────────────────

function subscriptions(_state: Readonly<State>): Subs<Msg> {
  return [
    interval<Msg>(1000, (now) => ({ tag: "Tick", now })),
    onKeyDown<Msg>((key) => ({ tag: "KeyPressed", key })),
  ];
}

// ── View ───────────────────────────────────────────────────────

function view(state: Readonly<State>, dispatch: Dispatch<Msg>) {
  return h(
    "div",
    {
      style: {
        fontFamily: "system-ui, -apple-system, sans-serif",
        maxWidth: "520px",
        margin: "2rem auto",
        padding: "0 1rem",
        color: "#1e293b",
      },
    },
    h("h1", { style: { color: "#7c3aed", marginBottom: "0.25rem" } }, "Teelm"),
    h(
      "p",
      { style: { color: "#64748b", marginTop: 0 } },
      "Modern TypeScript framework — functional, fast, secure",
    ),

    // Counter
    h(
      "section",
      { style: { marginBottom: "1.5rem" } },
      h("h2", {}, `Count: ${state.count}`),
      h(
        "div",
        { style: { display: "flex", gap: "0.5rem" } },
        btn("\u2212", () => dispatch({ tag: "Decrement" })),
        btn("+", () => dispatch({ tag: "Increment" })),
        btn("+1 (1s delay)", () => dispatch({ tag: "DelayedIncrement" })),
      ),
    ),

    // Message
    h(
      "section",
      { style: { marginBottom: "1.5rem" } },
      h("h2", {}, "Message"),
      h("input", {
        type: "text",
        value: state.message,
        onInput: (e: Event) =>
          dispatch({
            tag: "SetMessage",
            value: (e.target as HTMLInputElement).value,
          }),
        placeholder: "Type text...",
        style: {
          width: "100%",
          padding: "0.5rem",
          borderRadius: "6px",
          border: "1px solid #cbd5e1",
          boxSizing: "border-box",
          fontSize: "14px",
        },
      }),
      state.message
        ? h("p", {}, `Echo: ${state.message}`)
        : h("p", { style: { color: "#94a3b8" } }, "\u2014"),
    ),

    // Live data (subscriptions)
    h(
      "section",
      { style: { marginBottom: "1.5rem" } },
      h("h2", {}, "Live"),
      h("p", {}, `Time: ${new Date(state.time).toLocaleTimeString()}`),
      h("p", {}, `Last key: ${state.lastKey || "\u2014"}`),
    ),

    // Reset
    btn("Reset", () => dispatch({ tag: "Reset" })),
  );
}

function btn(label: string, onClick: () => void) {
  return h(
    "button",
    {
      onClick,
      style: {
        padding: "0.4rem 1rem",
        borderRadius: "6px",
        border: "1px solid #cbd5e1",
        background: "#f8fafc",
        cursor: "pointer",
        fontSize: "14px",
      },
    },
    label,
  );
}

// ── Boot ───────────────────────────────────────────────────────

const instance = app<State, Msg>({
  init,
  update,
  view,
  subscriptions,
  node: document.body,
  debug: true,
});

attachDebugger(instance, { position: "bottom-right" });
