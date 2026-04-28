import { describe, expect, test } from "bun:test";
import { Task } from "../src/task";
import { Result } from "../src/functional";
import { createDispatchSpy, runEffect } from "../src/testing";

describe("Task", () => {
  describe("succeed / fail", () => {
    test("succeed produces Ok", async () => {
      const r = await Task.succeed(42)();
      expect(r).toEqual({ tag: "Ok", value: 42 });
    });

    test("fail produces Err", async () => {
      const r = await Task.fail("nope")();
      expect(r).toEqual({ tag: "Err", error: "nope" });
    });
  });

  describe("fromTry", () => {
    test("captures successful return", async () => {
      const r = await Task.fromTry(() => 7, () => "err")();
      expect(r).toEqual({ tag: "Ok", value: 7 });
    });

    test("captures thrown error via onError", async () => {
      const r = await Task.fromTry<string, number>(
        () => { throw new Error("boom"); },
        (e) => (e as Error).message,
      )();
      expect(r).toEqual({ tag: "Err", error: "boom" });
    });
  });

  describe("fromPromise", () => {
    test("resolved promise becomes Ok", async () => {
      const r = await Task.fromPromise(() => Promise.resolve("hi"), () => "err")();
      expect(r).toEqual({ tag: "Ok", value: "hi" });
    });

    test("rejected promise becomes Err via onError", async () => {
      const r = await Task.fromPromise<string, string>(
        () => Promise.reject(new Error("nope")),
        (e) => (e as Error).message,
      )();
      expect(r).toEqual({ tag: "Err", error: "nope" });
    });
  });

  describe("map / mapError", () => {
    test("map transforms Ok value", async () => {
      const r = await Task.map(Task.succeed(5), (n) => n * 2)();
      expect(r).toEqual({ tag: "Ok", value: 10 });
    });

    test("map leaves Err untouched", async () => {
      const r = await Task.map(Task.fail<string, number>("e"), (n) => n * 2)();
      expect(r).toEqual({ tag: "Err", error: "e" });
    });

    test("mapError transforms Err", async () => {
      const r = await Task.mapError(Task.fail<string, number>("e"), (s) => s.toUpperCase())();
      expect(r).toEqual({ tag: "Err", error: "E" });
    });
  });

  describe("andThen", () => {
    test("chains successful tasks", async () => {
      const r = await Task.andThen(Task.succeed(2), (n) => Task.succeed(n + 1))();
      expect(r).toEqual({ tag: "Ok", value: 3 });
    });

    test("short-circuits on first Err", async () => {
      let called = false;
      const r = await Task.andThen(
        Task.fail<string, number>("nope"),
        (n) => {
          called = true;
          return Task.succeed(n + 1);
        },
      )();
      expect(r).toEqual({ tag: "Err", error: "nope" });
      expect(called).toBe(false);
    });
  });

  describe("onError", () => {
    test("recovers from failure", async () => {
      const r = await Task.onError(Task.fail<string, number>("e"), () => Task.succeed(99))();
      expect(r).toEqual({ tag: "Ok", value: 99 });
    });

    test("does not run recover when ok", async () => {
      let called = false;
      const r = await Task.onError(Task.succeed(1), () => {
        called = true;
        return Task.succeed(2);
      })();
      expect(r).toEqual({ tag: "Ok", value: 1 });
      expect(called).toBe(false);
    });
  });

  describe("sequence / all", () => {
    test("sequence runs in order, short-circuits", async () => {
      const order: number[] = [];
      const t = (n: number) => Task.fromTry<string, number>(
        () => {
          order.push(n);
          return n;
        },
        () => "err",
      );
      const r = await Task.sequence([t(1), t(2), t(3)])();
      expect(r).toEqual({ tag: "Ok", value: [1, 2, 3] });
      expect(order).toEqual([1, 2, 3]);
    });

    test("sequence short-circuits on first Err", async () => {
      const r = await Task.sequence<string, number>([
        Task.succeed(1),
        Task.fail("boom"),
        Task.succeed(3),
      ])();
      expect(r).toEqual({ tag: "Err", error: "boom" });
    });

    test("all collects values in parallel", async () => {
      const r = await Task.all([Task.succeed(1), Task.succeed(2), Task.succeed(3)])();
      expect(r).toEqual({ tag: "Ok", value: [1, 2, 3] });
    });

    test("all returns first Err", async () => {
      const r = await Task.all<string, number>([
        Task.succeed(1),
        Task.fail("boom"),
        Task.succeed(3),
      ])();
      expect(r).toEqual({ tag: "Err", error: "boom" });
    });
  });

  describe("attempt / perform (Effect integration)", () => {
    test("attempt dispatches Result on success", async () => {
      const spy = createDispatchSpy<{ tag: "Got"; r: Result<number, string> }>();
      const fx = Task.attempt(Task.succeed(7), (r) => ({ tag: "Got" as const, r }));
      runEffect(fx, spy.dispatch);
      await new Promise((r) => setTimeout(r, 0));
      expect(spy.messages).toEqual([{ tag: "Got", r: { tag: "Ok", value: 7 } }]);
    });

    test("attempt dispatches Result on failure", async () => {
      const spy = createDispatchSpy<{ tag: "Got"; r: Result<number, string> }>();
      const fx = Task.attempt(
        Task.fail<string, number>("nope"),
        (r) => ({ tag: "Got" as const, r }),
      );
      runEffect(fx, spy.dispatch);
      await new Promise((r) => setTimeout(r, 0));
      expect(spy.messages).toEqual([{ tag: "Got", r: { tag: "Err", error: "nope" } }]);
    });

    test("perform dispatches the value directly", async () => {
      const spy = createDispatchSpy<{ tag: "Got"; v: number }>();
      const fx = Task.perform(Task.succeed<number, never>(99), (v) => ({ tag: "Got" as const, v }));
      runEffect(fx, spy.dispatch);
      await new Promise((r) => setTimeout(r, 0));
      expect(spy.messages).toEqual([{ tag: "Got", v: 99 }]);
    });
  });
});
