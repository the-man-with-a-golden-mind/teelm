import fs from "node:fs";
import path from "node:path";

const green = (s: string) => `\x1b[32m${s}\x1b[0m`;

interface ParsedParam {
  name: string;
  type: "str" | "int" | "float";
}

function parsePattern(pattern: string): {
  filePath: string;
  routePath: string;
  params: ParsedParam[];
} {
  const segments = pattern.split("/");
  const fileSegments: string[] = [];
  const routeSegments: string[] = [];
  const params: ParsedParam[] = [];

  for (const seg of segments) {
    const paramMatch = seg.match(/^\[(\w+)(?::(\w+))?\]$/);
    if (paramMatch) {
      const name = paramMatch[1]!;
      const type = (paramMatch[2] as "str" | "int" | "float") || "str";
      params.push({ name, type });
      fileSegments.push(seg); // keep [id] or [id:int] in filename
      routeSegments.push(`:${name}`);
    } else if (seg === "Index") {
      fileSegments.push(seg);
      // Index maps to parent directory route — no segment added
    } else if (seg === "Home") {
      fileSegments.push(seg);
      // Home is a special case — maps to "/"
    } else {
      fileSegments.push(seg);
      routeSegments.push(seg.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase());
    }
  }

  const fileName = fileSegments.join("/");
  const lastSeg = segments[segments.length - 1]!;

  let routePath: string;
  if (segments.length === 1 && lastSeg === "Home") {
    routePath = "/";
  } else if (lastSeg === "Index") {
    routePath = "/" + routeSegments.join("/");
  } else {
    routePath = "/" + routeSegments.join("/");
  }

  if (routePath !== "/" && routePath.endsWith("/")) {
    routePath = routePath.slice(0, -1);
  }

  return { filePath: fileName, routePath, params };
}

function paramsTypeStr(params: ParsedParam[]): string {
  if (params.length === 0) return "{}";
  const entries = params.map((p) => {
    const tsType = p.type === "str" ? "string" : "number";
    return `${p.name}: ${tsType}`;
  });
  return `{ ${entries.join("; ")} }`;
}

function relativeImportPath(pageFilePath: string): string {
  // Calculate relative path from page file to shared.ts
  const depth = pageFilePath.split("/").length;
  return "../".repeat(depth);
}

function generatePageTs(routePath: string, params: ParsedParam[], pageFilePath: string): string {
  const paramsType = paramsTypeStr(params);
  const relPath = relativeImportPath(pageFilePath);
  const hasParams = params.length > 0;

  return `import { h, noFx, type Dispatch } from "teelm";
import { type PageConfig } from "teelm/router";
import type { Shared } from "${relPath}shared";

export const page: PageConfig<${hasParams ? paramsType : "{}"}, never, Shared, ${paramsType}> = {
  init: (${hasParams ? "params" : ""}) => noFx(${hasParams ? "{ ...params }" : "{}"}),
  update: (model) => noFx(model),
  view: (model, shared) =>
    h("div", { class: "prose max-w-none" },
      h("h1", {}, "${routePath}"),
    ),
};
`;
}

function generatePageTsx(routePath: string, params: ParsedParam[], pageFilePath: string): string {
  const paramsType = paramsTypeStr(params);
  const relPath = relativeImportPath(pageFilePath);
  const hasParams = params.length > 0;

  return `import { noFx } from "teelm";
import { type PageConfig } from "teelm/router";
import type { Shared } from "${relPath}shared";

export const page: PageConfig<${hasParams ? paramsType : "{}"}, never, Shared, ${paramsType}> = {
  init: (${hasParams ? "params" : ""}) => noFx(${hasParams ? "{ ...params }" : "{}"}),
  update: (model) => noFx(model),
  view: (model, shared) => (
    <div class="prose max-w-none">
      <h1>${routePath}</h1>
    </div>
  ),
};
`;
}

export async function run(args: string[]) {
  const jsx = args.includes("--jsx");
  const pattern = args.find((a) => !a.startsWith("-"));

  if (!pattern) {
    console.error("Usage: teelm add <route-pattern> [--jsx]");
    process.exit(1);
  }

  const { filePath, routePath, params } = parsePattern(pattern);
  const ext = jsx ? ".tsx" : ".ts";
  const fullPath = path.resolve(process.cwd(), "src", "pages", filePath + ext);

  if (fs.existsSync(fullPath)) {
    console.error(`Error: file already exists: src/pages/${filePath}${ext}`);
    process.exit(1);
  }

  const dir = path.dirname(fullPath);
  fs.mkdirSync(dir, { recursive: true });

  const content = jsx
    ? generatePageTsx(routePath, params, filePath)
    : generatePageTs(routePath, params, filePath);

  await Bun.write(fullPath, content);
  const rel = path.relative(process.cwd(), fullPath);
  console.log(`  ${green("+")} ${rel}  (route: ${routePath})`);

  // Auto-run gen after adding a page
  console.log("");
  const { run: gen } = await import("./gen");
  await gen([]);
}
