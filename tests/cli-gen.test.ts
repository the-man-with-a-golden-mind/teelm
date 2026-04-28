import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";

// Import gen internals by running the module — we test via the file system
const CLI_DIR = path.resolve(import.meta.dir, "..", "cli");

// Test helper: create temp dir, run gen, read output
const TMP = path.join(import.meta.dir, ".tmp-gen-test");

function setup(pages: Record<string, string>, options?: { ignore?: string }) {
  fs.rmSync(TMP, { recursive: true, force: true });
  for (const [filePath, content] of Object.entries(pages)) {
    const full = path.join(TMP, "src", "pages", filePath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  // gen needs shared.ts to exist (for imports)
  const sharedDir = path.join(TMP, "src");
  fs.mkdirSync(sharedDir, { recursive: true });
  fs.writeFileSync(
    path.join(sharedDir, "shared.ts"),
    'export interface Shared {}\nexport const initialShared = {};\n',
  );
  if (options?.ignore) {
    fs.writeFileSync(path.join(TMP, ".teelmignore"), options.ignore);
  }
}

function cleanup() {
  fs.rmSync(TMP, { recursive: true, force: true });
}

async function runGen(): Promise<string> {
  const origCwd = process.cwd();
  process.chdir(TMP);
  try {
    // Fresh import each time
    delete require.cache[path.join(CLI_DIR, "gen.ts")];
    const { run } = await import(path.join(CLI_DIR, "gen.ts"));
    await run([]);
    const outFile = path.join(TMP, "src", "generated", "router.ts");
    return fs.readFileSync(outFile, "utf-8");
  } finally {
    process.chdir(origCwd);
  }
}

const STUB_PAGE = `import { h } from "teelm";
import { type PageConfig } from "teelm/router";
export const page: PageConfig<{}, never, any, {}> = {
  init: () => ({}),
  update: (m) => m,
  view: () => h("div", {}),
};
`;

const STUB_PARAM_PAGE = (params: string) => `import { h } from "teelm";
import { type PageConfig } from "teelm/router";
export const page: PageConfig<any, never, any, {${params}}> = {
  init: (p) => p,
  update: (m) => m,
  view: () => h("div", {}),
};
`;

afterEach(cleanup);

describe("teelm gen", () => {
  it("generates router for Home + About + NotFound", async () => {
    setup({
      "Home.ts": STUB_PAGE,
      "About.ts": STUB_PAGE,
      "NotFound.ts": STUB_PAGE,
    });

    const output = await runGen();

    expect(output).toContain("AUTO-GENERATED");
    expect(output).toContain('route("/")');
    expect(output).toContain('route("/about")');
    expect(output).toContain("notFound: NotFound");
    expect(output).toContain('import { page as Home }');
    expect(output).toContain('import { page as About }');
    expect(output).toContain('import { page as NotFound }');
    // NotFound is NOT in routes array
    expect(output).not.toMatch(/page\(route\(""\)/);
  });

  it("handles nested directories", async () => {
    setup({
      "Home.ts": STUB_PAGE,
      "users/Index.ts": STUB_PAGE,
      "NotFound.ts": STUB_PAGE,
    });

    const output = await runGen();

    expect(output).toContain('route("/users")');
    expect(output).toContain("usersIndex");
  });

  it("handles dynamic params with [id]", async () => {
    setup({
      "Home.ts": STUB_PAGE,
      "users/[id].ts": STUB_PARAM_PAGE(" id: string "),
      "NotFound.ts": STUB_PAGE,
    });

    const output = await runGen();

    expect(output).toContain('route("/users/:id"');
    expect(output).toContain("id: str");
    expect(output).toContain("import { page as usersId }");
  });

  it("handles typed params [id:int]", async () => {
    setup({
      "Home.ts": STUB_PAGE,
      "users/[id:int].ts": STUB_PARAM_PAGE(" id: number "),
      "NotFound.ts": STUB_PAGE,
    });

    const output = await runGen();

    expect(output).toContain("id: int");
    expect(output).toContain(", int");
  });

  it("handles float params [price:float]", async () => {
    setup({
      "Home.ts": STUB_PAGE,
      "products/[price:float].ts": STUB_PARAM_PAGE(" price: number "),
      "NotFound.ts": STUB_PAGE,
    });

    const output = await runGen();

    expect(output).toContain("price: float");
    expect(output).toContain(", float");
  });

  it("handles .tsx files", async () => {
    setup({
      "Home.tsx": STUB_PAGE,
      "NotFound.tsx": STUB_PAGE,
    });

    const output = await runGen();

    expect(output).toContain('route("/")');
    expect(output).toContain('import { page as Home } from "../pages/Home"');
  });

  it("converts PascalCase to kebab-case in routes", async () => {
    setup({
      "Home.ts": STUB_PAGE,
      "UserProfile.ts": STUB_PAGE,
      "NotFound.ts": STUB_PAGE,
    });

    const output = await runGen();

    expect(output).toContain('route("/user-profile")');
  });

  it("sorts static routes before dynamic", async () => {
    setup({
      "Home.ts": STUB_PAGE,
      "users/Index.ts": STUB_PAGE,
      "users/[id].ts": STUB_PARAM_PAGE(" id: string "),
      "NotFound.ts": STUB_PAGE,
    });

    const output = await runGen();

    const usersStaticIdx = output.indexOf('route("/users")');
    const usersDynamicIdx = output.indexOf('route("/users/:id"');
    expect(usersStaticIdx).toBeLessThan(usersDynamicIdx);
  });

  it("only imports used parsers", async () => {
    setup({
      "Home.ts": STUB_PAGE,
      "About.ts": STUB_PAGE,
      "NotFound.ts": STUB_PAGE,
    });

    const output = await runGen();

    // No dynamic params → no str/int/float imports
    expect(output).not.toContain(", str");
    expect(output).not.toContain(", int");
    expect(output).not.toContain(", float");
  });

  it("handles deeply nested paths", async () => {
    setup({
      "Home.ts": STUB_PAGE,
      "users/[userId]/posts/[postId:int].ts": STUB_PARAM_PAGE(" userId: string, postId: number "),
      "NotFound.ts": STUB_PAGE,
    });

    const output = await runGen();

    expect(output).toContain('route("/users/:userId/posts/:postId"');
    expect(output).toContain("userId: str");
    expect(output).toContain("postId: int");
  });

  it("supports lowercase index.ts files as route entrypoints", async () => {
    setup({
      "blog/index.ts": STUB_PAGE,
      "NotFound.ts": STUB_PAGE,
    });

    const output = await runGen();

    expect(output).toContain('route("/blog")');
    expect(output).toContain('import { page as blogIndex }');
  });

  it("ignores underscored helpers and component suffixes inside pages", async () => {
    setup({
      "Home.ts": STUB_PAGE,
      "_draft.ts": STUB_PAGE,
      "users/_helpers.ts": STUB_PAGE,
      "users/Profile.component.tsx": STUB_PAGE,
      "users/index.ts": STUB_PAGE,
      "NotFound.ts": STUB_PAGE,
    });

    const output = await runGen();

    expect(output).toContain('route("/")');
    expect(output).toContain('route("/users")');
    expect(output).not.toContain("_draft");
    expect(output).not.toContain("_helpers");
    expect(output).not.toContain("Profilecomponent");
    expect(output).not.toContain('route("/users/profile.component")');
  });

  it("honors .teelmignore patterns", async () => {
    setup({
      "Home.ts": STUB_PAGE,
      "admin/Index.ts": STUB_PAGE,
      "internal/Secret.ts": STUB_PAGE,
      "NotFound.ts": STUB_PAGE,
    }, { ignore: "internal/**\nadmin/**\n" });

    const output = await runGen();

    expect(output).toContain('route("/")');
    expect(output).not.toContain('route("/admin")');
    expect(output).not.toContain('route("/internal/secret")');
  });
});
