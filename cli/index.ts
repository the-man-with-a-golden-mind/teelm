#!/usr/bin/env bun
const [cmd, ...args] = process.argv.slice(2);

switch (cmd) {
  case "new":
    await import("./new").then((m) => m.run(args));
    break;
  case "add":
    await import("./add-page").then((m) => m.run(args));
    break;
  case "gen":
    await import("./gen").then((m) => m.run(args));
    break;
  case "dev":
    await import("./dev-build").then((m) => m.run("dev"));
    break;
  case "build":
    await import("./dev-build").then((m) => m.run("build"));
    break;
  default:
    console.log(`
teelm — Elm-inspired TypeScript framework

Commands:
  new <name>         Create a new project
  add <pattern>      Add a page (e.g., "users/[id]")
  gen                Generate router from src/pages/
  dev                Start dev server
  build              Build for production

Options:
  --jsx              Generate .tsx files (with add/new)
  --help             Show this help
`);
}
