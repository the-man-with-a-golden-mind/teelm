import { withFx, type Effect } from "../src/teelm";
import { delay } from "../src/fx";

type Msg = { tag: "Done" };

const typedEffect: Effect<Msg, { msg: Msg }> = [
  (dispatch, props) => dispatch(props.msg),
  { msg: { tag: "Done" } },
];

withFx({ ok: true }, typedEffect, delay<Msg>(10, { tag: "Done" }));

// @ts-expect-error withFx should reject non-effect arguments
withFx({ ok: true }, "bad-effect");

const invalidProps: Effect<Msg, { msg: Msg }> = [
  (dispatch, props) => dispatch(props.msg),
  // @ts-expect-error effect props should be type-checked
  { typo: true },
];

void invalidProps;
