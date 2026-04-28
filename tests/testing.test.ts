import { describe, expect, it } from "bun:test";
import { createDispatchSpy, getEffects, getModel, hasEffects, runEffect } from "../src/testing";
import { noFx, withFx as withFxHelper, type Cmd, type Effect } from "../src/teelm";

describe("testing helpers", () => {
  it("unwraps tuple update results", () => {
    const effect: Effect<string, { ok: boolean }> = [() => {}, { ok: true }];
    const plain = noFx({ n: 1 });
    const fxResult = withFxHelper<{ n: number }, string>({ n: 2 }, effect);

    expect(getModel(plain)).toEqual({ n: 1 });
    expect(getEffects(plain) as readonly Effect<never>[]).toEqual([]);
    expect(hasEffects(plain)).toBe(false);

    expect(getModel(fxResult)).toEqual({ n: 2 });
    expect(getEffects(fxResult) as readonly Effect<string>[]).toEqual([effect]);
    expect(hasEffects(fxResult)).toBe(true);
  });

  it("records dispatched messages including batches", () => {
    const spy = createDispatchSpy<string>();

    spy.dispatch("a");
    spy.dispatch(["b", "c"]);

    expect(spy.messages).toEqual(["a", "b", "c"]);
    expect(spy.last()).toBe("c");

    spy.clear();
    expect(spy.messages).toEqual([]);
  });

  it("runs an effect with its typed props", () => {
    let value = "";
    const effect: Effect<string, { name: string }> = [
      (dispatch, props) => dispatch(props.name),
      { name: "ok" },
    ];

    runEffect(effect, (msg) => {
      value = msg as string;
    });

    expect(value).toBe("ok");
  });
});
