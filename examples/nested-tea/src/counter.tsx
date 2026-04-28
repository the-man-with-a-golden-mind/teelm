// counter.tsx — Self-contained Counter module
// Exports State, Msg, init, update, view, subscriptions
// The parent composes this via mapDispatch / mapCmd / mapSub

import { withFx, noFx, type Dispatch, type Subs, type UpdateResult } from "teelm";
import { delay } from "teelm/fx";
import { interval } from "teelm/subs";
import { makeEvents } from "teelm/events";

// ── State ────────────────────────────────────────────────
export interface State {
  value: number;
  auto: boolean;
}

export type Msg =
  | { tag: "Inc" }
  | { tag: "Dec" }
  | { tag: "ToggleAuto" }
  | { tag: "DelayedInc" };

export const init: State = { value: 0, auto: false };

// ── Update ───────────────────────────────────────────────
export function update(state: Readonly<State>, msg: Msg): UpdateResult<State, Msg> {
  switch (msg.tag) {
    case "Inc": return noFx({ ...state, value: state.value + 1 });
    case "Dec": return noFx({ ...state, value: state.value - 1 });
    case "ToggleAuto": return noFx({ ...state, auto: !state.auto });
    case "DelayedInc": return withFx<State, Msg>(state, delay(500, { tag: "Inc" }));
  }
}

// ── Subscriptions ────────────────────────────────────────
export function subscriptions(state: Readonly<State>): Subs<Msg> {
  return [state.auto && interval<Msg>(1000, { tag: "Inc" })];
}

// ── View ─────────────────────────────────────────────────
export function view(state: Readonly<State>, dispatch: Dispatch<Msg>) {
  const E = makeEvents(dispatch);
  return (
    <div class="card bg-base-100 shadow-md">
      <div class="card-body items-center text-center">
        <div class="text-5xl font-extralight tabular-nums my-2">{state.value}</div>
        {state.auto ? (
          <span class="badge badge-primary badge-sm mb-3">AUTO</span>
        ) : (
          <span class="badge badge-ghost badge-sm mb-3 opacity-0">.</span>
        )}
        <div class="flex gap-2 flex-wrap justify-center">
          <button class="btn btn-outline btn-sm" {...E.onClick({ tag: "Dec" })}>-1</button>
          <button class="btn btn-outline btn-sm" {...E.onClick({ tag: "Inc" })}>+1</button>
          <button class="btn btn-outline btn-sm" {...E.onClick({ tag: "DelayedInc" })}>
            +1 (delay)
          </button>
        </div>
        <div class="flex gap-2 mt-2">
          <button
            class={state.auto ? "btn btn-primary btn-sm" : "btn btn-outline btn-sm"}
            {...E.onClick({ tag: "ToggleAuto" })}
          >
            {state.auto ? "Stop" : "Auto +1/s"}
          </button>
        </div>
      </div>
    </div>
  );
}
