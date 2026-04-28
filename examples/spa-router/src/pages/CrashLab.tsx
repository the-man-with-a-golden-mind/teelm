import { noFx } from "teelm";
import { routerLink, type PageConfig } from "teelm/router";
import { makeEvents } from "teelm/events";
import type { Shared } from "../shared";

interface Model {
  shouldCrash: boolean;
  recoveryCount: number;
}

type Msg =
  | { tag: "Crash" }
  | { tag: "Recover" };

export const page: PageConfig<Model, Msg, Shared, {}> = {
  init: () => noFx({ shouldCrash: false, recoveryCount: 0 }),

  update: (model, msg) => {
    switch (msg.tag) {
      case "Crash":
        return noFx({ ...model, shouldCrash: true });
      case "Recover":
        return noFx({ shouldCrash: false, recoveryCount: model.recoveryCount + 1 });
    }
  },

  view: (model, _shared, dispatch) => {
    if (model.shouldCrash) {
      throw new Error("Intentional page crash from Crash Lab");
    }
    const E = makeEvents(dispatch);
    return (
      <div class="space-y-6">
        <div>
          <h1 class="text-3xl font-bold mb-2">Crash Lab</h1>
          <p class="text-base-content/70 max-w-prose">
            This page demonstrates the page-level error boundary. Trigger a crash,
            then recover without losing the whole app shell.
          </p>
        </div>
        <div class="card bg-base-100 shadow-sm">
          <div class="card-body gap-4">
            <div class="stats shadow">
              <div class="stat">
                <div class="stat-title">Recoveries</div>
                <div class="stat-value text-primary">{model.recoveryCount}</div>
              </div>
            </div>
            <div class="flex flex-wrap gap-3">
              <button class="btn btn-error" {...E.onClick({ tag: "Crash" })}>
                Crash This Page
              </button>
              <a {...routerLink("/")} class="btn btn-outline">Back Home</a>
            </div>
          </div>
        </div>
      </div>
    );
  },

  onError: ({ error, phase }) => {
    console.warn(`[CrashLab] ${phase}`, error);
  },

  errorView: ({ error, dispatch }) => {
    const E = makeEvents(dispatch);
    return (
      <div class="card bg-base-100 shadow-sm border border-error/30">
        <div class="card-body gap-4">
          <div class="badge badge-error badge-outline w-fit">Recovered by error boundary</div>
          <h1 class="text-2xl font-bold">Page crashed, shell stayed alive</h1>
          <p class="text-base-content/70">{String(error)}</p>
          <div class="flex flex-wrap gap-3">
            <button class="btn btn-primary" {...E.onClick({ tag: "Recover" })}>
              Recover Page
            </button>
            <a {...routerLink("/about")} class="btn btn-ghost">Read About Hooks</a>
          </div>
        </div>
      </div>
    );
  },
};
