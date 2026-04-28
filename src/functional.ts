// Teelm — Functional Utilities (Elm-inspired)

// ── Maybe ─────────────────────────────────────────────────────

export type Maybe<T> = Just<T> | Nothing;

interface Just<T> {
  readonly tag: "Just";
  readonly value: T;
}

interface Nothing {
  readonly tag: "Nothing";
}

export const Maybe = {
  just: <T>(value: T): Maybe<T> => ({ tag: "Just", value }),
  nothing: (): Maybe<never> => ({ tag: "Nothing" }),
  map: <T, U>(maybe: Maybe<T>, fn: (t: T) => U): Maybe<U> =>
    maybe.tag === "Just" ? Maybe.just(fn(maybe.value)) : Maybe.nothing(),
  andThen: <T, U>(maybe: Maybe<T>, fn: (t: T) => Maybe<U>): Maybe<U> =>
    maybe.tag === "Just" ? fn(maybe.value) : Maybe.nothing(),
  withDefault: <T>(maybe: Maybe<T>, defaultValue: T): T =>
    maybe.tag === "Just" ? maybe.value : defaultValue,
  fromNullable: <T>(val: T | null | undefined): Maybe<T> =>
    val == null ? Maybe.nothing() : Maybe.just(val),
};

// ── Result ─────────────────────────────────────────────────────

export type Result<T, E> = Ok<T> | Err<E>;

interface Ok<T> {
  readonly tag: "Ok";
  readonly value: T;
}

interface Err<E> {
  readonly tag: "Err";
  readonly error: E;
}

export const Result = {
  ok: <T, E = never>(value: T): Result<T, E> => ({ tag: "Ok", value }),
  err: <E, T = never>(error: E): Result<T, E> => ({ tag: "Err", error }),
  map: <T, E, U>(result: Result<T, E>, fn: (t: T) => U): Result<U, E> =>
    result.tag === "Ok" ? Result.ok(fn(result.value)) : Result.err(result.error),
  mapError: <T, E, F>(result: Result<T, E>, fn: (e: E) => F): Result<T, F> =>
    result.tag === "Err" ? Result.err(fn(result.error)) : Result.ok(result.value),
  andThen: <T, E, U>(result: Result<T, E>, fn: (t: T) => Result<U, E>): Result<U, E> =>
    result.tag === "Ok" ? fn(result.value) : Result.err(result.error),
  withDefault: <T, E>(result: Result<T, E>, defaultValue: T): T =>
    result.tag === "Ok" ? result.value : defaultValue,
  toMaybe: <T, E>(result: Result<T, E>): Maybe<T> =>
    result.tag === "Ok" ? Maybe.just(result.value) : Maybe.nothing(),
};

// ── Pipeline ───────────────────────────────────────────────────

export function pipe<T, A>(x: T, f1: (x: T) => A): A;
export function pipe<T, A, B>(x: T, f1: (x: T) => A, f2: (x: A) => B): B;
export function pipe<T, A, B, C>(x: T, f1: (x: T) => A, f2: (x: A) => B, f3: (x: B) => C): C;
export function pipe<T, A, B, C, D>(x: T, f1: (x: T) => A, f2: (x: A) => B, f3: (x: B) => C, f4: (x: C) => D): D;
export function pipe(x: unknown, ...fns: Array<(v: unknown) => unknown>): unknown {
  return fns.reduce((v, f) => f(v), x);
}

// ── Opaque / Branded Types ─────────────────────────────────────

declare const __brand: unique symbol;
export type Opaque<T, K extends string> = T & { readonly [__brand]: K };

export function brand<T, K extends string>(val: T): Opaque<T, K> {
  return val as Opaque<T, K>;
}

// ── Branded URL/Path/RouteName ─────────────────────────────────
// These prevent passing raw strings into routing/URL APIs without
// going through validation or a typed constructor.

export type Url = Opaque<string, "Url">;
export type Path = Opaque<string, "Path">;
export type RouteName = Opaque<string, "RouteName">;

const URL_RE = /^(?:[a-zA-Z][a-zA-Z0-9+.-]*:)?\/\//;

export const Url = {
  /** Parse an absolute URL string. Returns Nothing if invalid. */
  parse: (raw: string): Maybe<Url> => {
    try {
      // Throws on invalid URL
      new URL(raw);
      return Maybe.just(raw as Url);
    } catch {
      return Maybe.nothing();
    }
  },
  /** Best-effort cast — only use when source is provably a URL. */
  fromString: (raw: string): Url => raw as Url,
  toString: (u: Url): string => u as string,
  isAbsolute: (raw: string): boolean => URL_RE.test(raw),
};

export const Path = {
  /** Build a Path from a relative or absolute path string. */
  parse: (raw: string): Maybe<Path> => {
    if (typeof raw !== "string" || raw.length === 0) return Maybe.nothing();
    return Maybe.just((raw.startsWith("/") ? raw : "/" + raw) as Path);
  },
  fromString: (raw: string): Path => (raw.startsWith("/") ? raw : "/" + raw) as Path,
  toString: (p: Path): string => p as string,
};

export const RouteName = {
  fromString: (raw: string): RouteName => raw as RouteName,
  toString: (n: RouteName): string => n as string,
};

// ── HTTP error model (mirrors Elm's Http.Error) ────────────────

export type HttpError =
  | { readonly tag: "BadUrl"; readonly url: string }
  | { readonly tag: "Timeout" }
  | { readonly tag: "NetworkError"; readonly message: string }
  | { readonly tag: "BadStatus"; readonly status: number; readonly statusText: string; readonly body: string }
  | { readonly tag: "BadBody"; readonly reason: string; readonly body: string };

export const HttpError = {
  badUrl: (url: string): HttpError => ({ tag: "BadUrl", url }),
  timeout: (): HttpError => ({ tag: "Timeout" }),
  networkError: (message: string): HttpError => ({ tag: "NetworkError", message }),
  badStatus: (status: number, statusText: string, body: string): HttpError =>
    ({ tag: "BadStatus", status, statusText, body }),
  badBody: (reason: string, body: string): HttpError => ({ tag: "BadBody", reason, body }),
  toString: (e: HttpError): string => {
    switch (e.tag) {
      case "BadUrl": return `BadUrl: ${e.url}`;
      case "Timeout": return "Timeout";
      case "NetworkError": return `NetworkError: ${e.message}`;
      case "BadStatus": return `BadStatus ${e.status} ${e.statusText}`;
      case "BadBody": return `BadBody: ${e.reason}`;
    }
  },
};

// ── Decoder ────────────────────────────────────────────────────
// Lightweight decoders for runtime values. Used by http() and storageGet()
// to validate untrusted JSON / strings without leaking `any` into the model.

export type Decoder<T> = (raw: unknown) => Result<T, string>;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export const Decode = {
  string: ((raw) =>
    typeof raw === "string"
      ? Result.ok(raw)
      : Result.err(`expected string, got ${typeof raw}`)) as Decoder<string>,

  number: ((raw) =>
    typeof raw === "number" && Number.isFinite(raw)
      ? Result.ok(raw)
      : Result.err(`expected finite number, got ${typeof raw}`)) as Decoder<number>,

  boolean: ((raw) =>
    typeof raw === "boolean"
      ? Result.ok(raw)
      : Result.err(`expected boolean, got ${typeof raw}`)) as Decoder<boolean>,

  null: ((raw) =>
    raw === null
      ? Result.ok(null)
      : Result.err(`expected null, got ${typeof raw}`)) as Decoder<null>,

  unknown: ((raw) => Result.ok(raw)) as Decoder<unknown>,

  array<T>(item: Decoder<T>): Decoder<T[]> {
    return (raw) => {
      if (!Array.isArray(raw)) return Result.err(`expected array, got ${typeof raw}`);
      const out: T[] = [];
      for (let i = 0; i < raw.length; i++) {
        const r = item(raw[i]);
        if (r.tag === "Err") return Result.err(`[${i}]: ${r.error}`);
        out.push(r.value);
      }
      return Result.ok(out);
    };
  },

  field<T>(key: string, inner: Decoder<T>): Decoder<T> {
    return (raw) => {
      if (!isObject(raw)) return Result.err(`expected object, got ${typeof raw}`);
      if (!(key in raw)) return Result.err(`missing field "${key}"`);
      const r = inner(raw[key]);
      if (r.tag === "Err") return Result.err(`.${key}: ${r.error}`);
      return r;
    };
  },

  optional<T>(inner: Decoder<T>): Decoder<T | undefined> {
    return (raw) => {
      if (raw == null) return Result.ok(undefined);
      return inner(raw);
    };
  },

  oneOf<T>(...decoders: Decoder<T>[]): Decoder<T> {
    return (raw) => {
      const errors: string[] = [];
      for (const d of decoders) {
        const r = d(raw);
        if (r.tag === "Ok") return r;
        errors.push(r.error);
      }
      return Result.err(`oneOf failed: ${errors.join("; ")}`);
    };
  },

  object<T>(fields: { [K in keyof T]: Decoder<T[K]> }): Decoder<T> {
    return (raw) => {
      if (!isObject(raw)) return Result.err(`expected object, got ${typeof raw}`);
      const out = {} as T;
      for (const key in fields) {
        if (!Object.prototype.hasOwnProperty.call(fields, key)) continue;
        const r = fields[key]((raw as Record<string, unknown>)[key]);
        if (r.tag === "Err") return Result.err(`.${key}: ${r.error}`);
        out[key] = r.value;
      }
      return Result.ok(out);
    };
  },

  map<T, U>(inner: Decoder<T>, fn: (t: T) => U): Decoder<U> {
    return (raw) => {
      const r = inner(raw);
      if (r.tag === "Err") return r;
      return Result.ok(fn(r.value));
    };
  },

  andThen<T, U>(inner: Decoder<T>, fn: (t: T) => Decoder<U>): Decoder<U> {
    return (raw) => {
      const r = inner(raw);
      if (r.tag === "Err") return r;
      return fn(r.value)(raw);
    };
  },

  /** Run a decoder against unparsed JSON text. */
  fromJsonString<T>(d: Decoder<T>): (text: string) => Result<T, string> {
    return (text) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        return Result.err(e instanceof Error ? e.message : String(e));
      }
      return d(parsed);
    };
  },
};
