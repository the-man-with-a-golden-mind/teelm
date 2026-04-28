import { describe, it, expect } from "bun:test";
import { Maybe, Result, pipe, brand, type Opaque } from "../src/functional";

describe("functional utilities", () => {
  describe("Maybe", () => {
    it("just and nothing", () => {
      expect(Maybe.just(42).tag).toBe("Just");
      expect(Maybe.nothing().tag).toBe("Nothing");
    });

    it("map", () => {
      const m = Maybe.just(21);
      const mapped = Maybe.map(m, (x) => x * 2);
      expect(mapped.tag).toBe("Just");
      if (mapped.tag === "Just") expect(mapped.value).toBe(42);

      expect(Maybe.map(Maybe.nothing(), (x: number) => x * 2).tag).toBe("Nothing");
    });

    it("withDefault", () => {
      expect(Maybe.withDefault(Maybe.just(42), 0)).toBe(42);
      expect(Maybe.withDefault(Maybe.nothing(), 0)).toBe(0);
    });

    it("fromNullable", () => {
      expect(Maybe.fromNullable(42).tag).toBe("Just");
      expect(Maybe.fromNullable(null).tag).toBe("Nothing");
      expect(Maybe.fromNullable(undefined).tag).toBe("Nothing");
    });
  });

  describe("Result", () => {
    it("ok and err", () => {
      expect(Result.ok(42).tag).toBe("Ok");
      expect(Result.err("fail").tag).toBe("Err");
    });

    it("map", () => {
      const r = Result.ok(21);
      const mapped = Result.map(r, (x) => x * 2);
      expect(mapped.tag).toBe("Ok");
      if (mapped.tag === "Ok") expect(mapped.value).toBe(42);

      const err = Result.err("fail");
      expect(Result.map(err, (x: number) => x * 2).tag).toBe("Err");
    });
  });

  describe("pipe", () => {
    it("pipes values through functions", () => {
      const add1 = (x: number) => x + 1;
      const double = (x: number) => x * 2;
      const result = pipe(10, add1, double);
      expect(result).toBe(22);
    });
  });

  describe("Opaque", () => {
    it("brands values", () => {
      type UserId = Opaque<string, "UserId">;
      const id = brand<string, "UserId">("user_123");
      expect(id as string).toBe("user_123");
      // This is mostly a type-level feature, but we check if it compiles and runs.
    });
  });
});
