import fs from "node:fs";
import path from "node:path";

const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

function write(filePath: string, content: string) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  Bun.write(filePath, content);
  const rel = path.relative(process.cwd(), filePath);
  console.log(`  ${green("+")} ${rel}`);
}

// ── Templates ────────────────────────────────────────────────────

function indexHtml(name: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${name}</title>
  <link rel="stylesheet" href="/src/app.css" />
</head>
<body class="min-h-screen bg-gray-50 text-gray-900">
  <div id="app"></div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
`;
}

function appCss(): string {
  return `@import "tailwindcss";
`;
}

function packageJson(name: string): string {
  return JSON.stringify(
    {
      name,
      private: true,
      version: "0.0.0",
      type: "module",
      scripts: {
        dev: "teelm dev",
        build: "teelm build",
        gen: "teelm gen",
      },
      dependencies: {
        teelm: "latest",
      },
      devDependencies: {
        vite: "^6",
        typescript: "^6",
        tailwindcss: "^4",
        "@tailwindcss/vite": "^4",
      },
    },
    null,
    2,
  );
}

function tsconfigJson(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        lib: ["DOM", "ESNext"],
        target: "ESNext",
        module: "ESNext",
        moduleResolution: "bundler",
        strict: true,
        jsx: "react-jsx",
        jsxImportSource: "teelm",
        noEmit: true,
        skipLibCheck: true,
        verbatimModuleSyntax: true,
      },
      include: ["src"],
    },
    null,
    2,
  );
}

function viteConfig(): string {
  return `import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss()],
});
`;
}

function sharedTs(): string {
  return `export interface Shared {
  appName: string;
}

export const initialShared: Shared = {
  appName: "MyApp",
};
`;
}

// ── main.ts ──────────────────────────────────────────────────────

function mainTs(): string {
  return `import { h } from "teelm";
import { routerApp, routerLink } from "teelm/router";
import { router } from "./generated/router";

routerApp({
  router,
  layout: (content, shared) =>
    h("div", { class: "min-h-screen flex flex-col" },
      h("nav", { class: "flex items-center gap-4 px-6 py-3 bg-white shadow-sm" },
        h("a", { ...routerLink("/"), class: "text-xl font-bold text-blue-600 no-underline" }, shared.appName),
        h("div", { class: "flex gap-2 ml-auto" },
          h("a", { ...routerLink("/"), class: "px-3 py-1.5 rounded-md text-sm text-gray-600 hover:bg-gray-100 no-underline" }, "Home"),
          h("a", { ...routerLink("/about"), class: "px-3 py-1.5 rounded-md text-sm text-gray-600 hover:bg-gray-100 no-underline" }, "About"),
        ),
      ),
      h("main", { class: "flex-1 max-w-4xl mx-auto w-full px-6 py-8" }, content),
      h("footer", { class: "text-center text-sm text-gray-400 py-4" },
        h("p", {}, "Built with Teelm"),
      ),
    ),
  node: document.getElementById("app")!,
});
`;
}

function mainTsx(): string {
  return `import { routerApp, routerLink } from "teelm/router";
import { router } from "./generated/router";

routerApp({
  router,
  layout: (content, shared) => (
    <div class="min-h-screen flex flex-col">
      <nav class="flex items-center gap-4 px-6 py-3 bg-white shadow-sm">
        <a {...routerLink("/")} class="text-xl font-bold text-blue-600 no-underline">{shared.appName}</a>
        <div class="flex gap-2 ml-auto">
          <a {...routerLink("/")} class="px-3 py-1.5 rounded-md text-sm text-gray-600 hover:bg-gray-100 no-underline">Home</a>
          <a {...routerLink("/about")} class="px-3 py-1.5 rounded-md text-sm text-gray-600 hover:bg-gray-100 no-underline">About</a>
        </div>
      </nav>
      <main class="flex-1 max-w-4xl mx-auto w-full px-6 py-8">{content}</main>
      <footer class="text-center text-sm text-gray-400 py-4">
        <p>Built with Teelm</p>
      </footer>
    </div>
  ),
  node: document.getElementById("app")!,
});
`;
}

// ── Page templates ───────────────────────────────────────────────

function homePageTs(): string {
  return `import { h, noFx } from "teelm";
import { routerLink, type PageConfig } from "teelm/router";
import type { Shared } from "../shared";

export const page: PageConfig<{}, never, Shared, {}> = {
  init: () => noFx({}),
  update: (model) => noFx(model),
  view: (_model, shared) =>
    h("div", { class: "text-center py-16" },
      h("h1", { class: "text-4xl font-bold mb-4" }, \`Welcome to \${shared.appName}\`),
      h("p", { class: "text-gray-500 mb-8" }, "Built with Teelm — Elm-inspired TypeScript framework"),
      h("a", {
        ...routerLink("/about"),
        class: "inline-block px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 no-underline",
      }, "Learn More"),
    ),
};
`;
}

function homePageTsx(): string {
  return `import { noFx } from "teelm";
import { routerLink, type PageConfig } from "teelm/router";
import type { Shared } from "../shared";

export const page: PageConfig<{}, never, Shared, {}> = {
  init: () => noFx({}),
  update: (model) => noFx(model),
  view: (_model, shared) => (
    <div class="text-center py-16">
      <h1 class="text-4xl font-bold mb-4">Welcome to {shared.appName}</h1>
      <p class="text-gray-500 mb-8">Built with Teelm — Elm-inspired TypeScript framework</p>
      <a {...routerLink("/about")} class="inline-block px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 no-underline">
        Learn More
      </a>
    </div>
  ),
};
`;
}

function aboutPageTs(): string {
  return `import { h, noFx } from "teelm";
import { routerLink, type PageConfig } from "teelm/router";
import type { Shared } from "../shared";

export const page: PageConfig<{}, never, Shared, {}> = {
  init: () => noFx({}),
  update: (model) => noFx(model),
  view: (_model, shared) =>
    h("div", {},
      h("h1", { class: "text-3xl font-bold mb-4" }, "About"),
      h("p", { class: "text-gray-600 mb-6 leading-relaxed" },
        \`\${shared.appName} is built with Teelm, an Elm-inspired TypeScript framework.\`,
      ),
      h("a", {
        ...routerLink("/"),
        class: "inline-block px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 no-underline text-gray-700",
      }, "Back Home"),
    ),
};
`;
}

function aboutPageTsx(): string {
  return `import { noFx } from "teelm";
import { routerLink, type PageConfig } from "teelm/router";
import type { Shared } from "../shared";

export const page: PageConfig<{}, never, Shared, {}> = {
  init: () => noFx({}),
  update: (model) => noFx(model),
  view: (_model, shared) => (
    <div>
      <h1 class="text-3xl font-bold mb-4">About</h1>
      <p class="text-gray-600 mb-6 leading-relaxed">
        {shared.appName} is built with Teelm, an Elm-inspired TypeScript framework.
      </p>
      <a {...routerLink("/")} class="inline-block px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 no-underline text-gray-700">
        Back Home
      </a>
    </div>
  ),
};
`;
}

function notFoundPageTs(): string {
  return `import { h, noFx } from "teelm";
import { routerLink, type PageConfig } from "teelm/router";
import type { Shared } from "../shared";

export const page: PageConfig<{ path: string }, never, Shared, { path: string }> = {
  init: (params) => noFx({ path: params.path }),
  update: (model) => noFx(model),
  view: (model) =>
    h("div", { class: "text-center py-16" },
      h("div", { class: "text-6xl font-bold text-gray-200 mb-4" }, "404"),
      h("h1", { class: "text-2xl font-bold mb-2" }, "Page Not Found"),
      h("p", { class: "text-gray-500 mb-6" }, \`The path "\${model.path}" doesn't exist.\`),
      h("a", {
        ...routerLink("/"),
        class: "inline-block px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 no-underline",
      }, "Go Home"),
    ),
};
`;
}

function notFoundPageTsx(): string {
  return `import { noFx } from "teelm";
import { routerLink, type PageConfig } from "teelm/router";
import type { Shared } from "../shared";

export const page: PageConfig<{ path: string }, never, Shared, { path: string }> = {
  init: (params) => noFx({ path: params.path }),
  update: (model) => noFx(model),
  view: (model) => (
    <div class="text-center py-16">
      <div class="text-6xl font-bold text-gray-200 mb-4">404</div>
      <h1 class="text-2xl font-bold mb-2">Page Not Found</h1>
      <p class="text-gray-500 mb-6">The path "{model.path}" doesn't exist.</p>
      <a {...routerLink("/")} class="inline-block px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 no-underline">
        Go Home
      </a>
    </div>
  ),
};
`;
}

// ── Command ──────────────────────────────────────────────────────

export async function run(args: string[]) {
  const jsx = args.includes("--jsx");
  const name = args.find((a) => !a.startsWith("-"));

  if (!name) {
    console.error("Usage: teelm new <name> [--jsx]");
    process.exit(1);
  }

  const root = path.resolve(process.cwd(), name);
  const ext = jsx ? ".tsx" : ".ts";

  if (fs.existsSync(root)) {
    console.error(`Error: directory "${name}" already exists.`);
    process.exit(1);
  }

  console.log(`\nCreating ${bold(name)}...\n`);

  write(path.join(root, "index.html"), indexHtml(name));
  write(path.join(root, "src", "app.css"), appCss());
  write(path.join(root, "package.json"), packageJson(name));
  write(path.join(root, "tsconfig.json"), tsconfigJson());
  write(path.join(root, "vite.config.ts"), viteConfig());
  write(path.join(root, "src", "shared.ts"), sharedTs());
  write(path.join(root, "src", `main${ext}`), jsx ? mainTsx() : mainTs());
  write(path.join(root, "src", "pages", `Home${ext}`), jsx ? homePageTsx() : homePageTs());
  write(path.join(root, "src", "pages", `About${ext}`), jsx ? aboutPageTsx() : aboutPageTs());
  write(path.join(root, "src", "pages", `NotFound${ext}`), jsx ? notFoundPageTsx() : notFoundPageTs());

  // Run gen to produce the initial router
  process.chdir(root);
  const { run: gen } = await import("./gen");
  await gen([]);

  console.log(`\n${green("Done!")} Your project is ready.\n`);
  console.log(`  cd ${name}`);
  console.log(`  bun install`);
  console.log(`  teelm dev\n`);
}
