import { routerApp, routerLink } from "teelm/router";
import { attachDebugger } from "teelm/debugger";
import { router } from "./generated/router";

// ── Boot ──────────────────────────────────────────────────────
// routerApp() handles all wiring: init, update, view, subscriptions.
// You just provide the router and a layout function.

const instance = routerApp({
  router,
  layout: (content, shared) => (
    <div class="min-h-screen flex flex-col">
      <nav class="navbar bg-base-100 shadow-sm sticky top-0 z-50 px-4">
        <div class="flex-1">
          <a {...routerLink("/")} class="btn btn-ghost text-xl font-bold text-primary">
            {shared.appName}
          </a>
        </div>
        <div class="flex gap-1">
          <a {...routerLink("/")} class="btn btn-sm btn-ghost">Home</a>
          <a {...routerLink("/about")} class="btn btn-sm btn-ghost">About</a>
          <a {...routerLink("/users")} class="btn btn-sm btn-ghost">Users</a>
          <a {...routerLink("/crash-lab")} class="btn btn-sm btn-ghost">Crash Lab</a>
        </div>
      </nav>
      <main class="flex-1 container mx-auto p-6 max-w-4xl">{content}</main>
      <footer class="footer footer-center p-4 bg-base-100 text-base-content/60 text-sm">
        <p>{`Built with ${shared.appName}`}</p>
      </footer>
    </div>
  ),
  node: document.getElementById("app")!,
  debug: true,
});

attachDebugger(instance);
