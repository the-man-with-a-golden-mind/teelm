// Teelm — Modern TypeScript Teelm
// Elm-inspired, functional, type-safe, optimized

// ── Constants ──────────────────────────────────────────────────

const TEXT = 3;
const SSR = 1;
const SVG_NS = "http://www.w3.org/2000/svg";
const EMPTY_OBJ: Record<string, any> = {};
const EMPTY_ARR: VNode[] = [];

// ── Types ──────────────────────────────────────────────────────

export interface VNode {
  tag: string | MemoView;
  props: Record<string, any>;
  key: string | number | undefined;
  children: VNode[];
  type: number;
  memo: unknown;
  node: Node | undefined;
}

export type MemoView<P extends Record<string, any> = any> = (props: P) => VNode;

export type Dispatch<Msg> = (msg: Msg | readonly Msg[]) => void;

// `P = any` is intentional: it gives effect/sub *containers* (Cmd, Subs)
// permissive variance so they can hold mixed-prop entries. Concrete creators
// (delay, http, interval, …) preserve precise prop typing at the call site.
export type EffectFn<Msg, P = any> = (dispatch: Dispatch<Msg>, props: P) => void;
export type Effect<Msg, P = any> = readonly [EffectFn<Msg, P>, P];

// Branded so the only way to construct a Cmd<Msg> is via none/withFx/batch/mapEffect.
declare const __cmdBrand: unique symbol;
export type Cmd<Msg> = readonly Effect<Msg>[] & { readonly [__cmdBrand]: Msg };

export type SubFn<Msg, P = any> = (dispatch: Dispatch<Msg>, props: P) => () => void;

// Branded so a raw [fn, props] tuple is not assignable to Sub<Msg> without
// going through a sub-creator helper. The brand is type-only and erased at runtime.
declare const __subBrand: unique symbol;
export type Sub<Msg, P = any> = readonly [SubFn<Msg, P>, P] & { readonly [__subBrand]: Msg };

/** Subscriptions list — falsy entries are dropped, allowing ergonomic conditional subs. */
export type Subs<Msg> = readonly (Sub<Msg> | false | null | undefined)[];

// init/update are tuple-only. Use noFx(state) when there are no effects.
export type UpdateResult<S, Msg> = readonly [S, Cmd<Msg>];
export type Update<S, Msg> = (state: Readonly<S>, msg: Msg) => UpdateResult<S, Msg>;
export type Init<S, Msg> = readonly [S, Cmd<Msg>];

export interface MountHook<S, Msg> {
  state: Readonly<S>;
  dispatch: Dispatch<Msg>;
  node: HTMLElement;
}

export interface RenderHook<S, Msg> extends MountHook<S, Msg> {
  prevState: Readonly<S> | undefined;
}

export interface UnmountHook<S> {
  state: Readonly<S>;
  node: HTMLElement;
}

export interface AppConfig<S, Msg> {
  init: Init<S, Msg>;
  update: Update<S, Msg>;
  view: (state: Readonly<S>, dispatch: Dispatch<Msg>) => VNode;
  subscriptions?: (state: Readonly<S>) => Subs<Msg>;
  node: HTMLElement;
  onMount?: (hook: MountHook<S, Msg>) => void;
  afterRender?: (hook: RenderHook<S, Msg>) => void;
  onUnmount?: (hook: UnmountHook<S>) => void;
  debug?: boolean | DebugConfig;
  middleware?: (dispatch: Dispatch<Msg>) => Dispatch<Msg>;
  /** Disable deep-freezing state. Default: freeze always. Set false only for known hot paths. */
  freezeState?: boolean;
}

export interface DebugConfig {
  console?: boolean;
  history?: boolean;
  maxHistory?: number;
}

export interface AppInstance<S, Msg> {
  dispatch: Dispatch<Msg>;
  getState: () => Readonly<S>;
  destroy: () => void;
  getHistory: () => readonly Readonly<S>[];
  getHistoryIndex: () => number;
  goBack: () => void;
  goForward: () => void;
  jumpTo: (index: number) => void;
}

// ── Helpers ────────────────────────────────────────────────────

export function resolveClass(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    let out = "";
    for (let i = 0; i < value.length; i++) {
      const v = resolveClass(value[i]);
      if (v) out += (out ? " " : "") + v;
    }
    return out;
  }
  if (value && typeof value === "object") {
    let out = "";
    for (const k in value as Record<string, unknown>) {
      if (Object.prototype.hasOwnProperty.call(value, k) && (value as any)[k]) {
        out += (out ? " " : "") + k;
      }
    }
    return out;
  }
  return "";
}

function deepFreeze<T>(obj: T): Readonly<T> {
  if (obj != null && typeof obj === "object" && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    const keys = Object.getOwnPropertyNames(obj);
    for (let i = 0; i < keys.length; i++) {
      deepFreeze((obj as any)[keys[i]!]);
    }
  }
  return obj as Readonly<T>;
}

// ── VNode Construction ─────────────────────────────────────────

// OPT: for-in loop instead of destructuring spread — avoids temp object allocation
// OPT: shared EMPTY_OBJ/EMPTY_ARR — avoids per-call {} and [] allocations
// OPT: all VNode properties always present — monomorphic V8 hidden class

export function h(
  tag: string,
  props?: Record<string, any> | null,
  ...rawChildren: any[]
): VNode {
  const p = props || EMPTY_OBJ;
  let key: string | number | undefined;
  const out: Record<string, any> = {};

  for (const k in p) {
    if (!Object.prototype.hasOwnProperty.call(p, k)) continue;
    if (k === "key") {
      key = p[k];
    } else if (k === "class") {
      const v = p[k];
      out.class = typeof v === "string" ? v : resolveClass(v);
    } else if (k === "className") {
      const v = p[k];
      if (out.class == null || out.class === "") out.class = typeof v === "string" ? v : resolveClass(v);
    } else {
      out[k] = p[k];
    }
  }

  let children: VNode[];
  if (rawChildren.length === 0) {
    children = EMPTY_ARR;
  } else {
    children = [];
    pushChildren(rawChildren, children);
  }

  return { tag, props: out, key, children, type: 0, memo: undefined, node: undefined };
}

export function text(value: string | number | boolean): VNode {
  return {
    tag: typeof value === "string" ? value : String(value),
    props: EMPTY_OBJ,
    key: undefined,
    children: EMPTY_ARR,
    type: TEXT,
    memo: undefined,
    node: undefined,
  };
}

export function memo<P extends Record<string, any>>(
  component: MemoView<P>,
  props: P,
): VNode {
  return {
    tag: component,
    props: EMPTY_OBJ,
    key: (props as any).key,
    children: EMPTY_ARR,
    type: 0,
    memo: props,
    node: undefined,
  };
}

export function lazy<T>(view: (data: T) => VNode, data: T): VNode {
  return {
    tag: view as any,
    props: EMPTY_OBJ,
    key: (data != null && typeof data === "object") ? (data as any).key : undefined,
    children: EMPTY_ARR,
    type: 0,
    memo: data,
    node: undefined,
  };
}

// OPT: inline text vnode creation — avoids text() function call overhead per string child
function pushChildren(raw: any[], out: VNode[]): void {
  for (let i = 0; i < raw.length; i++) {
    const child = raw[i];
    if (child == null || child === true || child === false) continue;
    if (typeof child === "object") {
      if (Array.isArray(child)) {
        pushChildren(child, out);
      } else {
        out.push(child);
      }
    } else {
      out.push({
        tag: typeof child === "string" ? child : String(child),
        props: EMPTY_OBJ,
        key: undefined,
        children: EMPTY_ARR,
        type: TEXT,
        memo: undefined,
        node: undefined,
      });
    }
  }
}

// ── Update Result Helpers ──────────────────────────────────────

// Single shared empty Cmd. Cast to Cmd<never> so the branded covariant type
// position lets it satisfy any Cmd<Msg> — never is bottom.
const EMPTY_CMD = Object.freeze([]) as unknown as Cmd<never>;

/** Empty Cmd, polymorphic in Msg. */
export const none: Cmd<never> = EMPTY_CMD;

export function batch<Msg>(commands: readonly Cmd<Msg>[]): Cmd<Msg> {
  const batchedEffects: Effect<Msg>[] = [];
  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i];
    if (cmd) {
      for (let j = 0; j < cmd.length; j++) {
        batchedEffects.push(cmd[j]!);
      }
    }
  }
  return batchedEffects as unknown as Cmd<Msg>;
}

/** Wrap state with no effects. The Cmd<never> result satisfies any expected Cmd<Msg>. */
export function noFx<S>(state: S): readonly [S, Cmd<never>] {
  return [state, EMPTY_CMD];
}

export function withFx<S, Msg>(
  state: S,
  ...effects: readonly Effect<Msg>[]
): readonly [S, Cmd<Msg>] {
  return [state, effects as unknown as Cmd<Msg>];
}

// ── Composition (Elm-style nested TEA) ─────────────────────────

function mapMsg<A, B>(dispatch: Dispatch<B>, fn: (a: A) => B): Dispatch<A> {
  return (msg) => {
    if (Array.isArray(msg)) {
      const out: B[] = [];
      for (let i = 0; i < msg.length; i++) out.push(fn(msg[i]!));
      dispatch(out);
    } else {
      dispatch(fn(msg as A));
    }
  };
}

export function mapEffect<A, B, P>(
  effect: Effect<A, P>,
  fn: (a: A) => B,
): Effect<B, P> {
  const [runner, props] = effect;
  return [(dispatch, p) => runner(mapMsg(dispatch, fn), p), props];
}

export function mapCmd<A, B>(cmd: Cmd<A>, fn: (a: A) => B): Cmd<B> {
  const out: Effect<B>[] = [];
  for (let i = 0; i < cmd.length; i++) {
    out.push(mapEffect(cmd[i]!, fn));
  }
  return out as unknown as Cmd<B>;
}

export function mapSub<A, B, P>(
  sub: Sub<A, P> | false | null | undefined,
  fn: (a: A) => B,
): Sub<B, P> | false | null | undefined {
  if (!sub) return sub as undefined;
  const [runner, props] = sub as readonly [SubFn<A, P>, P];
  const wrapped = (dispatch: Dispatch<B>, p: P) => runner(mapMsg(dispatch, fn), p);
  return [wrapped, props] as unknown as Sub<B, P>;
}

export function mapDispatch<A, B>(
  dispatch: Dispatch<B>,
  fn: (a: A) => B,
): Dispatch<A> {
  return mapMsg(dispatch, fn);
}

/** Flatten lists of subs (with optional falsy entries) into a single Subs<Msg>. */
export function batchSubs<Msg>(
  ...args: readonly (Subs<Msg> | Sub<Msg> | false | null | undefined)[]
): Subs<Msg> {
  const out: (Sub<Msg> | false | null | undefined)[] = [];
  for (const item of args) {
    if (!item) continue;
    if (Array.isArray(item) && typeof item[0] === "function") {
      out.push(item as unknown as Sub<Msg>);
    } else if (Array.isArray(item)) {
      for (const s of item as Subs<Msg>) {
        if (s) out.push(s);
      }
    }
  }
  return out;
}

// ── DOM Operations ─────────────────────────────────────────────

interface EventfulNode extends Node {
  events?: Record<string, (event: Event) => void>;
}

function handleEvent(this: EventfulNode, event: Event): void {
  this.events![event.type]!(event);
}

// OPT: style patching iterates old/new separately — no temp merged object
function patchProp(
  el: HTMLElement & EventfulNode,
  key: string,
  oldVal: any,
  newVal: any,
  isSvg: boolean,
): void {
  // Security Hardening: XSS Protection at VDOM layer
  if (key === "innerHTML" || key === "outerHTML") {
    return;
  }

  if (key === "href" || key === "src" || key === "action" || key === "formAction") {
    if (typeof newVal === "string") {
      const v = newVal.trim().toLowerCase();
      if (v.startsWith("javascript:") || v.startsWith("data:") || v.startsWith("vbscript:")) {
        if (oldVal === "about:blank") return;
        newVal = "about:blank";
      }
    }
  }

  if (key === "style") {
    if (typeof newVal === "string") {
      el.style.cssText = newVal;
      return;
    }
    if (newVal) {
      for (const k in newVal) {
        const v = newVal[k] == null ? "" : newVal[k];
        if (k[0] === "-") {
          el.style.setProperty(k, v);
        } else {
          (el.style as any)[k] = v;
        }
      }
    }
    if (oldVal && typeof oldVal === "object") {
      for (const k in oldVal) {
        if (!newVal || !(k in newVal)) {
          if (k[0] === "-") {
            el.style.removeProperty(k);
          } else {
            (el.style as any)[k] = "";
          }
        }
      }
    }
    return;
  }

  if (key[0] === "o" && key[1] === "n") {
    const name = key.slice(2).toLowerCase();
    if (!el.events) el.events = {};
    el.events[name] = newVal;
    if (newVal) {
      if (!oldVal) el.addEventListener(name, handleEvent);
    } else {
      el.removeEventListener(name, handleEvent);
    }
    return;
  }

  if (key === "ref") {
    if (typeof newVal === "function") newVal(el);
    return;
  }

  if (!isSvg && key !== "list" && key !== "form" && key in el) {
    try {
      (el as any)[key] = newVal ?? "";
    } catch {
      /* readonly props */
    }
    return;
  }

  if (newVal == null || newVal === false) {
    el.removeAttribute(key);
  } else {
    el.setAttribute(key, String(newVal));
  }
}

// OPT: no `is` option object in fast path — createElement called without options (99.9% case)
function createNode(vnode: VNode, isSvg: boolean): Node {
  if (vnode.type === TEXT) {
    return (vnode.node = document.createTextNode(vnode.tag as string));
  }

  const tag = vnode.tag as string;
  isSvg = isSvg || tag === "svg";
  const props = vnode.props;

  const el = props.is
    ? isSvg
      ? document.createElementNS(SVG_NS, tag, { is: props.is })
      : document.createElement(tag, { is: props.is })
    : isSvg
      ? document.createElementNS(SVG_NS, tag)
      : document.createElement(tag);

  for (const k in props) {
    patchProp(el as HTMLElement & EventfulNode, k, null, props[k], isSvg);
  }

  const children = vnode.children;
  for (let i = 0; i < children.length; i++) {
    const resolved = resolveVNode(children[i]!);
    children[i] = resolved;
    el.appendChild(createNode(resolved, isSvg));
  }

  return (vnode.node = el);
}

// ── SSR Hydration ──────────────────────────────────────────────

function recycleNode(node: Node): VNode {
  if (node.nodeType === TEXT) {
    return {
      tag: node.nodeValue ?? "",
      props: EMPTY_OBJ,
      key: undefined,
      children: EMPTY_ARR,
      type: TEXT,
      memo: undefined,
      node,
    };
  }
  return {
    tag: node.nodeName.toLowerCase(),
    props: EMPTY_OBJ,
    key: undefined,
    children: Array.from(node.childNodes).map(recycleNode),
    type: SSR,
    memo: undefined,
    node,
  };
}

// ── Memo Resolution ────────────────────────────────────────────

function propsChanged(a: any, b: any): boolean {
  if (a === b) return false;
  if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) return true;

  let countA = 0;
  let countB = 0;
  for (const k in a) {
    if (a[k] !== b[k]) return true;
    countA++;
  }
  for (const k in b) countB++;
  return countA !== countB;
}

const vnodeComponent = new WeakMap<VNode, MemoView>();

function resolveVNode(next: VNode, prev?: VNode): VNode {
  if (next == null || (next as any) === true || (next as any) === false) {
    return text("");
  }
  if (typeof next.tag === "function") {
    const cmp = next.tag as MemoView;
    const props =
      next.memo !== undefined
        ? next.memo
        : next.children.length > 0
          ? { ...next.props, children: next.children }
          : next.props || EMPTY_OBJ;

    if (
      prev &&
      vnodeComponent.get(prev) === cmp &&
      prev.memo !== undefined &&
      next.memo !== undefined &&
      !propsChanged(prev.memo, next.memo)
    ) {
      return prev;
    }
    const resolved = resolveVNode((cmp as any)(props), prev);
    resolved.memo = next.memo !== undefined ? next.memo : props;
    vnodeComponent.set(resolved, cmp);
    return resolved;
  }
  return next;
}

// ── VDOM Patching — Keyed Reconciliation ───────────────────────

function getKey(vnode: VNode | undefined): string | number | undefined {
  return vnode?.key;
}

function patch(
  parent: Node,
  node: Node | undefined,
  oldV: VNode | undefined,
  newV: VNode,
  isSvg: boolean,
): Node {
  if (oldV === newV) {
    return node!;
  }

  // Text nodes
  if (oldV != null && oldV.type === TEXT && newV.type === TEXT) {
    if (oldV.tag !== newV.tag) node!.nodeValue = newV.tag as string;
    return (newV.node = node!);
  }

  // Different tag or first render → replace
  if (oldV == null || oldV.tag !== newV.tag) {
    const created = createNode((newV = resolveVNode(newV)), isSvg);
    node = parent.insertBefore(created, node ?? null);
    if (oldV?.node) parent.removeChild(oldV.node);
    return (newV.node = node);
  }

  // Same element tag → diff props & children
  const el = node as HTMLElement & EventfulNode;
  isSvg = isSvg || (newV.tag as string) === "svg";

  // OPT: iterate old + new props separately — no temp merged object
  const op = oldV.props;
  const np = newV.props;
  for (const k in np) {
    const ov =
      k === "value" || k === "selected" || k === "checked"
        ? (el as any)[k]
        : op[k];
    if (ov !== np[k]) patchProp(el, k, op[k], np[k], isSvg);
  }
  for (const k in op) {
    if (!(k in np)) patchProp(el, k, op[k], undefined, isSvg);
  }

  // ── Keyed children reconciliation ────────────────────────────

  const oc = oldV.children;
  const nc = newV.children;
  let oh = 0;
  let nh = 0;
  let ot = oc.length - 1;
  let nt = nc.length - 1;

  // Match from head
  while (nh <= nt && oh <= ot) {
    const oldChild = oc[oh]!;
    const ok = getKey(oldChild);
    if (ok == null || ok !== getKey(nc[nh])) break;
    patch(el, oldChild.node, oldChild, (nc[nh] = resolveVNode(nc[nh]!, oldChild)), isSvg);
    oh++;
    nh++;
  }

  // Match from tail
  while (nh <= nt && oh <= ot) {
    const oldChild = oc[ot]!;
    const ok = getKey(oldChild);
    if (ok == null || ok !== getKey(nc[nt])) break;
    patch(el, oldChild.node, oldChild, (nc[nt] = resolveVNode(nc[nt]!, oldChild)), isSvg);
    ot--;
    nt--;
  }

  if (oh > ot) {
    while (nh <= nt) {
      el.insertBefore(
        createNode((nc[nh] = resolveVNode(nc[nh]!)), isSvg),
        oc[oh]?.node ?? null,
      );
      nh++;
    }
  } else if (nh > nt) {
    while (oh <= ot) {
      el.removeChild(oc[oh]!.node!);
      oh++;
    }
  } else {
    const keyed: Record<string | number, VNode> = {};
    const used: Record<string | number, true> = {};

    for (let i = oh; i <= ot; i++) {
      const oci = oc[i]!;
      if (oci.key != null) keyed[oci.key] = oci;
    }

    while (nh <= nt) {
      const oldAtHead = oc[oh];
      const oldKey = getKey(oldAtHead);
      const newChild = (nc[nh] = resolveVNode(nc[nh]!, oldAtHead));
      const newKey = getKey(newChild);

      if (
        (oldKey != null && used[oldKey]) ||
        (newKey != null && newKey === getKey(oc[oh + 1]))
      ) {
        if (oldKey == null && oldAtHead?.node) el.removeChild(oldAtHead.node);
        oh++;
        continue;
      }

      if (newKey == null) {
        if (oldKey == null) {
          patch(el, oldAtHead?.node, oldAtHead, newChild, isSvg);
          nh++;
        }
        oh++;
      } else {
        if (oldKey === newKey) {
          patch(el, oldAtHead?.node, oldAtHead, newChild, isSvg);
          used[newKey] = true;
          oh++;
        } else {
          const tmp = keyed[newKey];
          if (tmp) {
            patch(
              el,
              el.insertBefore(tmp.node!, oldAtHead?.node ?? null),
              tmp,
              newChild,
              isSvg,
            );
            used[newKey] = true;
          } else {
            patch(el, oldAtHead?.node, undefined, newChild, isSvg);
          }
        }
        nh++;
      }
    }

    while (oh <= ot) {
      const rem = oc[oh]!;
      if (rem.key == null && rem.node) el.removeChild(rem.node);
      oh++;
    }
    for (const k in keyed) {
      if (!used[k]) {
        const node = keyed[k]!.node;
        if (node) el.removeChild(node);
      }
    }
  }

  return (newV.node = node!);
}

// ── Subscriptions ──────────────────────────────────────────────

type ActiveSub<Msg> = [SubFn<Msg, unknown>, Record<string, unknown>, () => void];

// OPT: iterate a then b separately — no { ...a, ...b } temp object
function subPropsChanged(
  a: Record<string, any>,
  b: Record<string, any>,
): boolean {
  for (const k in a) {
    if (Object.prototype.hasOwnProperty.call(a, k)) {
      if (a[k] !== b?.[k]) return true;
    }
  }
  for (const k in b) {
    if (
      Object.prototype.hasOwnProperty.call(b, k) &&
      !Object.prototype.hasOwnProperty.call(a, k)
    ) return true;
  }
  return false;
}

function patchSubs<Msg>(
  old: (ActiveSub<Msg> | undefined)[],
  next: Subs<Msg>,
  dispatch: Dispatch<Msg>,
): (ActiveSub<Msg> | undefined)[] {
  const out: (ActiveSub<Msg> | undefined)[] = [];
  const len = Math.max(old.length, next.length);

  for (let i = 0; i < len; i++) {
    const os = old[i];
    const ns = next[i];

    if (ns) {
      const [fn, props] = ns as readonly [SubFn<Msg, unknown>, unknown];
      const propsObj = (props ?? EMPTY_OBJ) as Record<string, unknown>;
      if (!os || fn !== os[0] || subPropsChanged(os[1] ?? EMPTY_OBJ, propsObj)) {
        if (os) os[2]();
        out.push([fn, propsObj, fn(dispatch, props)]);
      } else {
        out.push(os);
      }
    } else {
      if (os) os[2]();
      out.push(undefined);
    }
  }

  return out;
}

// ── App Runtime ────────────────────────────────────────────────

export function app<S, Msg>(config: AppConfig<S, Msg>): AppInstance<S, Msg> {
  const {
    init: rawInit,
    update,
    view,
    subscriptions,
    node: rootNode,
    onMount,
    afterRender,
    onUnmount,
    debug: rawDebug,
    middleware,
  } = config;

  const dbg: DebugConfig =
    rawDebug === true ? { console: true, history: true, maxHistory: 200 } : rawDebug ? rawDebug : {};

  // Init is always a tuple [state, cmd] — see Init<S, Msg>.
  const [initialState, initCmd] = rawInit;
  const shouldFreeze = config.freezeState !== false;
  let state: Readonly<S> = shouldFreeze ? deepFreeze(initialState) : (initialState as Readonly<S>);

  let vdom: VNode | undefined =
    rootNode.childNodes.length > 0 && rootNode.firstChild
      ? recycleNode(rootNode.firstChild)
      : undefined;
  let appNode: Node | undefined = vdom?.node;
  let subs: (ActiveSub<Msg> | undefined)[] = [];
  let rafId = 0;
  let destroyed = false;
  let mounted = false;
  let lastRenderedState: Readonly<S> | undefined;

  const stateHistory: Readonly<S>[] = dbg.history ? [state] : [];
  let historyIdx = dbg.history ? 0 : -1;

  const scheduleRender = (): void => {
    if (!rafId && !destroyed) {
      rafId = requestAnimationFrame(render);
    }
  };

  const render = (): void => {
    rafId = 0;
    if (destroyed) return;

    const prevState = lastRenderedState;
    const next = resolveVNode(view(state, dispatch), vdom);

    if (!vdom) {
      rootNode.textContent = "";
      appNode = createNode(next, false);
      rootNode.appendChild(appNode);
    } else {
      appNode = patch(rootNode, appNode!, vdom, next, false);
    }
    vdom = next;

    if (!mounted) {
      mounted = true;
      onMount?.({ state, dispatch, node: rootNode });
    }
    afterRender?.({ state, prevState, dispatch, node: rootNode });
    lastRenderedState = state;
  };

  const msgQueue: Msg[] = [];
  let isProcessing = false;

  let dispatch: Dispatch<Msg> = (msg) => {
    if (destroyed) return;

    if (Array.isArray(msg)) {
      for (let i = 0; i < msg.length; i++) msgQueue.push(msg[i]!);
    } else {
      msgQueue.push(msg as Msg);
    }

    if (isProcessing) return;
    isProcessing = true;

    let qIdx = 0;
    while (qIdx < msgQueue.length) {
      const currentMsg = msgQueue[qIdx++]!;
      const [resultState, resultCmd] = update(state, currentMsg);
      let nextState: S = resultState as S;
      const effects: readonly Effect<Msg>[] = resultCmd;

      if (dbg.console) {
        console.groupCollapsed(
          "%c[Teelm]%c %s",
          "color:#7c3aed;font-weight:bold",
          "color:inherit",
          String((currentMsg as any)?.tag ?? (currentMsg as any)?.type ?? currentMsg),
        );
        console.log("prev", state);
        console.log("next", nextState);
        if (effects.length) console.log("effects", effects.length);
        console.groupEnd();
      }

      if (shouldFreeze) nextState = deepFreeze(nextState) as S;

      if (nextState !== (state as unknown)) {
        state = nextState as Readonly<S>;

        if (dbg.history) {
          const max = dbg.maxHistory ?? 200;
          stateHistory.splice(historyIdx + 1);
          stateHistory.push(state);
          if (stateHistory.length > max) stateHistory.shift();
          historyIdx = stateHistory.length - 1;
        }

        if (subscriptions) {
          subs = patchSubs(subs, subscriptions(state), dispatch);
        }

        scheduleRender();
      }

      for (let i = 0; i < effects.length; i++) {
        const fx = effects[i]!;
        fx[0](dispatch, fx[1]);
      }
    }
    msgQueue.length = 0;
    isProcessing = false;
  };

  if (middleware) {
    dispatch = middleware(dispatch);
  }

  const timeTravel = (idx: number): void => {
    if (!dbg.history || idx < 0 || idx >= stateHistory.length) return;
    historyIdx = idx;
    state = stateHistory[idx]!;
    if (subscriptions) subs = patchSubs(subs, subscriptions(state), dispatch);
    scheduleRender();
  };

  const destroy = (): void => {
    if (destroyed) return;
    destroyed = true;
    if (rafId) cancelAnimationFrame(rafId);
    for (const s of subs) if (s) s[2]();
    subs = [];
    if (mounted) onUnmount?.({ state, node: rootNode });
    mounted = false;
    rootNode.textContent = "";
  };

  render();
  if (subscriptions) subs = patchSubs([], subscriptions(state), dispatch);
  
  for (let i = 0; i < initCmd.length; i++) {
    const effect = initCmd[i]!;
    effect[0](dispatch, effect[1]);
  }

  return {
    dispatch,
    getState: () => state,
    destroy,
    getHistory: () => stateHistory,
    getHistoryIndex: () => historyIdx,
    goBack: () => timeTravel(historyIdx - 1),
    goForward: () => timeTravel(historyIdx + 1),
    jumpTo: timeTravel,
  };
}
