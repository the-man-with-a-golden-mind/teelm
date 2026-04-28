import { app, withFx, noFx, type Subs, type UpdateResult, type Init } from "teelm";
import { delay } from "teelm/fx";
import { interval } from "teelm/subs";
import { makeEvents } from "teelm/events";
import { attachDebugger } from "teelm/debugger";

// ── State ──────────────────────────────────────────────────────

interface State {
  count: number;
  auto: boolean;
}

type Msg =
  | { tag: "Inc" }
  | { tag: "Dec" }
  | { tag: "DelayedInc" }
  | { tag: "ToggleAuto" }
  | { tag: "Reset" };

const init: Init<State, Msg> = noFx({ count: 0, auto: false });

// ── Update ─────────────────────────────────────────────────────

function update(state: Readonly<State>, msg: Msg): UpdateResult<State, Msg> {
  switch (msg.tag) {
    case "Inc":
      return noFx({ ...state, count: state.count + 1 });
    case "Dec":
      return noFx({ ...state, count: state.count - 1 });
    case "DelayedInc":
      return withFx<State, Msg>(state, delay(500, { tag: "Inc" }));
    case "ToggleAuto":
      return noFx({ ...state, auto: !state.auto });
    case "Reset":
      return noFx({ count: 0, auto: false });
  }
}

// ── Subscriptions ──────────────────────────────────────────────

function subscriptions(state: Readonly<State>): Subs<Msg> {
  return [state.auto && interval<Msg>(1000, { tag: "Inc" })];
}

// ── View ───────────────────────────────────────────────────────

function view(state: Readonly<State>, dispatch: import("teelm").Dispatch<Msg>) {
  const E = makeEvents(dispatch);
  return (
    <div class="card bg-base-100 shadow-xl max-w-md mx-auto mt-16">
      <div class="card-body items-center text-center">
        <h1 class="card-title text-2xl font-bold">Counter</h1>
        <p class="text-base-content/60 text-sm mb-4">
          Effects, subscriptions, and app lifecycle hooks
        </p>

        <div class="text-7xl font-extralight tabular-nums my-4">{state.count}</div>

        <div class="flex gap-2 flex-wrap justify-center">
          <button class="btn btn-outline btn-sm" {...E.onClick({ tag: "Dec" })}>
            {"− 1"}
          </button>
          <button id="counter-inc" class="btn btn-outline btn-sm" {...E.onClick({ tag: "Inc" })}>
            + 1
          </button>
          <button class="btn btn-outline btn-sm" {...E.onClick({ tag: "DelayedInc" })}>
            +1 (500ms)
          </button>
        </div>

        <div class="flex gap-2 flex-wrap justify-center mt-2">
          <button
            class={state.auto ? "btn btn-primary btn-sm" : "btn btn-outline btn-sm"}
            {...E.onClick({ tag: "ToggleAuto" })}
          >
            {state.auto ? "Stop" : "Auto +1/s"}
          </button>
          <button class="btn btn-ghost btn-sm" {...E.onClick({ tag: "Reset" })}>
            Reset
          </button>
        </div>

        {state.auto && (
          <div class="mt-4">
            <span class="badge badge-primary">AUTO</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Boot ───────────────────────────────────────────────────────

const instance = app<State, Msg>({
  init,
  update,
  view,
  subscriptions,
  onMount: ({ node }) => {
    node.dataset.lifecycle = "mounted";
    node.querySelector<HTMLButtonElement>("#counter-inc")?.focus();
    document.title = "Teelm Counter";
  },
  afterRender: ({ state, node }) => {
    node.dataset.renders = String((Number(node.dataset.renders ?? "0")) + 1);
    document.title = `Counter: ${state.count}`;
  },
  onUnmount: () => {
    document.title = "Teelm";
  },
  node: document.getElementById("app")!,
  debug: true,
});

attachDebugger(instance);
