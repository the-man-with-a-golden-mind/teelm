// Teelm — Effect creators
// Effects are [runner, props] tuples executed after state updates

import type { Dispatch, Effect } from "./teelm";
import { type Decoder, type HttpError, HttpError as Http, type Result, Result as R } from "./functional";

// ── Batch ──────────────────────────────────────────────────────

export function compactEffects<Msg>(
  ...effects: (Effect<Msg> | false | null | undefined)[]
): Effect<Msg>[] {
  return effects.filter(Boolean) as Effect<Msg>[];
}

// ── HTTP ───────────────────────────────────────────────────────
// Decoder-based: callers pass a Decoder<T> to validate the body. Errors
// are surfaced as a typed HttpError (BadUrl/Timeout/NetworkError/BadStatus/BadBody).

interface HttpProps<T, Msg> {
  url: string;
  options?: RequestInit;
  /** "json" parses+validates with `decoder`; "text" passes the raw body (decoder receives string). */
  expect: "json" | "text";
  decoder: Decoder<T>;
  timeoutMs?: number;
  toMsg: (result: Result<T, HttpError>) => Msg;
}

function httpFx<T, Msg>(
  dispatch: Dispatch<Msg>,
  props: HttpProps<T, Msg>,
): void {
  if (typeof props.url !== "string" || !props.url.trim()) {
    dispatch(props.toMsg(R.err(Http.badUrl(String(props.url)))));
    return;
  }

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  let timedOut = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  if (props.timeoutMs && controller) {
    timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, props.timeoutMs);
  }

  const init: RequestInit = controller
    ? { ...(props.options ?? {}), signal: controller.signal }
    : (props.options ?? {});

  fetch(props.url, init)
    .then(async (r) => {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      const text = await r.text();
      if (!r.ok) {
        return R.err<HttpError, T>(Http.badStatus(r.status, r.statusText, text));
      }
      if (props.expect === "json") {
        let parsed: unknown;
        try {
          parsed = text === "" ? undefined : JSON.parse(text);
        } catch (e) {
          const reason = e instanceof Error ? e.message : String(e);
          return R.err<HttpError, T>(Http.badBody(`JSON parse: ${reason}`, text));
        }
        const decoded = props.decoder(parsed);
        return decoded.tag === "Ok"
          ? R.ok<T, HttpError>(decoded.value)
          : R.err<HttpError, T>(Http.badBody(decoded.error, text));
      }
      // expect === "text": pass body string through decoder
      const decoded = props.decoder(text);
      return decoded.tag === "Ok"
        ? R.ok<T, HttpError>(decoded.value)
        : R.err<HttpError, T>(Http.badBody(decoded.error, text));
    })
    .catch((e) => {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      if (timedOut) return R.err<HttpError, T>(Http.timeout());
      const message = e instanceof Error ? e.message : String(e);
      return R.err<HttpError, T>(Http.networkError(message));
    })
    .then((result: Result<T, HttpError>) => dispatch(props.toMsg(result)));
}

export function http<T, Msg>(props: {
  url: string;
  options?: RequestInit;
  expect?: "json" | "text";
  decoder: Decoder<T>;
  timeoutMs?: number;
  toMsg: (result: Result<T, HttpError>) => Msg;
}): Effect<Msg, HttpProps<T, Msg>> {
  return [
    httpFx as (d: Dispatch<Msg>, p: HttpProps<T, Msg>) => void,
    { ...props, expect: props.expect ?? "json" },
  ];
}

// ── Delay ──────────────────────────────────────────────────────

function delayFx<Msg>(
  dispatch: Dispatch<Msg>,
  props: { ms: number; msg: Msg },
): void {
  setTimeout(() => dispatch(props.msg), props.ms);
}

export function delay<Msg>(ms: number, msg: Msg): Effect<Msg, { ms: number; msg: Msg }> {
  return [delayFx, { ms, msg }];
}

// ── Navigate ───────────────────────────────────────────────────

function navFx<Msg>(
  _: Dispatch<Msg>,
  props: { url: string; replace: boolean },
): void {
  if (props.replace) {
    history.replaceState(null, "", props.url);
  } else {
    history.pushState(null, "", props.url);
  }
  dispatchEvent(new PopStateEvent("popstate"));
}

export function navigate<Msg>(url: string, replace = false): Effect<Msg, { url: string; replace: boolean }> {
  return [navFx, { url, replace }];
}

// ── Console Log (debug) ────────────────────────────────────────

function logFx<Msg>(_: Dispatch<Msg>, args: unknown[]): void {
  console.log(...args);
}

export function log<Msg>(...args: unknown[]): Effect<Msg, unknown[]> {
  return [logFx, args];
}

// ── LocalStorage ───────────────────────────────────────────────

export type StorageError =
  | { readonly tag: "QuotaExceeded"; readonly message: string }
  | { readonly tag: "SecurityError"; readonly message: string }
  | { readonly tag: "Unavailable"; readonly message: string }
  | { readonly tag: "Unknown"; readonly message: string };

function classifyStorageError(e: unknown): StorageError {
  if (typeof DOMException !== "undefined" && e instanceof DOMException) {
    if (e.name === "QuotaExceededError") return { tag: "QuotaExceeded", message: e.message };
    if (e.name === "SecurityError") return { tag: "SecurityError", message: e.message };
  }
  const msg = e instanceof Error ? e.message : String(e);
  if (typeof localStorage === "undefined") return { tag: "Unavailable", message: msg };
  return { tag: "Unknown", message: msg };
}

interface StorageSetProps<Msg> {
  key: string;
  value: string;
  toMsg?: (result: Result<undefined, StorageError>) => Msg;
}

function storageSetFx<Msg>(
  dispatch: Dispatch<Msg>,
  p: StorageSetProps<Msg>,
): void {
  try {
    localStorage.setItem(p.key, p.value);
    if (p.toMsg) dispatch(p.toMsg(R.ok(undefined)));
  } catch (e) {
    if (p.toMsg) dispatch(p.toMsg(R.err(classifyStorageError(e))));
    // else: silent (preserves prior fire-and-forget semantics)
  }
}

export function storageSet<Msg>(
  key: string,
  value: string,
  toMsg?: (result: Result<undefined, StorageError>) => Msg,
): Effect<Msg, StorageSetProps<Msg>> {
  return [storageSetFx as (d: Dispatch<Msg>, p: StorageSetProps<Msg>) => void, { key, value, ...(toMsg ? { toMsg } : {}) }];
}

interface StorageGetProps<T, Msg> {
  key: string;
  decoder: Decoder<T>;
  /** When true, parse the stored value as JSON before decoding. Default: true. */
  json?: boolean;
  toMsg: (result: Result<T | undefined, StorageError | string>) => Msg;
}

function storageGetFx<T, Msg>(
  dispatch: Dispatch<Msg>,
  p: StorageGetProps<T, Msg>,
): void {
  let raw: string | null;
  try {
    raw = localStorage.getItem(p.key);
  } catch (e) {
    dispatch(p.toMsg(R.err(classifyStorageError(e))));
    return;
  }
  if (raw === null) {
    dispatch(p.toMsg(R.ok(undefined)));
    return;
  }
  const useJson = p.json !== false;
  if (useJson) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      dispatch(p.toMsg(R.err(`JSON parse: ${reason}`)));
      return;
    }
    const decoded = p.decoder(parsed);
    dispatch(p.toMsg(decoded.tag === "Ok" ? R.ok(decoded.value) : R.err(decoded.error)));
  } else {
    const decoded = p.decoder(raw);
    dispatch(p.toMsg(decoded.tag === "Ok" ? R.ok(decoded.value) : R.err(decoded.error)));
  }
}

export function storageGet<T, Msg>(props: {
  key: string;
  decoder: Decoder<T>;
  json?: boolean;
  toMsg: (result: Result<T | undefined, StorageError | string>) => Msg;
}): Effect<Msg, StorageGetProps<T, Msg>> {
  return [storageGetFx as (d: Dispatch<Msg>, p: StorageGetProps<T, Msg>) => void, { json: true, ...props }];
}

// ── Dispatch (useful in batch) ─────────────────────────────────

function dispatchFx<Msg>(dispatch: Dispatch<Msg>, msg: Msg): void {
  dispatch(msg);
}

export function dispatchMsg<Msg>(msg: Msg): Effect<Msg, Msg> {
  return [dispatchFx, msg];
}
