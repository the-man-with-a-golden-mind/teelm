import { noFx, type VNode } from "teelm";
import { routerLink, type PageConfig } from "teelm/router";
import { makeEvents } from "teelm/events";
import type { Shared } from "../../shared";
import { USERS, userColor } from "./_users";

// ── Types ─────────────────────────────────────────────────────

interface Model {
  id: string;
  compact: boolean;
  visits: number;
  mountedAt: string | null;
}

type Msg =
  | { tag: "ToggleCompact" }
  | { tag: "Mounted"; at: string };

// ── Helpers ───────────────────────────────────────────────────

function StatItem({ label, value }: { label: string; value: string }): VNode {
  return (
    <div class="stat">
      <div class="stat-title">{label}</div>
      <div class="stat-value text-primary">{value}</div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────

export const page: PageConfig<Model, Msg, Shared, { id: string }> = {
  init: (params) => noFx({ id: params.id, compact: false, visits: 1, mountedAt: null }),
  update: (model, msg) => {
    switch (msg.tag) {
      case "ToggleCompact":
        return noFx({ ...model, compact: !model.compact });
      case "Mounted":
        return noFx({ ...model, mountedAt: msg.at });
    }
  },

  onMount: ({ dispatch, model, root }) => {
    root.querySelector<HTMLButtonElement>("#profile-compact-toggle")?.focus();
    const activeUser = USERS.find((user) => user.id === model.id);
    if (activeUser) document.title = `${activeUser.name} · Teelm`;
    dispatch({ tag: "Mounted", at: new Date().toLocaleTimeString() });
  },

  afterUpdate: ({ model, prevModel, root }) => {
    if (model.compact !== prevModel.compact) {
      root.dataset.view = model.compact ? "compact" : "full";
    }
    const activeUser = USERS.find((user) => user.id === model.id);
    if (activeUser) document.title = `${activeUser.name} · Teelm`;
  },

  onUnmount: ({ shared }) => {
    document.title = shared.appName;
  },

  view: (model, shared, dispatch) => {
    const user = USERS.find((u) => u.id === model.id);

    if (!user) {
      return (
        <div class="text-center py-16">
          <div class="text-6xl mb-4">?</div>
          <h1 class="text-2xl font-bold mb-2">User Not Found</h1>
          <p class="text-base-content/60 mb-4">{`No user with ID "${model.id}"`}</p>
          <a {...routerLink("/users")} class="btn btn-primary">Back to Users</a>
        </div>
      );
    }

    const E = makeEvents(dispatch);
    return (
      <div>
        <div class="breadcrumbs text-sm mb-6">
          <ul>
            <li><a {...routerLink("/users")}>Users</a></li>
            <li>{user.name}</li>
          </ul>
        </div>

        <div class="card bg-base-100 shadow-sm">
          <div class="card-body">
            <div class="flex flex-wrap justify-between gap-3 mb-4">
              <div>
                <h1 class="text-2xl font-bold">{user.name}</h1>
                <p class="text-base-content/60">
                  This page uses onMount, afterUpdate, onUnmount, save/load.
                </p>
              </div>
              <button
                id="profile-compact-toggle"
                class={model.compact ? "btn btn-primary btn-sm" : "btn btn-outline btn-sm"}
                {...E.onClick({ tag: "ToggleCompact" })}
              >
                {model.compact ? "Compact On" : "Compact Off"}
              </button>
            </div>

            <div class="flex items-center gap-6 mb-6">
              <div
                class="w-20 h-20 rounded-full flex items-center justify-center text-white font-bold text-3xl shrink-0"
                style={{ background: userColor(user.id) }}
              >
                {user.name[0]}
              </div>
              <div>
                <p class="text-base-content/60">{user.role}</p>
                <div class="flex gap-2 mt-2">
                  <span class="badge badge-primary">{`ID: ${user.id}`}</span>
                  <span class="badge badge-ghost">{`${user.projects} projects`}</span>
                </div>
              </div>
            </div>

            <div class="alert alert-info mb-6">
              <span>{
                `Mounted at ${model.mountedAt ?? "pending"} · cached visits ${model.visits}` +
                ` · layout ${model.compact ? "compact" : "full"} · ${shared.appName}`
              }</span>
            </div>

            <div class="stats shadow w-full">
              <StatItem label="Projects" value={String(user.projects)} />
              <StatItem label="Commits" value={String(user.projects * 47)} />
              <StatItem label="Reviews" value={String(user.projects * 12)} />
            </div>

            {model.compact ? (
              <p class="text-sm text-base-content/60 mt-4">
                afterUpdate toggles a data attribute on the page root after the DOM commit.
              </p>
            ) : (
              <div class="mockup-code mt-4 text-sm">
                <pre><code>save() keeps compact mode in cache</code></pre>
                <pre><code>load() restores it and bumps visit count</code></pre>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  },

  // Cache page state when navigating away — restore on back
  save: (model) => ({ compact: model.compact, visits: model.visits }),
  load: (saved, params) => {
    const cached = saved as Pick<Model, "compact" | "visits">;
    return noFx({
      id: params.id,
      compact: cached.compact,
      visits: cached.visits + 1,
      mountedAt: null,
    });
  },
};
