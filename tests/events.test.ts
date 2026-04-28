import { describe, expect, test } from "bun:test";
import { makeEvents } from "../src/events";
import { createDispatchSpy } from "../src/testing";

type Msg =
  | { tag: "Click" }
  | { tag: "Input"; value: string }
  | { tag: "Checked"; on: boolean }
  | { tag: "Submit" }
  | { tag: "Submitted"; data: string }
  | { tag: "Key"; key: string }
  | { tag: "Enter" }
  | { tag: "Escape" }
  | { tag: "Focus" }
  | { tag: "Blur" }
  | { tag: "Double" };

describe("events.makeEvents", () => {
  test("onClick dispatches the configured msg", () => {
    const spy = createDispatchSpy<Msg>();
    const E = makeEvents(spy.dispatch);
    const props = E.onClick({ tag: "Click" });
    props.onClick(new MouseEvent("click"));
    expect(spy.messages).toEqual([{ tag: "Click" }]);
  });

  test("onClickWith dispatches result of fn (or skips if undefined)", () => {
    const spy = createDispatchSpy<Msg>();
    const E = makeEvents(spy.dispatch);
    const props = E.onClickWith(() => undefined);
    props.onClick(new MouseEvent("click"));
    expect(spy.messages).toEqual([]);

    const props2 = E.onClickWith(() => ({ tag: "Click" as const }));
    props2.onClick(new MouseEvent("click"));
    expect(spy.messages).toEqual([{ tag: "Click" }]);
  });

  test("onDoubleClick dispatches msg", () => {
    const spy = createDispatchSpy<Msg>();
    const E = makeEvents(spy.dispatch);
    const props = E.onDoubleClick({ tag: "Double" });
    props.onDblclick(new MouseEvent("dblclick"));
    expect(spy.messages).toEqual([{ tag: "Double" }]);
  });

  test("onInput passes target value to fn", () => {
    const spy = createDispatchSpy<Msg>();
    const E = makeEvents(spy.dispatch);
    const props = E.onInput((v) => ({ tag: "Input" as const, value: v }));
    const input = document.createElement("input");
    input.value = "hello";
    const ev = new Event("input");
    Object.defineProperty(ev, "target", { value: input });
    props.onInput(ev);
    expect(spy.messages).toEqual([{ tag: "Input", value: "hello" }]);
  });

  test("onChecked passes checkbox state", () => {
    const spy = createDispatchSpy<Msg>();
    const E = makeEvents(spy.dispatch);
    const props = E.onChecked((on) => ({ tag: "Checked" as const, on }));
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = true;
    const ev = new Event("change");
    Object.defineProperty(ev, "target", { value: input });
    props.onChange(ev);
    expect(spy.messages).toEqual([{ tag: "Checked", on: true }]);
  });

  test("onSubmit prevents default and dispatches", () => {
    const spy = createDispatchSpy<Msg>();
    const E = makeEvents(spy.dispatch);
    const props = E.onSubmit({ tag: "Submit" });

    let prevented = false;
    const ev = { preventDefault: () => { prevented = true; } } as SubmitEvent;
    props.onSubmit(ev);
    expect(prevented).toBe(true);
    expect(spy.messages).toEqual([{ tag: "Submit" }]);
  });

  test("onEnter only fires on Enter key", () => {
    const spy = createDispatchSpy<Msg>();
    const E = makeEvents(spy.dispatch);
    const props = E.onEnter({ tag: "Enter" });
    props.onKeydown(new KeyboardEvent("keydown", { key: "a" }));
    expect(spy.messages).toEqual([]);
    props.onKeydown(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(spy.messages).toEqual([{ tag: "Enter" }]);
  });

  test("onEscape only fires on Escape key", () => {
    const spy = createDispatchSpy<Msg>();
    const E = makeEvents(spy.dispatch);
    const props = E.onEscape({ tag: "Escape" });
    props.onKeydown(new KeyboardEvent("keydown", { key: "x" }));
    expect(spy.messages).toEqual([]);
    props.onKeydown(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(spy.messages).toEqual([{ tag: "Escape" }]);
  });

  test("onFocus / onBlur dispatch the configured msg", () => {
    const spy = createDispatchSpy<Msg>();
    const E = makeEvents(spy.dispatch);
    E.onFocus({ tag: "Focus" }).onFocus();
    E.onBlur({ tag: "Blur" }).onBlur();
    expect(spy.messages).toEqual([{ tag: "Focus" }, { tag: "Blur" }]);
  });

  test("onKeyDown passes both key and event to fn", () => {
    const spy = createDispatchSpy<Msg>();
    const E = makeEvents(spy.dispatch);
    const props = E.onKeyDown((key) => ({ tag: "Key" as const, key }));
    props.onKeydown(new KeyboardEvent("keydown", { key: "x" }));
    expect(spy.messages).toEqual([{ tag: "Key", key: "x" }]);
  });

  test("returning undefined from a handler does not dispatch", () => {
    const spy = createDispatchSpy<Msg>();
    const E = makeEvents(spy.dispatch);
    const props = E.onInput(() => undefined);
    const input = document.createElement("input");
    const ev = new Event("input");
    Object.defineProperty(ev, "target", { value: input });
    props.onInput(ev);
    expect(spy.messages).toEqual([]);
  });
});
