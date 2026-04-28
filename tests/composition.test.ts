import { describe, it, expect } from "bun:test";
import { mapEffect, mapSub, mapDispatch, batchSubs, type Dispatch, type Effect, type Sub } from "../src/teelm";

// ── mapEffect() ───────────────────────────────────────────────

describe("mapEffect()", () => {
  it("transforms effect message type", () => {
    let dispatched: string | undefined;
    const inner: Effect<number> = [(dispatch, _props) => dispatch(42), null];
    const mapped = mapEffect(inner, (n: number) => `num:${n}`);

    mapped[0]((msg) => { dispatched = msg as string; }, mapped[1]);
    expect(dispatched).toBe("num:42");
  });

  it("preserves effect props", () => {
    const inner: Effect<number> = [(_, props) => { }, { url: "/api" }];
    const mapped = mapEffect(inner, (n: number) => String(n));
    expect(mapped[1]).toEqual({ url: "/api" });
  });

  it("handles batched messages", () => {
    let dispatched: any;
    const inner: Effect<number> = [(dispatch) => dispatch([1, 2]), null];
    const mapped = mapEffect(inner, (n: number) => `num:${n}`);

    mapped[0]((msg) => { dispatched = msg; }, mapped[1]);
    expect(dispatched).toEqual(["num:1", "num:2"]);
  });

  it("passes props through to the inner runner", () => {
    let receivedProps: any;
    const inner: Effect<number> = [(dispatch, props) => { receivedProps = props; dispatch(1); }, { token: "abc" }];
    const mapped = mapEffect(inner, (n: number) => n * 2);

    mapped[0](() => { }, mapped[1]);
    expect(receivedProps).toEqual({ token: "abc" });
  });

  it("handles null props", () => {
    let called = false;
    const inner: Effect<number> = [(dispatch, _props) => { called = true; dispatch(1); }, null];
    const mapped = mapEffect(inner, (n: number) => n);

    mapped[0](() => { }, mapped[1]);
    expect(called).toBe(true);
    expect(mapped[1]).toBeNull();
  });

  it("transforms with a complex mapping function", () => {
    let dispatched: any;
    const inner: Effect<{ x: number; y: number }> = [
      (dispatch) => dispatch({ x: 1, y: 2 }),
      null,
    ];
    const mapped = mapEffect(inner, (pt) => ({ sum: pt.x + pt.y }));

    mapped[0]((msg) => { dispatched = msg; }, mapped[1]);
    expect(dispatched).toEqual({ sum: 3 });
  });

  it("handles empty batched array", () => {
    let dispatched: any;
    const inner: Effect<number> = [(dispatch) => dispatch([]), null];
    const mapped = mapEffect(inner, (n: number) => n * 10);

    mapped[0]((msg) => { dispatched = msg; }, mapped[1]);
    expect(dispatched).toEqual([]);
  });

  it("handles single-element batched array", () => {
    let dispatched: any;
    const inner: Effect<number> = [(dispatch) => dispatch([5]), null];
    const mapped = mapEffect(inner, (n: number) => n * 10);

    mapped[0]((msg) => { dispatched = msg; }, mapped[1]);
    expect(dispatched).toEqual([50]);
  });
});

// ── mapSub() ──────────────────────────────────────────────────

describe("mapSub()", () => {
  it("transforms subscription message type", () => {
    let dispatched: string | undefined;
    const inner: Sub<number> = [
      (dispatch: Dispatch<number>, _props: any) => { dispatch(99); return () => { }; },
      {},
    ] as unknown as Sub<number>;
    const mapped = mapSub(inner, (n: number) => `sub:${n}`);
    const [runner, props] = mapped as unknown as [any, any];

    const cleanup = runner((msg: string) => { dispatched = msg; }, props);
    cleanup();

    expect(dispatched).toBe("sub:99");
  });

  it("passes through falsy subs", () => {
    expect(mapSub(false, () => "x")).toBe(false);
    expect(mapSub(null, () => "x")).toBe(null);
    expect(mapSub(undefined, () => "x")).toBe(undefined);
  });

  it("handles batched messages", () => {
    let dispatched: any;
    const inner: Sub<number> = [
      (dispatch: Dispatch<number>) => { dispatch([99, 100]); return () => { }; },
      {},
    ] as unknown as Sub<number>;
    const mapped = mapSub(inner, (n: number) => `sub:${n}`);
    const [runner, props] = mapped as unknown as [any, any];
    runner((msg: any) => { dispatched = msg; }, props);
    expect(dispatched).toEqual(["sub:99", "sub:100"]);
  });

  it("preserves subscription props", () => {
    let receivedProps: any;
    const inner: Sub<number> = [
      (dispatch: Dispatch<number>, props: any) => { receivedProps = props; dispatch(1); return () => { }; },
      { interval: 1000 },
    ] as unknown as Sub<number>;
    const mapped = mapSub(inner, (n: number) => n);
    const [runner, props] = mapped as unknown as [any, any];
    runner(() => { }, props);
    expect(receivedProps).toEqual({ interval: 1000 });
  });

  it("returns a working cleanup function", () => {
    let cleaned = false;
    const inner: Sub<number> = [
      (_dispatch: Dispatch<number>, _props: any) => () => { cleaned = true; },
      {},
    ] as unknown as Sub<number>;
    const mapped = mapSub(inner, (n: number) => n);
    const [runner, props] = mapped as unknown as [any, any];

    const cleanup = runner(() => { }, props);
    expect(cleaned).toBe(false);
    cleanup();
    expect(cleaned).toBe(true);
  });

  it("handles empty batched array", () => {
    let dispatched: any;
    const inner: Sub<number> = [
      (dispatch: Dispatch<number>) => { dispatch([]); return () => { }; },
      {},
    ] as unknown as Sub<number>;
    const mapped = mapSub(inner, (n: number) => n * 2);
    const [runner, props] = mapped as unknown as [any, any];
    runner((msg: any) => { dispatched = msg; }, props);
    expect(dispatched).toEqual([]);
  });
});

// ── mapDispatch() ─────────────────────────────────────────────

describe("mapDispatch()", () => {
  it("transforms dispatched messages", () => {
    const log: string[] = [];
    const parent = (msg: string | readonly string[]) => { log.push(msg as string); };
    const child = mapDispatch<number, string>(parent, (n) => `child:${n}`);

    child(1);
    child(2);

    expect(log).toEqual(["child:1", "child:2"]);
  });

  it("handles batched messages", () => {
    const log: any[] = [];
    const parent = (msg: any) => { log.push(msg); };
    const child = mapDispatch<number, string>(parent, (n) => `child:${n}`);

    child([1, 2]);
    expect(log).toEqual([["child:1", "child:2"]]);
  });

  it("handles empty batched array", () => {
    const log: any[] = [];
    const parent = (msg: any) => { log.push(msg); };
    const child = mapDispatch<number, string>(parent, (n) => `child:${n}`);

    child([]);
    expect(log).toEqual([[]]);
  });

  it("handles single-element batch", () => {
    const log: any[] = [];
    const parent = (msg: any) => { log.push(msg); };
    const child = mapDispatch<number, string>(parent, (n) => `child:${n}`);

    child([42]);
    expect(log).toEqual([["child:42"]]);
  });

  it("can be chained (grandchild → child → parent)", () => {
    const log: string[] = [];
    const parent = (msg: string | readonly string[]) => { log.push(msg as string); };
    const child = mapDispatch<number, string>(parent, (n) => `child:${n}`);
    const grandchild = mapDispatch<boolean, number>(child, (b) => b ? 1 : 0);

    grandchild(true);
    grandchild(false);

    expect(log).toEqual(["child:1", "child:0"]);
  });

  it("chained dispatch handles batches correctly", () => {
    const log: any[] = [];
    const parent = (msg: any) => { log.push(msg); };
    const child = mapDispatch<number, string>(parent, (n) => `c:${n}`);
    const grandchild = mapDispatch<boolean, number>(child, (b) => b ? 1 : 0);

    grandchild([true, false]);
    expect(log).toEqual([["c:1", "c:0"]]);
  });
});

// ── batchSubs() ───────────────────────────────────────────────

describe("batchSubs()", () => {
  it("flattens and filters subscriptions", () => {
    const sub1: Sub<string> = [() => () => { }, {}] as unknown as Sub<string>;
    const sub2: Sub<string> = [() => () => { }, {}] as unknown as Sub<string>;

    const result = batchSubs(sub1, false, [sub2, null, undefined]);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(sub1);
    expect(result[1]).toBe(sub2);
  });

  it("handles empty input", () => {
    expect(batchSubs()).toEqual([]);
  });

  it("handles all falsy values", () => {
    const result = batchSubs(false, null, undefined);
    expect(result).toEqual([]);
  });

  it("handles single sub passed directly", () => {
    const sub: Sub<string> = [() => () => { }, {}] as unknown as Sub<string>;
    const result = batchSubs(sub);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(sub);
  });

  it("handles nested array of subs", () => {
    const sub1: Sub<string> = [() => () => { }, {}] as unknown as Sub<string>;
    const sub2: Sub<string> = [() => () => { }, {}] as unknown as Sub<string>;
    const sub3: Sub<string> = [() => () => { }, {}] as unknown as Sub<string>;

    const result = batchSubs([sub1, sub2], sub3);
    expect(result).toHaveLength(3);
    expect(result[0]).toBe(sub1);
    expect(result[1]).toBe(sub2);
    expect(result[2]).toBe(sub3);
  });

  it("filters falsy values from nested arrays", () => {
    const sub1: Sub<string> = [() => () => { }, {}] as unknown as Sub<string>;
    const result = batchSubs([sub1, false, null, undefined]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(sub1);
  });

  it("returns a new array (no mutation)", () => {
    const sub1: Sub<string> = [() => () => { }, {}] as unknown as Sub<string>;
    const input = [sub1];
    const result = batchSubs(input);
    expect(result).not.toBe(input);
    expect(result).toEqual(input);
  });
});
