// Teelm vs Preact — Browser Benchmark
// Outputs results to the page and console

import { h, text, app, noFx } from "teelm";
import { h as ph, render as prender } from "preact";

const out = document.getElementById("out")!;
const status = document.getElementById("status")!;

function print(line: string) {
  out.textContent += line + "\n";
  console.log(line);
}

function bench(fn: () => void, iterations = 1): number {
  fn(); // warm up
  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  return (performance.now() - start) / iterations;
}

function row(label: string, sa: number, p: number) {
  const ratio = p / sa;
  const bar = ratio > 1
    ? `${"█".repeat(Math.min(Math.round(ratio * 4), 25))} ${ratio.toFixed(2)}x faster`
    : `${"░".repeat(Math.min(Math.round((1 / ratio) * 4), 25))} ${(1 / ratio).toFixed(2)}x slower`;
  print(
    `  ${label.padEnd(38)} ` +
    `SA: ${sa.toFixed(3).padStart(9)}ms  ` +
    `P: ${p.toFixed(3).padStart(9)}ms  ${bar}`
  );
}

function section(title: string) {
  print(`\n${"─".repeat(95)}`);
  print(`  ${title}`);
  print(`${"─".repeat(95)}`);
}

// ── 1. VNode Creation ──────────────────────────────────────────

function benchVNode() {
  section("VNode Creation (pure objects, no DOM)");
  const N = 10_000;

  row(`Create ${N} flat vnodes`,
    bench(() => { for (let i = 0; i < N; i++) h("div", { class: "item", key: i }, String(i)); }, 200),
    bench(() => { for (let i = 0; i < N; i++) ph("div", { class: "item", key: i }, String(i)); }, 200),
  );

  function saN(d: number): any { return d === 0 ? text("leaf") : h("div", {}, saN(d - 1), saN(d - 1)); }
  function pN(d: number): any { return d === 0 ? "leaf" : ph("div", null, pN(d - 1), pN(d - 1)); }

  row("Create 500 nested trees (depth 5)",
    bench(() => { for (let i = 0; i < 500; i++) saN(5); }, 50),
    bench(() => { for (let i = 0; i < 500; i++) pN(5); }, 50),
  );
}

// ── 2. Initial Render ──────────────────────────────────────────

function benchMount() {
  section("Initial DOM Render (mount N rows)");

  for (const N of [100, 1_000, 5_000]) {
    const saR = document.createElement("div");
    const pR = document.createElement("div");

    const saT = bench(() => {
      saR.innerHTML = "";
      app({
        init: noFx({ items: Array.from({ length: N }, (_, i) => i) }),
        update: (s: any) => noFx(s),
        view: (s: any) =>
          h("table", {}, h("tbody", {},
            ...s.items.map((i: number) =>
              h("tr", { key: i }, h("td", {}, String(i)), h("td", {}, `Item #${i}`), h("td", {}, h("button", {}, "x"))),
            ),
          )),
        node: saR,
      });
    });

    const pT = bench(() => {
      pR.innerHTML = "";
      prender(
        ph("table", null, ph("tbody", null,
          ...Array.from({ length: N }, (_, i) =>
            ph("tr", { key: i }, ph("td", null, String(i)), ph("td", null, `Item #${i}`), ph("td", null, ph("button", null, "x"))),
          ),
        )),
        pR,
      );
    });

    row(`Mount ${N.toLocaleString()} rows`, saT, pT);
  }
}

// ── 3. DOM Patching ────────────────────────────────────────────

function benchPatch() {
  section("DOM Patching — Keyed Reconciliation");

  const N = 1_000;
  const initial = Array.from({ length: N }, (_, i) => i);

  function saRender(root: HTMLElement, items: number[]) {
    root.innerHTML = "";
    app({
      init: noFx({ items }),
      update: (s: any) => noFx(s),
      view: (s: any) =>
        h("table", {}, h("tbody", {},
          ...s.items.map((i: number) => h("tr", { key: i }, h("td", {}, String(i)), h("td", {}, `#${i}`))),
        )),
      node: root,
    });
  }

  function pRender(root: HTMLElement, items: number[]) {
    prender(
      ph("table", null, ph("tbody", null,
        ...items.map((i) => ph("tr", { key: i }, ph("td", null, String(i)), ph("td", null, `#${i}`))),
      )),
      root,
    );
  }

  const tests: [string, number[], number][] = [
    ["Replace all 1,000 rows", Array.from({ length: N }, (_, i) => i + N * 10), 20],
    ["Swap 2 rows in 1,000", (() => { const a = [...initial]; a[1] = initial[998]!; a[998] = initial[1]!; return a; })(), 50],
    ["Append 1,000 to 1,000", [...initial, ...Array.from({ length: N }, (_, i) => i + N)], 20],
    ["Remove 1 from middle", initial.filter((_, i) => i !== 500), 50],
    ["Reverse 1,000 rows", [...initial].reverse(), 20],
    ["Clear all 1,000 rows", [], 50],
  ];

  for (const [label, items, iter] of tests) {
    const saR = document.createElement("div");
    const pR = document.createElement("div");
    saRender(saR, initial);
    pRender(pR, initial);

    row(label,
      bench(() => saRender(saR, items), iter),
      bench(() => pRender(pR, items), iter),
    );
  }
}

// ── 4. State Throughput ────────────────────────────────────────

function benchState() {
  section("State Update Throughput");

  const N = 100_000;

  const saR = document.createElement("div");
  const inst = app<{ n: number }, { tag: "I" }>({
    init: noFx({ n: 0 }),
    update: (s) => noFx({ n: s.n + 1 }),
    view: (s) => h("div", {}, String(s.n)),
    node: saR,
  });

  const saT = bench(() => { for (let i = 0; i < N; i++) inst.dispatch({ tag: "I" }); });
  inst.destroy();

  const pR = document.createElement("div");
  prender(ph("div", null, "0"), pR);
  const pT = bench(() => { for (let i = 0; i < N; i++) prender(ph("div", null, String(i)), pR); });

  row(`${N.toLocaleString()} state updates`, saT, pT);
  print(`  ${"".padEnd(38)} SA: ${N} dispatches → 1 render (rAF batching)`);
  print(`  ${"".padEnd(38)} P:  ${N} render() → ${N} DOM writes`);
}

// ── 5. Memory ──────────────────────────────────────────────────

function benchMemory() {
  section("Memory — VNode Shape");
  const saNode = h("div", { class: "a", key: "k", id: "x" }, "child");
  const pNode = ph("div", { class: "a", key: "k", id: "x" }, "child");
  print(`  Teelm keys: ${Object.keys(saNode).join(", ")}  (${JSON.stringify(saNode).length} bytes)`);
  print(`  Preact   keys: ${Object.keys(pNode as any).join(", ")}  (${JSON.stringify(pNode).length} bytes)`);
}

// ── Run ────────────────────────────────────────────────────────

print("╔══════════════════════════════════════════════════════════════════╗");
print("║          Teelm vs Preact — Performance Benchmark            ║");
print("╚══════════════════════════════════════════════════════════════════╝");
print("  SA = Teelm  |  P = Preact  |  █ = SA faster  ░ = P faster");

benchVNode();
benchMount();
benchPatch();
benchState();
benchMemory();

print(`\n${"─".repeat(95)}`);
print("  Done.");
print(`${"─".repeat(95)}`);

status.textContent = "Done ✓";
status.className = "done";
