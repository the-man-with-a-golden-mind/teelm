# JSX Support

Teelm supports JSX via the React 17+ automatic transform. You can use JSX syntax alongside or instead of `h()` calls.

## Configuration

### tsconfig.json

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "teelm"
  }
}
```

This tells TypeScript to use Teelm's JSX runtime automatically. No manual imports needed.

### Per-File Pragma

Alternatively, use a pragma comment at the top of individual files:

```tsx
/** @jsxImportSource teelm */
```

This is useful when mixing Teelm JSX with other frameworks or when you only want JSX in specific files.

## Using JSX

### Basic Usage

```tsx
function view(state: State, dispatch: Dispatch<Msg>) {
  return (
    <div class="container">
      <h1>{state.title}</h1>
      <p>Count: {state.count}</p>
      <button onClick={() => dispatch({ tag: "Inc" })}>+</button>
    </div>
  );
}
```

### Conditional Rendering

```tsx
function view(state: State, dispatch: Dispatch<Msg>) {
  return (
    <div>
      {state.loading && <p>Loading...</p>}
      {state.error ? <p class="error">{state.error}</p> : null}
      {state.items.map((item) => (
        <div key={item.id}>{item.name}</div>
      ))}
    </div>
  );
}
```

### Event Handlers

Inline closures work as you'd expect:

```tsx
<input
  type="text"
  value={state.input}
  onInput={(e: Event) =>
    dispatch({ tag: "SetInput", value: (e.target as HTMLInputElement).value })
  }
/>

<form onSubmit={(e: Event) => { e.preventDefault(); dispatch({ tag: "Submit" }); }}>
  {/* ... */}
</form>
```

For boilerplate-free wiring, the typed event helpers in `teelm/events` produce prop fragments you can spread:

```tsx
import { makeEvents } from "teelm/events";

function view(state: State, dispatch: Dispatch<Msg>) {
  const E = makeEvents(dispatch);
  return (
    <form {...E.onSubmit({ tag: "Submit" })}>
      <input
        type="text"
        value={state.input}
        {...E.onInput((value) => ({ tag: "SetInput", value }))}
      />
      <button type="submit">Save</button>
    </form>
  );
}
```

This keeps `dispatch` captured once per render and avoids stale-closure bugs when handlers move between elements.

### Spread Props

```tsx
import { routerLink } from "teelm/router";

<a {...routerLink("/about")} class="nav-link">About</a>
```

### Fragments

Use `<></>` to return multiple elements without a wrapper:

```tsx
function view(state: State, dispatch: Dispatch<Msg>) {
  return (
    <>
      <h1>Title</h1>
      <p>Paragraph</p>
    </>
  );
}
```

Note: Fragments are implemented as elements with an empty string tag. They render their children directly into the parent.

## h() vs JSX Comparison

Both produce identical VNode trees. Choose based on preference.

### h() style

```ts
h("div", { class: "card" },
  h("h1", {}, state.title),
  h("p", {}, "Count: ", String(state.count)),
  h("button", { onClick: () => dispatch({ tag: "Inc" }) }, "+"),
)
```

### JSX style

```tsx
<div class="card">
  <h1>{state.title}</h1>
  <p>Count: {state.count}</p>
  <button onClick={() => dispatch({ tag: "Inc" })}>+</button>
</div>
```

### Differences

| Feature | `h()` | JSX |
|---------|-------|-----|
| Import needed | `import { h } from "teelm"` | None (automatic) |
| Children | Variadic arguments | Nested elements |
| Text nodes | Explicit `String()` conversion | Automatic |
| Conditional children | Inline `condition ? h(...) : null` | `{condition && <.../>}` |
| File extension | `.ts` | `.tsx` |

## Using JSX in Pages

When using the CLI with `--jsx`, pages are generated as `.tsx` files:

```bash
teelm new my-app --jsx
teelm add "Dashboard" --jsx
```

A JSX page looks like:

```tsx
import { noFx } from "teelm";
import { type PageConfig } from "teelm/router";
import type { Shared } from "../shared";

export const page: PageConfig<{}, never, Shared, {}> = {
  init: () => noFx({}),
  update: (model) => noFx(model),
  view: (_model, shared) => (
    <div class="text-center py-16">
      <h1 class="text-4xl font-bold">Welcome to {shared.appName}</h1>
      <p class="text-gray-500">Built with Teelm</p>
    </div>
  ),
};
```

## Class Handling

Teelm supports multiple formats for the `class` prop (both in JSX and `h()`):

```tsx
// String
<div class="foo bar" />

// Array (falsy values filtered)
<div class={["foo", condition && "bar", "baz"]} />

// Object (truthy values included)
<div class={{ foo: true, bar: isActive, baz: false }} />

// className also works (mapped to class)
<div className="foo bar" />
```

## Style Handling

Styles can be strings or objects:

```tsx
// String
<div style="color: red; font-size: 16px" />

// Object (camelCase or CSS custom properties)
<div style={{ color: "red", fontSize: "16px" }} />
<div style={{ "--custom-prop": "value" }} />
```

## Refs

Use the `ref` prop to get a reference to the underlying DOM element:

```tsx
<input ref={(el) => el.focus()} type="text" />
```

The ref callback is called when the element is created.

## TypeScript Types

Teelm's JSX namespace provides type definitions:

```ts
// VNode is the element type
import type { VNode } from "teelm";

// JSX namespace for intrinsic elements
namespace JSX {
  type Element = VNode;
  interface IntrinsicElements {
    [tag: string]: Record<string, any>;
  }
}
```

All HTML/SVG elements accept any props (loose typing). This provides flexibility while the `Msg` discriminated union pattern catches logic errors at the update level.
