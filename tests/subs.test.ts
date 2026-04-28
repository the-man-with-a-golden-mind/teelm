import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { interval, onKeyDown, onKeyUp, onResize, onUrlChange, onEvent } from "../src/subs";
import type { Dispatch, Sub } from "../src/teelm";

describe("interval()", () => {
  it("fires callback at interval", async () => {
    const msgs: number[] = [];
    const dispatch: Dispatch<number> = (n) => { msgs.push(n as number); };
    const sub = interval<number>(50, 42);
    const [runner, props] = sub as unknown as [any, any];
    const cleanup = runner(dispatch, props);

    await new Promise((r) => setTimeout(r, 130));
    cleanup();

    expect(msgs.length).toBeGreaterThanOrEqual(2);
    expect(msgs[0]).toBe(42);
  });

  it("supports factory function", async () => {
    const msgs: number[] = [];
    const dispatch: Dispatch<number> = (n) => { msgs.push(n as number); };
    const sub = interval<number>(50, (now) => now);
    const [runner, props] = sub as unknown as [any, any];
    const cleanup = runner(dispatch, props);

    await new Promise((r) => setTimeout(r, 80));
    cleanup();

    expect(msgs.length).toBeGreaterThanOrEqual(1);
    expect(typeof msgs[0]).toBe("number");
  });

  it("stops on cleanup", async () => {
    const msgs: number[] = [];
    const dispatch: Dispatch<number> = (n) => { msgs.push(n as number); };
    const sub = interval<number>(30, 1);
    const [runner, props] = sub as unknown as [any, any];
    const cleanup = runner(dispatch, props);
    cleanup();

    await new Promise((r) => setTimeout(r, 80));
    expect(msgs).toHaveLength(0);
  });
});

describe("onKeyDown()", () => {
  it("creates subscription tuple", () => {
    const sub = onKeyDown<string>((key) => key);
    expect(sub).toHaveLength(2);
    expect(typeof (sub as any)[0]).toBe("function");
  });

  it("dispatches on keydown event", () => {
    let received: string | undefined;
    const [runner, props] = onKeyDown<string>((key) => key) as unknown as [any, any];
    const cleanup = runner((msg: string) => { received = msg; }, props);

    dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    cleanup();

    expect(received).toBe("Enter");
  });
});

describe("onKeyUp()", () => {
  it("dispatches on keyup event", () => {
    let received: string | undefined;
    const [runner, props] = onKeyUp<string>((key) => key) as unknown as [any, any];
    const cleanup = runner((msg: string) => { received = msg; }, props);

    dispatchEvent(new KeyboardEvent("keyup", { key: "Escape" }));
    cleanup();

    expect(received).toBe("Escape");
  });
});

describe("onEvent()", () => {
  it("listens to custom event on target", () => {
    let received = false;
    const target = new EventTarget();
    const [runner, props] = onEvent<boolean>("custom", () => true, target) as unknown as [any, any];
    const cleanup = runner((msg: boolean) => { received = msg; }, props);

    target.dispatchEvent(new Event("custom"));
    cleanup();

    expect(received).toBe(true);
  });

  it("cleans up listener", () => {
    let count = 0;
    const target = new EventTarget();
    const [runner, props] = onEvent<void>("ev", () => undefined, target) as unknown as [any, any];
    const cleanup = runner(() => { count++; }, props);

    target.dispatchEvent(new Event("ev"));
    cleanup();
    target.dispatchEvent(new Event("ev"));

    expect(count).toBe(1);
  });
});

describe("onUrlChange()", () => {
  it("creates valid subscription", () => {
    const sub = onUrlChange<string>((url) => url.pathname);
    expect(sub).toHaveLength(2);
  });
});
