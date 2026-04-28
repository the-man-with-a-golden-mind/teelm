// Teelm — Testing helpers
// Update results are always tuples now ([state, cmd]), so these helpers are
// thin destructuring wrappers — kept for clarity in test code.

import type { Cmd, Dispatch, Effect, UpdateResult } from "./teelm";

export function getModel<S, Msg>(result: UpdateResult<S, Msg>): S {
  return result[0] as S;
}

export function getEffects<S, Msg>(result: UpdateResult<S, Msg>): Cmd<Msg> {
  return result[1];
}

export function hasEffects<S, Msg>(
  result: UpdateResult<S, Msg>,
): boolean {
  return result[1].length > 0;
}

export function runEffect<Msg, Props>(
  effect: Effect<Msg, Props>,
  dispatch: Dispatch<Msg>,
): void {
  const [runner, props] = effect;
  runner(dispatch, props);
}

export function runCmd<Msg>(
  cmd: Cmd<Msg>,
  dispatch: Dispatch<Msg>,
): void {
  for (const effect of cmd) {
    effect[0](dispatch, effect[1]);
  }
}

export function createDispatchSpy<Msg>() {
  const messages: Msg[] = [];

  const dispatch: Dispatch<Msg> = (msg) => {
    if (Array.isArray(msg)) {
      messages.push(...(msg as readonly Msg[]));
      return;
    }
    messages.push(msg as Msg);
  };

  return {
    dispatch,
    messages,
    last(): Msg | undefined {
      return messages[messages.length - 1];
    },
    clear(): void {
      messages.length = 0;
    },
  };
}
