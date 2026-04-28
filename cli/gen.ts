import fs from "node:fs";
import path from "node:path";

const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

// ── Types ────────────────────────────────────────────────────────

interface PageEntry {
  /** Relative path from src/pages/ without extension, e.g. "users/[id]" */
  filePath: string;
  /** Extension including dot, e.g. ".ts" or ".tsx" */
  ext: string;
  /** Route pattern for the router, e.g. "/users/:id" */
  routePattern: string;
  /** Import alias name, e.g. "UsersId" */
  importName: string;
  /** Parsed dynamic params */
  params: { name: string; type: "str" | "int" | "float" }[];
  /** Whether this is the NotFound page */
  isNotFound: boolean;
}

const DEFAULT_IGNORES = [
  "**/.*",
  "**/_*",
  "**/*.component.ts",
  "**/*.component.tsx",
  "**/*.test.ts",
  "**/*.test.tsx",
  "**/*.spec.ts",
  "**/*.spec.tsx",
  "**/*.d.ts",
] as const;

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\u0000")
    .replace(/\*/g, "[^/]*")
    .replace(/\u0000/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function loadIgnoreMatchers(projectDir: string): RegExp[] {
  const patterns: string[] = [...DEFAULT_IGNORES];
  const ignoreFile = path.join(projectDir, ".teelmignore");

  if (fs.existsSync(ignoreFile)) {
    const extra = fs.readFileSync(ignoreFile, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== "" && !line.startsWith("#"));
    patterns.push(...extra);
  }

  return patterns.map(globToRegExp);
}

function shouldIgnore(relativePath: string, matchers: RegExp[]): boolean {
  const segments = relativePath.split("/");
  if (segments.some((segment) => segment.startsWith(".") || segment.startsWith("_"))) {
    return true;
  }
  return matchers.some((matcher) => matcher.test(relativePath));
}

// ── Scanning ─────────────────────────────────────────────────────

function scanPages(pagesDir: string, projectDir: string): PageEntry[] {
  const entries: PageEntry[] = [];
  const ignoreMatchers = loadIgnoreMatchers(projectDir);

  function walk(dir: string, prefix: string) {
    if (!fs.existsSync(dir)) return;
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const nextPath = prefix ? `${prefix}/${item.name}` : item.name;
      if (shouldIgnore(nextPath, ignoreMatchers)) continue;
      if (item.isDirectory()) {
        walk(path.join(dir, item.name), nextPath);
      } else if (item.isFile() && /\.(ts|tsx)$/.test(item.name)) {
        const ext = path.extname(item.name);
        const baseName = item.name.slice(0, -ext.length);
        const filePath = prefix ? `${prefix}/${baseName}` : baseName;
        entries.push(parsePageEntry(filePath, ext));
      }
    }
  }

  walk(pagesDir, "");
  return entries;
}

function parsePageEntry(filePath: string, ext: string): PageEntry {
  const segments = filePath.split("/");
  const params: { name: string; type: "str" | "int" | "float" }[] = [];
  const routeSegments: string[] = [];
  const nameSegments: string[] = [];
  const lastSeg = segments[segments.length - 1]!;
  const isNotFound = lastSeg === "NotFound";

  for (const seg of segments) {
    const paramMatch = seg.match(/^\[(\w+)(?::(\w+))?\]$/);
    if (paramMatch) {
      const name = paramMatch[1]!;
      const type = (paramMatch[2] as "str" | "int" | "float") || "str";
      params.push({ name, type });
      routeSegments.push(`:${name}`);
      // For import name, capitalize the param name
      nameSegments.push(name.charAt(0).toUpperCase() + name.slice(1));
    } else if (seg === "Index" || seg === "index") {
      // Index maps to parent directory — no route segment added
      nameSegments.push("Index");
    } else {
      if (seg !== "Home" && seg !== "NotFound") {
        routeSegments.push(seg.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase());
      }
      nameSegments.push(seg);
    }
  }

  let routePattern: string;
  if (segments.length === 1 && lastSeg === "Home") {
    routePattern = "/";
  } else if (isNotFound) {
    routePattern = ""; // not a real route
  } else {
    routePattern = "/" + routeSegments.join("/");
    if (routePattern !== "/" && routePattern.endsWith("/")) {
      routePattern = routePattern.slice(0, -1);
    }
  }

  const importName = nameSegments.join("");

  return {
    filePath,
    ext,
    routePattern,
    importName,
    params,
    isNotFound,
  };
}

// ── Sorting ──────────────────────────────────────────────────────

function sortRoutes(entries: PageEntry[]): PageEntry[] {
  return [...entries].sort((a, b) => {
    // Static routes before dynamic
    const aDynamic = a.params.length > 0;
    const bDynamic = b.params.length > 0;
    if (aDynamic !== bDynamic) return aDynamic ? 1 : -1;

    // More specific (more segments) before less specific
    const aSegs = a.routePattern.split("/").filter(Boolean).length;
    const bSegs = b.routePattern.split("/").filter(Boolean).length;
    if (aSegs !== bSegs) return bSegs - aSegs;

    // Alphabetical as tiebreaker
    return a.routePattern.localeCompare(b.routePattern);
  });
}

// ── Code generation ──────────────────────────────────────────────

function generateRouter(entries: PageEntry[]): string {
  const notFoundEntry = entries.find((e) => e.isNotFound);
  const routeEntries = entries.filter((e) => !e.isNotFound);
  const sorted = sortRoutes(routeEntries);

  // Determine which parsers are actually used
  const usedParsers = new Set<string>();
  for (const entry of sorted) {
    for (const p of entry.params) {
      usedParsers.add(p.type);
    }
  }

  const parserImports = ["createRouter", "route", "page"];
  if (usedParsers.has("str")) parserImports.push("str");
  if (usedParsers.has("int")) parserImports.push("int");
  if (usedParsers.has("float")) parserImports.push("float");

  const lines: string[] = [];
  lines.push("// AUTO-GENERATED by teelm gen — do not edit");
  lines.push(`import { ${parserImports.join(", ")} } from "teelm/router";`);
  lines.push(`import type { Shared } from "../shared";`);
  lines.push(`import { initialShared } from "../shared";`);
  lines.push("");

  // Imports
  for (const entry of sorted) {
    lines.push(`import { page as ${entry.importName} } from "../pages/${entry.filePath}";`);
  }
  if (notFoundEntry) {
    lines.push(`import { page as ${notFoundEntry.importName} } from "../pages/${notFoundEntry.filePath}";`);
  }

  lines.push("");
  lines.push("export const router = createRouter<Shared>({");
  lines.push("  routes: [");

  for (const entry of sorted) {
    if (entry.params.length > 0) {
      const paramSpec = entry.params
        .map((p) => `${p.name}: ${p.type}`)
        .join(", ");
      lines.push(`    page(route("${entry.routePattern}", { ${paramSpec} }), ${entry.importName}),`);
    } else {
      lines.push(`    page(route("${entry.routePattern}"), ${entry.importName}),`);
    }
  }

  lines.push("  ],");
  lines.push("  shared: initialShared,");
  if (notFoundEntry) {
    lines.push(`  notFound: ${notFoundEntry.importName},`);
  }
  lines.push("});");
  lines.push("");

  return lines.join("\n");
}

// ── Command ──────────────────────────────────────────────────────

export async function run(_args: string[]) {
  const projectDir = process.cwd();
  const pagesDir = path.resolve(projectDir, "src", "pages");
  const outDir = path.resolve(projectDir, "src", "generated");
  const outFile = path.join(outDir, "router.ts");

  if (!fs.existsSync(pagesDir)) {
    console.error("Error: src/pages/ directory not found.");
    process.exit(1);
  }

  const entries = scanPages(pagesDir, projectDir);

  if (entries.length === 0) {
    console.error("Error: no page files found in src/pages/.");
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });
  const code = generateRouter(entries);
  fs.writeFileSync(outFile, code);

  const routeCount = entries.filter((e) => !e.isNotFound).length;
  const rel = path.relative(projectDir, outFile);
  console.log(`  ${green("+")} ${rel}  (${routeCount} route${routeCount === 1 ? "" : "s"})`);
}
