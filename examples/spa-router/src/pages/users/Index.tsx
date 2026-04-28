import { noFx } from "teelm";
import { type PageConfig } from "teelm/router";
import type { Shared } from "../../shared";
import { USERS, UserCard } from "./_users";

// ── Page ──────────────────────────────────────────────────────

export const page: PageConfig<{}, never, Shared, {}> = {
  init: () => noFx({}),
  update: (model) => noFx(model),
  view: () => (
    <div>
      <div class="flex justify-between items-center mb-6">
        <div>
          <h1 class="text-3xl font-bold">Users</h1>
          <p class="text-base-content/60">{`${USERS.length} team members`}</p>
        </div>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        {USERS.map((user) => <UserCard user={user} />)}
      </div>
    </div>
  ),
};
