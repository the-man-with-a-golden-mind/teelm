// Teelm — Typed event helpers
// Wired to a Dispatch<Msg>, these produce VNode prop objects with handlers
// that already call dispatch with the right Msg. Closures still work as an
// escape hatch; these helpers are the safer default.

import type { Dispatch } from "./teelm";

export interface Events<Msg> {
  onClick(msg: Msg): { onClick: (e: MouseEvent) => void };
  onClickWith(fn: (e: MouseEvent) => Msg | undefined): { onClick: (e: MouseEvent) => void };

  onDoubleClick(msg: Msg): { onDblclick: (e: MouseEvent) => void };

  onInput(fn: (value: string) => Msg | undefined): { onInput: (e: Event) => void };
  onChange(fn: (value: string) => Msg | undefined): { onChange: (e: Event) => void };
  onChecked(fn: (checked: boolean) => Msg | undefined): { onChange: (e: Event) => void };

  onSubmit(msg: Msg): { onSubmit: (e: SubmitEvent) => void };
  onSubmitWith(fn: (data: FormData) => Msg | undefined): { onSubmit: (e: SubmitEvent) => void };

  onKeyDown(fn: (key: string, e: KeyboardEvent) => Msg | undefined): { onKeydown: (e: KeyboardEvent) => void };
  onKeyUp(fn: (key: string, e: KeyboardEvent) => Msg | undefined): { onKeyup: (e: KeyboardEvent) => void };

  /** Dispatch `msg` only when Enter is pressed. */
  onEnter(msg: Msg): { onKeydown: (e: KeyboardEvent) => void };
  /** Dispatch `msg` only when Escape is pressed. */
  onEscape(msg: Msg): { onKeydown: (e: KeyboardEvent) => void };

  onFocus(msg: Msg): { onFocus: () => void };
  onBlur(msg: Msg): { onBlur: () => void };
}

export function makeEvents<Msg>(dispatch: Dispatch<Msg>): Events<Msg> {
  const dispatchMaybe = (m: Msg | undefined): void => {
    if (m !== undefined) dispatch(m);
  };

  return {
    onClick: (msg) => ({ onClick: () => dispatch(msg) }),
    onClickWith: (fn) => ({ onClick: (e) => dispatchMaybe(fn(e)) }),
    onDoubleClick: (msg) => ({ onDblclick: () => dispatch(msg) }),

    onInput: (fn) => ({
      onInput: (e) => dispatchMaybe(fn((e.target as HTMLInputElement).value)),
    }),
    onChange: (fn) => ({
      onChange: (e) => dispatchMaybe(fn((e.target as HTMLInputElement).value)),
    }),
    onChecked: (fn) => ({
      onChange: (e) => dispatchMaybe(fn((e.target as HTMLInputElement).checked)),
    }),

    onSubmit: (msg) => ({
      onSubmit: (e) => {
        e.preventDefault();
        dispatch(msg);
      },
    }),
    onSubmitWith: (fn) => ({
      onSubmit: (e) => {
        e.preventDefault();
        dispatchMaybe(fn(new FormData(e.target as HTMLFormElement)));
      },
    }),

    onKeyDown: (fn) => ({
      onKeydown: (e) => dispatchMaybe(fn(e.key, e)),
    }),
    onKeyUp: (fn) => ({
      onKeyup: (e) => dispatchMaybe(fn(e.key, e)),
    }),
    onEnter: (msg) => ({
      onKeydown: (e) => {
        if (e.key === "Enter") dispatch(msg);
      },
    }),
    onEscape: (msg) => ({
      onKeydown: (e) => {
        if (e.key === "Escape") dispatch(msg);
      },
    }),

    onFocus: (msg) => ({ onFocus: () => dispatch(msg) }),
    onBlur: (msg) => ({ onBlur: () => dispatch(msg) }),
  };
}
