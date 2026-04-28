// Teelm — Task<E,T> (Elm-inspired)
// A Task is a description of an async operation that may succeed with T
// or fail with E. Tasks compose via map/andThen/mapError and are turned
// into a Cmd<Msg> via Task.attempt / Task.perform.

import type { Effect } from "./teelm";
import { Result } from "./functional";

// A Task is a function: () => Promise<Result<T, E>>.
// Wrapping in a thunk keeps tasks lazy — defining a task does not start it.
export type Task<E, T> = () => Promise<Result<T, E>>;

export const Task = {
  succeed<T, E = never>(value: T): Task<E, T> {
    return () => Promise.resolve(Result.ok(value));
  },

  fail<E, T = never>(error: E): Task<E, T> {
    return () => Promise.resolve(Result.err(error));
  },

  /** Run a thunk that may throw; capture the error via `onError`. */
  fromTry<E, T>(fn: () => T, onError: (err: unknown) => E): Task<E, T> {
    return async () => {
      try {
        return Result.ok(fn());
      } catch (e) {
        return Result.err(onError(e));
      }
    };
  },

  /** Wrap a Promise. Resolved values become Ok; rejections become Err via onError. */
  fromPromise<E, T>(
    create: () => Promise<T>,
    onError: (err: unknown) => E,
  ): Task<E, T> {
    return async () => {
      try {
        return Result.ok(await create());
      } catch (e) {
        return Result.err(onError(e));
      }
    };
  },

  /** Wrap a Promise<Result<T,E>>. */
  fromPromiseResult<E, T>(create: () => Promise<Result<T, E>>): Task<E, T> {
    return create;
  },

  map<E, T, U>(task: Task<E, T>, fn: (t: T) => U): Task<E, U> {
    return async () => {
      const r = await task();
      return Result.map(r, fn);
    };
  },

  mapError<E, F, T>(task: Task<E, T>, fn: (e: E) => F): Task<F, T> {
    return async () => {
      const r = await task();
      return Result.mapError(r, fn);
    };
  },

  andThen<E, T, U>(task: Task<E, T>, fn: (t: T) => Task<E, U>): Task<E, U> {
    return async () => {
      const r = await task();
      if (r.tag === "Err") return r;
      return fn(r.value)();
    };
  },

  /** If the task fails, run `recover` to produce a new task. */
  onError<E, F, T>(task: Task<E, T>, recover: (e: E) => Task<F, T>): Task<F, T> {
    return async () => {
      const r = await task();
      if (r.tag === "Ok") return r;
      return recover(r.error)();
    };
  },

  /** Run tasks in sequence; short-circuits on the first Err. */
  sequence<E, T>(tasks: readonly Task<E, T>[]): Task<E, T[]> {
    return async () => {
      const out: T[] = [];
      for (const t of tasks) {
        const r = await t();
        if (r.tag === "Err") return r;
        out.push(r.value);
      }
      return Result.ok(out);
    };
  },

  /** Run tasks in parallel; short-circuits on the first Err. */
  all<E, T>(tasks: readonly Task<E, T>[]): Task<E, T[]> {
    return async () => {
      const results = await Promise.all(tasks.map((t) => t()));
      const out: T[] = [];
      for (const r of results) {
        if (r.tag === "Err") return r;
        out.push(r.value);
      }
      return Result.ok(out);
    };
  },

  /** Turn a Task into an Effect that always dispatches. */
  attempt<E, T, Msg>(
    task: Task<E, T>,
    toMsg: (result: Result<T, E>) => Msg,
  ): Effect<Msg, { task: Task<E, T>; toMsg: (r: Result<T, E>) => Msg }> {
    return [taskAttemptFx, { task, toMsg }] as const;
  },

  /** Convenience: like attempt, but assumes the task cannot fail (E = never). */
  perform<T, Msg>(
    task: Task<never, T>,
    toMsg: (value: T) => Msg,
  ): Effect<Msg, { task: Task<never, T>; toMsg: (v: T) => Msg }> {
    return [taskPerformFx, { task, toMsg }] as const;
  },
};

function taskAttemptFx<E, T, Msg>(
  dispatch: (msg: Msg) => void,
  props: { task: Task<E, T>; toMsg: (r: Result<T, E>) => Msg },
): void {
  void props.task().then((r) => dispatch(props.toMsg(r)));
}

function taskPerformFx<T, Msg>(
  dispatch: (msg: Msg) => void,
  props: { task: Task<never, T>; toMsg: (v: T) => Msg },
): void {
  void props.task().then((r) => {
    if (r.tag === "Ok") dispatch(props.toMsg(r.value));
    // Ok, E=never means Err can never happen at runtime. Drop silently if it does.
  });
}
