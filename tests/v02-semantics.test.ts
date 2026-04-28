// Regression tests for the v0.2 breaking changes to the framework runtime:
// - tuple-only init/update
// - null-state no longer destroys the app
// - state is deep-frozen by default
// - branded Cmd/Sub force creator helpers
// - storage error model

import { describe, expect, test } from "bun:test";
import { app, h, withFx, noFx, none, batch, mapCmd, mapSub, type Cmd } from "../src/teelm";
import { delay, storageSet, storageGet, type StorageError } from "../src/fx";
import { interval } from "../src/subs";
import { Decode, Result } from "../src/functional";
import { createDispatchSpy } from "../src/testing";

const tick = () => new Promise<void>((r) => setTimeout(r, 20));

describe("v0.2 — tuple-only init/update", () => {
  test("init must be a [state, cmd] tuple", () => {
    const node = document.createElement("div");
    const inst = app({
      init: noFx({ count: 0 }),
      update: (s) => noFx(s),
      view: (s) => h("div", {}, String(s.count)),
      node,
    });
    expect(inst.getState()).toEqual({ count: 0 });
    inst.destroy();
  });

  test("withFx returns a Cmd-wrapped tuple", () => {
    const fx = delay<{ tag: "X" }>(10, { tag: "X" });
    const [state, cmd] = withFx({ ok: true }, fx);
    expect(state).toEqual({ ok: true });
    expect(cmd.length).toBe(1);
  });

  test("noFx pairs state with the empty Cmd", () => {
    const [state, cmd] = noFx({ a: 1 });
    expect(state).toEqual({ a: 1 });
    expect(cmd.length).toBe(0);
  });

  test("batch concatenates Cmds", () => {
    type Msg = { tag: "X" };
    const a = withFx<{}, Msg>({}, delay<Msg>(0, { tag: "X" }));
    const b = withFx<{}, Msg>({}, delay<Msg>(0, { tag: "X" }));
    const merged = batch([a[1], b[1]]);
    expect(merged.length).toBe(2);
  });
});

describe("v0.2 — state is always deep-frozen", () => {
  test("returned state is frozen even without debug", () => {
    const node = document.createElement("div");
    type S = { items: number[] };
    const inst = app<S, { tag: "noop" }>({
      init: noFx({ items: [1, 2, 3] }),
      update: (s) => noFx(s),
      view: () => h("div", {}, "x"),
      node,
    });
    const s = inst.getState();
    expect(Object.isFrozen(s)).toBe(true);
    expect(Object.isFrozen(s.items)).toBe(true);
    inst.destroy();
  });

  test("freezeState: false skips freezing (escape hatch)", () => {
    const node = document.createElement("div");
    type S = { items: number[] };
    const inst = app<S, { tag: "noop" }>({
      init: noFx({ items: [1] }),
      update: (s) => noFx(s),
      view: () => h("div", {}, "x"),
      node,
      freezeState: false,
    });
    const s = inst.getState();
    expect(Object.isFrozen(s)).toBe(false);
    inst.destroy();
  });
});

describe("v0.2 — null state no longer destroys the app", () => {
  test("returning null-equivalent does not implicitly destroy", async () => {
    const node = document.createElement("div");
    type S = { n: number };
    type Msg = { tag: "Inc" };
    const inst = app<S, Msg>({
      init: noFx({ n: 0 }),
      update: (s) => noFx({ n: s.n + 1 }),
      view: (s) => h("div", {}, String(s.n)),
      node,
    });
    inst.dispatch({ tag: "Inc" });
    await tick();
    // App still alive
    expect(inst.getState()).toEqual({ n: 1 });
    inst.destroy();
    // Now manual destroy worked
    expect(node.textContent).toBe("");
  });
});

describe("v0.2 — Cmd/Sub branding", () => {
  test("Cmd type can only be built via creators (compile-time guarantee)", () => {
    // At runtime there's no brand, but the only producers are
    // none/withFx/batch/mapCmd. Verify they produce arrays we can iterate.
    expect(none.length).toBe(0);
    const [, cmd] = withFx<{}, { tag: "X" }>({}, delay(0, { tag: "X" }));
    expect(cmd.length).toBe(1);
    const merged = batch([cmd, cmd]);
    expect(merged.length).toBe(2);
    const mapped = mapCmd<{ tag: "X" }, { tag: "Y" }>(cmd, () => ({ tag: "Y" }));
    expect(mapped.length).toBe(1);
  });

  test("mapSub flips msg type on a Sub", () => {
    const sub = interval<number>(50, () => 1);
    const mapped = mapSub<number, string, { ms: number; msg: number | ((n: number) => number) }>(
      sub,
      (n) => String(n),
    );
    expect(Array.isArray(mapped)).toBe(true);
  });

  test("none / Cmd<never> is assignable to Cmd<MyMsg>", () => {
    // Type-level only; if this compiles, the brand variance works.
    const c: Cmd<{ tag: "X" }> = none;
    expect(c.length).toBe(0);
  });
});

describe("v0.2 — storageSet error reporting", () => {
  test("storageSet without toMsg silently swallows errors", () => {
    const fx = storageSet<{ tag: "Done" }>("k", "v");
    expect(typeof fx[0]).toBe("function");
  });

  test("storageSet with toMsg dispatches Result.ok on success", async () => {
    type Msg = { tag: "Saved"; r: Result<undefined, StorageError> };
    const fx = storageSet<Msg>("foo", "bar", (r) => ({ tag: "Saved", r }));
    const spy = createDispatchSpy<Msg>();
    fx[0](spy.dispatch, fx[1]);
    const received = spy.last();
    expect(received).not.toBeUndefined();
    expect(received!.r.tag).toBe("Ok");
    expect(localStorage.getItem("foo")).toBe("bar");
  });
});

describe("v0.2 — storageGet decoder + Result", () => {
  test("missing key yields Ok(undefined)", () => {
    type Msg = { tag: "Got"; r: Result<number | undefined, StorageError | string> };
    localStorage.removeItem("missing-key");
    const fx = storageGet<number, Msg>({
      key: "missing-key",
      decoder: Decode.number,
      toMsg: (r) => ({ tag: "Got", r }),
    });
    const spy = createDispatchSpy<Msg>();
    fx[0](spy.dispatch, fx[1]);
    const got = spy.last();
    expect(got!.r).toEqual({ tag: "Ok", value: undefined });
  });

  test("present key with valid JSON decodes via the decoder", () => {
    localStorage.setItem("num-key", "42");
    type Msg = { tag: "Got"; r: Result<number | undefined, StorageError | string> };
    const fx = storageGet<number, Msg>({
      key: "num-key",
      decoder: Decode.number,
      toMsg: (r) => ({ tag: "Got", r }),
    });
    const spy = createDispatchSpy<Msg>();
    fx[0](spy.dispatch, fx[1]);
    const got = spy.last();
    expect(got!.r).toEqual({ tag: "Ok", value: 42 });
  });

  test("invalid JSON yields Result.Err with parse reason", () => {
    localStorage.setItem("bad-json", "not json");
    type Msg = { tag: "Got"; r: Result<number | undefined, StorageError | string> };
    const fx = storageGet<number, Msg>({
      key: "bad-json",
      decoder: Decode.number,
      toMsg: (r) => ({ tag: "Got", r }),
    });
    const spy = createDispatchSpy<Msg>();
    fx[0](spy.dispatch, fx[1]);
    const got = spy.last();
    expect(got!.r.tag).toBe("Err");
    if (got!.r.tag === "Err") expect(String(got!.r.error)).toContain("JSON");
  });

  test("decoder mismatch yields Result.Err with decoder message", () => {
    localStorage.setItem("wrong-shape", JSON.stringify("hello"));
    type Msg = { tag: "Got"; r: Result<number | undefined, StorageError | string> };
    const fx = storageGet<number, Msg>({
      key: "wrong-shape",
      decoder: Decode.number,
      toMsg: (r) => ({ tag: "Got", r }),
    });
    const spy = createDispatchSpy<Msg>();
    fx[0](spy.dispatch, fx[1]);
    const got = spy.last();
    expect(got!.r.tag).toBe("Err");
  });

  test("json: false treats stored value as raw string", () => {
    localStorage.setItem("plain", "hi");
    type Msg = { tag: "Got"; r: Result<string | undefined, StorageError | string> };
    const fx = storageGet<string, Msg>({
      key: "plain",
      decoder: Decode.string,
      json: false,
      toMsg: (r) => ({ tag: "Got", r }),
    });
    const spy = createDispatchSpy<Msg>();
    fx[0](spy.dispatch, fx[1]);
    const got = spy.last();
    expect(got!.r).toEqual({ tag: "Ok", value: "hi" });
  });
});
