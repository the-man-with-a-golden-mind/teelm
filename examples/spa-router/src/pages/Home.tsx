import { noFx, type VNode } from "teelm";
import { routerLink, type PageConfig } from "teelm/router";
import type { Shared } from "../shared";

type FeatureCardProps = {
  title: string;
  desc: string;
};

function FeatureCard({ title, desc }: FeatureCardProps): VNode {
  return (
    <div class="card bg-base-100 shadow-sm">
      <div class="card-body">
        <h3 class="card-title text-sm">{title}</h3>
        <p class="text-sm text-base-content/60">{desc}</p>
      </div>
    </div>
  );
}

export const page: PageConfig<{}, never, Shared, {}> = {
  init: () => noFx({}),
  update: (model) => noFx(model),
  view: (_model, shared) => (
    <div>
      <div class="hero bg-base-100 rounded-box mb-8">
        <div class="hero-content text-center py-16">
          <div class="max-w-md">
            <h1 class="text-4xl font-bold">{`Welcome to ${shared.appName}`}</h1>
            <p class="py-4 text-base-content/70">
              A modern TypeScript framework inspired by Elm and Teelm.
              Functional, type-safe, and now explicit about lifecycle hooks, page
              boundaries, and route file conventions.
            </p>
            <div class="flex gap-3 justify-center">
              <a {...routerLink("/users")} class="btn btn-primary">Browse Users</a>
              <a {...routerLink("/crash-lab")} class="btn btn-secondary">Crash Lab</a>
              <a {...routerLink("/about")} class="btn btn-outline">Learn More</a>
            </div>
          </div>
        </div>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <FeatureCard title="Virtual DOM" desc="Keyed reconciliation with head/tail optimization for fast updates." />
        <FeatureCard title="Effects & Subs" desc="Elm-style effects and subscriptions for managing side effects." />
        <FeatureCard title="Composition" desc="Nested TEA with mapDispatch, mapCmd, and mapSub." />
        <FeatureCard title="Lifecycle Hooks" desc="DOM-ready hooks for app and page code: onMount, afterUpdate, onUnmount." />
        <FeatureCard title="Page Boundary" desc="Per-page error fallback with recovery, without white-screening the whole shell." />
        <FeatureCard title="Route Conventions" desc="Non-route helpers can live next to pages with _prefix or .component.tsx names." />
      </div>
    </div>
  ),
};
