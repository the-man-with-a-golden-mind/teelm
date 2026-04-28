// Teelm — Visual State Debugger
// Attaches a floating overlay with state inspection & time-travel controls

import type { AppInstance } from "./teelm";

export interface DebuggerConfig {
  position?: "bottom-right" | "bottom-left" | "top-right" | "top-left";
  collapsed?: boolean;
  width?: string;
}

export function attachDebugger<S, Msg>(
  instance: AppInstance<S, Msg>,
  config: DebuggerConfig = {},
): { destroy: () => void } {
  const {
    position = "bottom-right",
    collapsed: startCollapsed = true,
    width = "380px",
  } = config;

  let isOpen = !startCollapsed;
  let lastState = instance.getState();
  let animId = 0;

  // ── Container ────────────────────────────────────────────────

  const pos: Record<string, string> = {
    "bottom-right": "bottom:8px;right:8px",
    "bottom-left": "bottom:8px;left:8px",
    "top-right": "top:8px;right:8px",
    "top-left": "top:8px;left:8px",
  };

  const root = document.createElement("div");
  root.id = "teelm-dbg";
  root.style.cssText = `
    position:fixed;${pos[position]};z-index:99999;
    font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;
    color:#e2e8f0;background:#0f172a;border:1px solid #334155;
    border-radius:8px;box-shadow:0 4px 24px rgba(0,0,0,0.4);
    overflow:hidden;max-height:70vh;display:flex;flex-direction:column;
  `;

  // ── Header ───────────────────────────────────────────────────

  const header = document.createElement("div");
  header.style.cssText =
    "padding:6px 12px;background:#1e293b;cursor:pointer;user-select:none;" +
    "display:flex;justify-content:space-between;align-items:center;" +
    "border-bottom:1px solid #334155;";

  const title = document.createElement("span");
  title.style.cssText = "font-weight:700;color:#a78bfa";
  title.textContent = "Teelm";

  const toggle = document.createElement("span");
  toggle.style.cssText = "color:#94a3b8;font-size:11px";

  header.append(title, toggle);
  header.onclick = () => {
    isOpen = !isOpen;
    refresh();
  };
  root.appendChild(header);

  // ── Time-Travel Controls ─────────────────────────────────────

  const controls = document.createElement("div");
  controls.style.cssText =
    "padding:4px 8px;background:#1e293b;display:flex;gap:4px;" +
    "align-items:center;border-bottom:1px solid #334155;";

  const btn = (label: string, fn: () => void) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.style.cssText =
      "all:unset;cursor:pointer;padding:2px 8px;background:#334155;" +
      "color:#e2e8f0;border-radius:4px;font-size:11px;";
    b.onmouseenter = () => (b.style.background = "#475569");
    b.onmouseleave = () => (b.style.background = "#334155");
    b.onclick = () => {
      fn();
      refresh();
    };
    return b;
  };

  const hLabel = document.createElement("span");
  hLabel.style.cssText =
    "flex:1;text-align:center;color:#64748b;font-size:11px;";

  controls.append(
    btn("\u23EE", () => instance.jumpTo(0)),
    btn("\u25C0", () => instance.goBack()),
    hLabel,
    btn("\u25B6", () => instance.goForward()),
    btn("\u23ED", () =>
      instance.jumpTo(instance.getHistory().length - 1),
    ),
  );
  root.appendChild(controls);

  // ── State View ───────────────────────────────────────────────

  const stateView = document.createElement("pre");
  stateView.style.cssText =
    "margin:0;padding:8px 12px;overflow:auto;flex:1;" +
    "white-space:pre-wrap;word-break:break-all;max-height:50vh;";
  root.appendChild(stateView);

  document.body.appendChild(root);

  // ── Formatters ───────────────────────────────────────────────

  function esc(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function fmt(v: any, d = 0): string {
    if (v === null)
      return '<span style="color:#f472b6">null</span>';
    if (v === undefined)
      return '<span style="color:#f472b6">undefined</span>';
    if (typeof v === "string")
      return `<span style="color:#67e8f9">"${esc(v)}"</span>`;
    if (typeof v === "number" || typeof v === "bigint")
      return `<span style="color:#fbbf24">${v}</span>`;
    if (typeof v === "boolean")
      return `<span style="color:#c084fc">${v}</span>`;
    if (d > 5) return "\u2026";

    const pad = "  ".repeat(d + 1);
    const end = "  ".repeat(d);

    if (Array.isArray(v)) {
      if (!v.length) return "[]";
      return (
        "[\n" +
        v.map((x) => pad + fmt(x, d + 1)).join(",\n") +
        "\n" +
        end +
        "]"
      );
    }

    const keys = Object.keys(v);
    if (!keys.length) return "{}";
    return (
      "{\n" +
      keys
        .map(
          (k) =>
            `${pad}<span style="color:#7dd3fc">${esc(k)}</span>: ${fmt(v[k], d + 1)}`,
        )
        .join(",\n") +
      "\n" +
      end +
      "}"
    );
  }

  // ── Refresh ──────────────────────────────────────────────────

  function refresh() {
    toggle.textContent = isOpen ? "\u2715" : "\u25B6";
    controls.style.display = isOpen ? "flex" : "none";
    stateView.style.display = isOpen ? "block" : "none";
    root.style.width = isOpen ? width : "auto";

    if (isOpen) {
      const h = instance.getHistory();
      const i = instance.getHistoryIndex();
      hLabel.textContent = h.length ? `${i + 1} / ${h.length}` : "\u2014";
      stateView.innerHTML = fmt(instance.getState());
    }
  }

  // ── Poll for state changes ───────────────────────────────────

  function tick() {
    const s = instance.getState();
    if (s !== lastState) {
      lastState = s;
      if (isOpen) refresh();
    }
    animId = requestAnimationFrame(tick);
  }
  animId = requestAnimationFrame(tick);

  refresh();

  return {
    destroy: () => {
      cancelAnimationFrame(animId);
      root.remove();
    },
  };
}
