import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { delay, compactEffects, navigate, log, storageSet, storageGet, dispatchMsg, http } from "../src/fx";
import type { Dispatch, Effect } from "../src/teelm";
import { Decode, Result, type HttpError } from "../src/functional";

describe("delay()", () => {
  it("dispatches message after timeout", async () => {
    type Msg = { tag: "Done" };
    let received: Msg | undefined;
    const dispatch: Dispatch<Msg> = (msg) => { received = msg as Msg; };
    const [runner, props] = delay<Msg>(50, { tag: "Done" });

    runner(dispatch, props);
    expect(received).toBeUndefined();

    await new Promise((r) => setTimeout(r, 100));
    expect(received).toEqual({ tag: "Done" });
  });
});

describe("compactEffects()", () => {
  it("filters falsy effects", () => {
    const fx1: Effect<string> = [() => {}, null];
    const fx2: Effect<string> = [() => {}, null];
    const result = compactEffects(fx1, null, false, undefined, fx2);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(fx1);
    expect(result[1]).toBe(fx2);
  });

  it("returns empty array for all falsy", () => {
    expect(compactEffects(null, false, undefined)).toEqual([]);
  });
});

describe("navigate()", () => {
  it("creates pushState effect", () => {
    const [runner, props] = navigate<string>("/test");
    expect(props).toEqual({ url: "/test", replace: false });
  });

  it("creates replaceState effect", () => {
    const [_, props] = navigate<string>("/test", true);
    expect(props).toEqual({ url: "/test", replace: true });
  });
});

describe("dispatchMsg()", () => {
  it("dispatches message immediately", () => {
    let received: string | undefined;
    const [runner, props] = dispatchMsg("hello");
    runner((msg) => { received = msg as string; }, props);
    expect(received).toBe("hello");
  });
});

describe("storageSet/Get", () => {
  beforeEach(() => localStorage.clear());

  it("sets and gets localStorage values", () => {
    const [setRunner, setProps] = storageSet<string>("key", JSON.stringify("value"));
    setRunner(() => {}, setProps);
    expect(localStorage.getItem("key")).toBe(JSON.stringify("value"));

    let result: Result<string | undefined, unknown> | undefined;
    const [getRunner, getProps] = storageGet<string, Result<string | undefined, unknown>>({
      key: "key",
      decoder: Decode.string,
      toMsg: (r) => r,
    });
    getRunner((v) => { result = v as Result<string | undefined, unknown>; }, getProps);
    expect(result?.tag).toBe("Ok");
    if (result?.tag === "Ok") expect(result.value).toBe("value");
  });

  it("storageGet reports decode error", () => {
    localStorage.setItem("k", JSON.stringify(123));
    let result: Result<string | undefined, unknown> | undefined;
    const [runner, props] = storageGet<string, Result<string | undefined, unknown>>({
      key: "k",
      decoder: Decode.string,
      toMsg: (r) => r,
    });
    runner((v) => { result = v as Result<string | undefined, unknown>; }, props);
    expect(result?.tag).toBe("Err");
  });

  it("storageGet returns Ok(undefined) for missing key", () => {
    let result: Result<string | undefined, unknown> | undefined;
    const [runner, props] = storageGet<string, Result<string | undefined, unknown>>({
      key: "missing",
      decoder: Decode.string,
      toMsg: (r) => r,
    });
    runner((v) => { result = v as Result<string | undefined, unknown>; }, props);
    expect(result?.tag).toBe("Ok");
    if (result?.tag === "Ok") expect(result.value).toBeUndefined();
  });

  it("storageSet dispatches success when toMsg provided", () => {
    let result: Result<undefined, unknown> | undefined;
    const [runner, props] = storageSet<Result<undefined, unknown>>(
      "ok",
      "v",
      (r) => r,
    );
    runner((v) => { result = v as Result<undefined, unknown>; }, props);
    expect(result?.tag).toBe("Ok");
  });
});

describe("http()", () => {
  it("creates effect with correct structure", () => {
    const effect = http<unknown, string>({
      url: "https://example.com",
      decoder: Decode.unknown,
      toMsg: (result) => result.tag === "Ok" ? `ok:${String(result.value)}` : `err:${result.error.tag}`,
    });

    expect(effect).toHaveLength(2);
    expect(typeof effect[0]).toBe("function");
    expect(effect[1].url).toBe("https://example.com");
    expect(effect[1].expect).toBe("json");
  });

  it("dispatches BadUrl for empty URL before fetch", () => {
    let received: string | undefined;
    const [runner, props] = http<unknown, string>({
      url: "",
      decoder: Decode.unknown,
      toMsg: (result) =>
        result.tag === "Ok"
          ? "ok"
          : `err:${result.error.tag}`,
    });

    runner((msg) => { received = msg as string; }, props);
    expect(received).toBe("err:BadUrl");
  });
});

describe("log()", () => {
  it("creates log effect", () => {
    const [runner, args] = log<never>("hello", 42);
    expect(args).toEqual(["hello", 42]);
  });
});
