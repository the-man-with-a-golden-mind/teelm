// main.tsx — Parent app composing two Counter instances
// Demonstrates Elm-style nested TEA via mapDispatch / mapCmd / mapSub

import {
  app, mapDispatch, mapCmd, mapSub, noFx, none,
  type Dispatch, type Subs, type UpdateResult,
} from "teelm";
import { makeEvents } from "teelm/events";
import { attachDebugger } from "teelm/debugger";
import * as Counter from "./counter";

// ── State ────────────────────────────────────────────────

interface State {
  counterA: Counter.State;
  counterB: Counter.State;
}

type Msg =
  | { tag: "CounterA"; msg: Counter.Msg }
  | { tag: "CounterB"; msg: Counter.Msg }
  | { tag: "ResetAll" };

const init: State = { counterA: Counter.init, counterB: Counter.init };

// ── Update ───────────────────────────────────────────────

function update(state: Readonly<State>, msg: Msg): UpdateResult<State, Msg> {
  switch (msg.tag) {
    case "CounterA": {
      const [childState, childCmd] = Counter.update(state.counterA, msg.msg);
      return [
        { ...state, counterA: childState },
        mapCmd(childCmd, (m: Counter.Msg): Msg => ({ tag: "CounterA", msg: m })),
      ];
    }
    case "CounterB": {
      const [childState, childCmd] = Counter.update(state.counterB, msg.msg);
      return [
        { ...state, counterB: childState },
        mapCmd(childCmd, (m: Counter.Msg): Msg => ({ tag: "CounterB", msg: m })),
      ];
    }
    case "ResetAll":
      return noFx({ counterA: Counter.init, counterB: Counter.init });
  }
}

// ── Subscriptions ────────────────────────────────────────

function subscriptions(state: Readonly<State>): Subs<Msg> {
  return [
    ...Counter.subscriptions(state.counterA).map((s) =>
      mapSub(s, (m: Counter.Msg): Msg => ({ tag: "CounterA", msg: m })),
    ),
    ...Counter.subscriptions(state.counterB).map((s) =>
      mapSub(s, (m: Counter.Msg): Msg => ({ tag: "CounterB", msg: m })),
    ),
  ];
}

// ── View ─────────────────────────────────────────────────

function view(state: Readonly<State>, dispatch: Dispatch<Msg>) {
  const E = makeEvents(dispatch);
  const sum = state.counterA.value + state.counterB.value;
  const dispatchA = mapDispatch(dispatch, (m: Counter.Msg): Msg => ({ tag: "CounterA", msg: m }));
  const dispatchB = mapDispatch(dispatch, (m: Counter.Msg): Msg => ({ tag: "CounterB", msg: m }));

  return (
    <div class="max-w-2xl mx-auto p-6 mt-8">
      <h1 class="text-3xl font-bold mb-1">Nested TEA</h1>
      <p class="text-base-content/60 mb-8">
        Two independent counters composed via mapDispatch / mapCmd / mapSub
      </p>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <div class="text-xs font-semibold uppercase tracking-wider text-base-content/40 mb-2">
            Counter A
          </div>
          {Counter.view(state.counterA, dispatchA)}
        </div>
        <div>
          <div class="text-xs font-semibold uppercase tracking-wider text-base-content/40 mb-2">
            Counter B
          </div>
          {Counter.view(state.counterB, dispatchB)}
        </div>
      </div>

      <div class="flex justify-between items-center pt-4">
        <span class="badge badge-lg">{`Total: ${sum}`}</span>
        <button class="btn btn-ghost btn-sm" {...E.onClick({ tag: "ResetAll" })}>
          Reset All
        </button>
      </div>
    </div>
  );
}

// ── Boot ─────────────────────────────────────────────────

const node = document.getElementById("app")!;

const instance = app<State, Msg>({
  init: [init, none],
  update,
  view,
  subscriptions,
  node,
  debug: true,
});

attachDebugger(instance);
