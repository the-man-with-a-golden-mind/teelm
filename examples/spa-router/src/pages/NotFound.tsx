import { noFx } from "teelm";
import { routerLink, type PageConfig } from "teelm/router";
import type { Shared } from "../shared";

export const page: PageConfig<{ path: string }, never, Shared, { path: string }> = {
  init: (params) => noFx({ path: params.path }),
  update: (model) => noFx(model),
  view: (model) => (
    <div class="text-center py-16">
      <div class="text-8xl font-bold text-base-content/10 mb-4">404</div>
      <h1 class="text-2xl font-bold mb-2">Page Not Found</h1>
      <p class="text-base-content/60 mb-6">{`The path "${model.path}" doesn't exist.`}</p>
      <a {...routerLink("/")} class="btn btn-primary">Go Home</a>
    </div>
  ),
};
