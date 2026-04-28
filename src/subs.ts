// Teelm — Subscription creators
// Subscriptions are [runner, props] tuples; runner returns a cleanup function.
// Sub<Msg> is a branded type — these helpers are the only way to construct one.

import type { Dispatch, Sub, SubFn } from "./teelm";

const sub = <Msg, P>(fn: SubFn<Msg, P>, props: P): Sub<Msg, P> =>
  [fn, props] as unknown as Sub<Msg, P>;

// ── Interval ───────────────────────────────────────────────────

function intervalSub<Msg>(
  dispatch: Dispatch<Msg>,
  props: { ms: number; msg: Msg | ((now: number) => Msg) },
): () => void {
  const id = setInterval(() => {
    dispatch(
      typeof props.msg === "function"
        ? (props.msg as (n: number) => Msg)(Date.now())
        : props.msg,
    );
  }, props.ms);
  return () => clearInterval(id);
}

export function interval<Msg>(
  ms: number,
  msg: Msg | ((now: number) => Msg),
): Sub<Msg, { ms: number; msg: Msg | ((now: number) => Msg) }> {
  return sub(intervalSub, { ms, msg });
}

// ── Keyboard ───────────────────────────────────────────────────

function keyDownSub<Msg>(
  dispatch: Dispatch<Msg>,
  props: { msg: (key: string, e: KeyboardEvent) => Msg },
): () => void {
  const handler = (e: KeyboardEvent) => dispatch(props.msg(e.key, e));
  addEventListener("keydown", handler);
  return () => removeEventListener("keydown", handler);
}

export function onKeyDown<Msg>(
  msg: (key: string, e: KeyboardEvent) => Msg,
): Sub<Msg, { msg: (key: string, e: KeyboardEvent) => Msg }> {
  return sub(keyDownSub, { msg });
}

function keyUpSub<Msg>(
  dispatch: Dispatch<Msg>,
  props: { msg: (key: string, e: KeyboardEvent) => Msg },
): () => void {
  const handler = (e: KeyboardEvent) => dispatch(props.msg(e.key, e));
  addEventListener("keyup", handler);
  return () => removeEventListener("keyup", handler);
}

export function onKeyUp<Msg>(
  msg: (key: string, e: KeyboardEvent) => Msg,
): Sub<Msg, { msg: (key: string, e: KeyboardEvent) => Msg }> {
  return sub(keyUpSub, { msg });
}

// ── Mouse ──────────────────────────────────────────────────────

function mouseMoveSub<Msg>(
  dispatch: Dispatch<Msg>,
  props: { msg: (x: number, y: number) => Msg },
): () => void {
  const handler = (e: MouseEvent) => dispatch(props.msg(e.clientX, e.clientY));
  addEventListener("mousemove", handler);
  return () => removeEventListener("mousemove", handler);
}

export function onMouseMove<Msg>(
  msg: (x: number, y: number) => Msg,
): Sub<Msg, { msg: (x: number, y: number) => Msg }> {
  return sub(mouseMoveSub, { msg });
}

// ── Window Resize ──────────────────────────────────────────────

function resizeSub<Msg>(
  dispatch: Dispatch<Msg>,
  props: { msg: (w: number, h: number) => Msg },
): () => void {
  const handler = () => dispatch(props.msg(innerWidth, innerHeight));
  addEventListener("resize", handler);
  return () => removeEventListener("resize", handler);
}

export function onResize<Msg>(
  msg: (w: number, h: number) => Msg,
): Sub<Msg, { msg: (w: number, h: number) => Msg }> {
  return sub(resizeSub, { msg });
}

// ── URL Change ─────────────────────────────────────────────────

function urlChangeSub<Msg>(
  dispatch: Dispatch<Msg>,
  props: { msg: (url: URL) => Msg },
): () => void {
  const handler = () => dispatch(props.msg(new URL(location.href)));
  addEventListener("popstate", handler);
  return () => removeEventListener("popstate", handler);
}

export function onUrlChange<Msg>(
  msg: (url: URL) => Msg,
): Sub<Msg, { msg: (url: URL) => Msg }> {
  return sub(urlChangeSub, { msg });
}

// ── Animation Frame ────────────────────────────────────────────

function animSub<Msg>(
  dispatch: Dispatch<Msg>,
  props: { msg: (t: number) => Msg },
): () => void {
  let id: number;
  const loop = (t: number) => {
    dispatch(props.msg(t));
    id = requestAnimationFrame(loop);
  };
  id = requestAnimationFrame(loop);
  return () => cancelAnimationFrame(id);
}

export function onAnimationFrame<Msg>(
  msg: (timestamp: number) => Msg,
): Sub<Msg, { msg: (t: number) => Msg }> {
  return sub(animSub, { msg });
}

// ── Generic DOM Event ──────────────────────────────────────────

function eventSub<Msg>(
  dispatch: Dispatch<Msg>,
  props: { target: EventTarget; event: string; msg: (e: Event) => Msg },
): () => void {
  const handler = (e: Event) => dispatch(props.msg(e));
  props.target.addEventListener(props.event, handler);
  return () => props.target.removeEventListener(props.event, handler);
}

export function onEvent<Msg>(
  event: string,
  msg: (e: Event) => Msg,
  target: EventTarget = window,
): Sub<Msg, { target: EventTarget; event: string; msg: (e: Event) => Msg }> {
  return sub(eventSub, { target, event, msg });
}

// ── WebSocket ──────────────────────────────────────────────────

interface WsProps<Msg> {
  url: string;
  protocols?: string | string[];
  onMessage: (data: unknown) => Msg;
  onOpen?: () => Msg;
  onClose?: () => Msg;
  onError?: (e: Event) => Msg;
}

function wsSub<Msg>(
  dispatch: Dispatch<Msg>,
  props: WsProps<Msg>,
): () => void {
  const ws = new WebSocket(props.url, props.protocols);
  ws.onmessage = (e) => dispatch(props.onMessage(e.data));
  if (props.onOpen) ws.onopen = () => dispatch(props.onOpen!());
  if (props.onClose) ws.onclose = () => dispatch(props.onClose!());
  if (props.onError) ws.onerror = (e) => dispatch(props.onError!(e));
  return () => ws.close();
}

export function websocket<Msg>(props: WsProps<Msg>): Sub<Msg, WsProps<Msg>> {
  return sub(wsSub, props);
}
