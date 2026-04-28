import { noFx, type VNode } from "teelm";
import { type PageConfig } from "teelm/router";
import type { Shared } from "../shared";

function StepItem({ title, desc }: { title: string; desc: string }): VNode {
  return (
    <li class="step step-primary">
      <div class="text-left">
        <span class="font-semibold">{title}</span>
        <span class="text-base-content/60 text-sm block">{desc}</span>
      </div>
    </li>
  );
}

function ModuleRow({ name, desc }: { name: string; desc: string }): VNode {
  return (
    <tr>
      <td><code class="text-primary font-mono text-xs">{name}</code></td>
      <td class="text-base-content/70">{desc}</td>
    </tr>
  );
}

export const page: PageConfig<{}, never, Shared, {}> = {
  init: () => noFx({}),
  update: (model) => noFx(model),
  view: (_model, shared) => (
    <div>
      <h1 class="text-3xl font-bold mb-2">{`About ${shared.appName}`}</h1>
      <p class="text-base-content/70 mb-6 max-w-prose">
        Teelm is a modern TypeScript framework inspired by Elm and Teelm.
        It provides a functional, immutable, type-safe architecture for building web
        apps, with explicit lifecycle hooks and page-level recovery for runtime failures.
      </p>

      <div class="card bg-base-100 shadow-sm mb-6">
        <div class="card-body">
          <h2 class="card-title">Architecture</h2>
          <p class="text-base-content/70 mb-4">The Elm Architecture (TEA) pattern:</p>
          <ul class="steps steps-vertical">
            <StepItem title="State" desc="Immutable application state — single source of truth" />
            <StepItem title="View" desc="Pure function: State → VNode tree" />
            <StepItem title="Update" desc="Pure function: (State, Msg) → [State, Cmd]" />
            <StepItem title="Effects" desc="Side effects run after update — HTTP, timers, storage" />
            <StepItem title="Subscriptions" desc="Declarative event sources — intervals, keyboard, WebSocket" />
            <StepItem title="Lifecycle" desc="onMount / afterUpdate / onUnmount run after real DOM commits" />
          </ul>
        </div>
      </div>

      <div class="card bg-base-100 shadow-sm mb-6">
        <div class="card-body">
          <h2 class="card-title">New in This Demo</h2>
          <ul class="list-disc list-inside text-base-content/70 space-y-2">
            <li>Open a user profile to see page lifecycle hooks and cached page state in action.</li>
            <li>Open Crash Lab to trigger a view exception and recover via errorView().</li>
            <li>The users page imports ./_users.ts from inside src/pages/ without creating an accidental route.</li>
          </ul>
        </div>
      </div>

      <div class="card bg-base-100 shadow-sm">
        <div class="card-body">
          <h2 class="card-title">Modules</h2>
          <div class="overflow-x-auto">
            <table class="table table-sm">
              <thead>
                <tr>
                  <th>Import</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <ModuleRow name="teelm" desc="Core: app, h, text, memo, lazy, withFx, mapCmd, mapSub" />
                <ModuleRow name="teelm/fx" desc="Effects: http, delay, navigate, storageSet/Get, log" />
                <ModuleRow name="teelm/subs" desc="Subs: interval, onKeyDown, onResize, websocket" />
                <ModuleRow name="teelm/router" desc="Router: route, createRouter, routerApp, page, lifecycle hooks, page boundaries" />
                <ModuleRow name="teelm/functional" desc="Result, Maybe, Decoder, HttpError, Url/Path brands" />
                <ModuleRow name="teelm/task" desc="Task<E,T> for composable async operations" />
                <ModuleRow name="teelm/events" desc="Typed event helpers (makeEvents)" />
                <ModuleRow name="teelm/testing" desc="getModel, getEffects, createDispatchSpy, runEffect" />
                <ModuleRow name="teelm/debugger" desc="attachDebugger with time-travel" />
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  ),
};
