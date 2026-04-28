import { describe, expect, test } from "bun:test";
import {
  Decode,
  HttpError,
  Maybe,
  Path,
  Result,
  Url,
  brand,
  type Opaque,
} from "../src/functional";

describe("Decode", () => {
  test("primitives accept matching values, reject mismatched", () => {
    expect(Decode.string("a")).toEqual({ tag: "Ok", value: "a" });
    expect(Decode.string(1).tag).toBe("Err");
    expect(Decode.number(1)).toEqual({ tag: "Ok", value: 1 });
    expect(Decode.number(NaN).tag).toBe("Err");
    expect(Decode.boolean(true)).toEqual({ tag: "Ok", value: true });
    expect(Decode.boolean(0).tag).toBe("Err");
    expect(Decode.null(null)).toEqual({ tag: "Ok", value: null });
    expect(Decode.null(undefined).tag).toBe("Err");
    expect(Decode.unknown({ a: 1 })).toEqual({ tag: "Ok", value: { a: 1 } });
  });

  test("array decoder validates each element", () => {
    expect(Decode.array(Decode.number)([1, 2, 3])).toEqual({
      tag: "Ok",
      value: [1, 2, 3],
    });
    const err = Decode.array(Decode.number)([1, "x", 3]);
    expect(err.tag).toBe("Err");
    if (err.tag === "Err") expect(err.error).toContain("[1]");
  });

  test("array rejects non-array input", () => {
    const r = Decode.array(Decode.number)("nope" as unknown);
    expect(r.tag).toBe("Err");
  });

  test("field decoder reaches into objects", () => {
    const d = Decode.field("name", Decode.string);
    expect(d({ name: "Ada" })).toEqual({ tag: "Ok", value: "Ada" });
    expect(d({ other: "x" }).tag).toBe("Err");
    expect(d({ name: 1 }).tag).toBe("Err");
    expect(d("not an object" as unknown).tag).toBe("Err");
  });

  test("optional decoder treats null/undefined as Ok(undefined)", () => {
    const d = Decode.optional(Decode.string);
    expect(d(null)).toEqual({ tag: "Ok", value: undefined });
    expect(d(undefined)).toEqual({ tag: "Ok", value: undefined });
    expect(d("x")).toEqual({ tag: "Ok", value: "x" });
    expect(d(1).tag).toBe("Err");
  });

  test("oneOf returns first matching decoder", () => {
    const d = Decode.oneOf<string | number>(
      Decode.string,
      Decode.map(Decode.number, (n) => String(n)),
    );
    expect(d("hi")).toEqual({ tag: "Ok", value: "hi" });
    expect(d(42)).toEqual({ tag: "Ok", value: "42" });
    expect(d(true).tag).toBe("Err");
  });

  test("object decoder builds typed result", () => {
    interface User {
      id: number;
      name: string;
    }
    const d = Decode.object<User>({
      id: Decode.number,
      name: Decode.string,
    });
    expect(d({ id: 1, name: "Ada" })).toEqual({
      tag: "Ok",
      value: { id: 1, name: "Ada" },
    });
    expect(d({ id: "x", name: "Ada" }).tag).toBe("Err");
  });

  test("map / andThen compose decoders", () => {
    const positive = Decode.andThen(Decode.number, (n) =>
      n >= 0
        ? () => Result.ok<number, string>(n)
        : () => Result.err<string, number>("negative"),
    );
    expect(positive(5)).toEqual({ tag: "Ok", value: 5 });
    expect(positive(-1)).toEqual({ tag: "Err", error: "negative" });
  });

  test("fromJsonString parses then decodes", () => {
    const parse = Decode.fromJsonString(Decode.array(Decode.number));
    expect(parse("[1,2,3]")).toEqual({ tag: "Ok", value: [1, 2, 3] });
    expect(parse("not json").tag).toBe("Err");
    expect(parse('"oops"').tag).toBe("Err");
  });
});

describe("HttpError", () => {
  test("constructors produce expected tags", () => {
    expect(HttpError.badUrl("/x")).toEqual({ tag: "BadUrl", url: "/x" });
    expect(HttpError.timeout()).toEqual({ tag: "Timeout" });
    expect(HttpError.networkError("DNS")).toEqual({
      tag: "NetworkError",
      message: "DNS",
    });
    expect(HttpError.badStatus(404, "Not Found", "body")).toEqual({
      tag: "BadStatus",
      status: 404,
      statusText: "Not Found",
      body: "body",
    });
    expect(HttpError.badBody("parse", "raw")).toEqual({
      tag: "BadBody",
      reason: "parse",
      body: "raw",
    });
  });

  test("toString renders each variant", () => {
    expect(HttpError.toString(HttpError.badUrl("u"))).toBe("BadUrl: u");
    expect(HttpError.toString(HttpError.timeout())).toBe("Timeout");
    expect(HttpError.toString(HttpError.networkError("m"))).toBe("NetworkError: m");
    expect(HttpError.toString(HttpError.badStatus(500, "Internal", ""))).toContain("500");
    expect(HttpError.toString(HttpError.badBody("oops", ""))).toContain("oops");
  });
});

describe("Url / Path / RouteName brands", () => {
  test("Url.parse accepts absolute URLs, rejects garbage", () => {
    const ok = Url.parse("https://example.com/x");
    expect(ok.tag).toBe("Just");
    if (ok.tag === "Just") expect(Url.toString(ok.value)).toBe("https://example.com/x");

    expect(Url.parse("not a url").tag).toBe("Nothing");
  });

  test("Url.isAbsolute distinguishes absolute and relative", () => {
    expect(Url.isAbsolute("https://example.com")).toBe(true);
    expect(Url.isAbsolute("/path")).toBe(false);
    expect(Url.isAbsolute("path")).toBe(false);
  });

  test("Path.parse normalizes leading slash; rejects empty", () => {
    expect(Path.parse("").tag).toBe("Nothing");
    const a = Path.parse("a/b");
    expect(a.tag).toBe("Just");
    if (a.tag === "Just") expect(Path.toString(a.value)).toBe("/a/b");
    const b = Path.parse("/a/b");
    if (b.tag === "Just") expect(Path.toString(b.value)).toBe("/a/b");
  });

  test("brand round-trips through its alias", () => {
    type Email = Opaque<string, "Email">;
    const e: Email = brand<string, "Email">("a@b.com");
    expect(e as string).toBe("a@b.com");
  });
});

describe("Maybe + Result regression", () => {
  test("Result.toMaybe maps Ok→Just and Err→Nothing", () => {
    expect(Result.toMaybe(Result.ok(1))).toEqual(Maybe.just(1));
    expect(Result.toMaybe(Result.err("e"))).toEqual(Maybe.nothing());
  });
});
