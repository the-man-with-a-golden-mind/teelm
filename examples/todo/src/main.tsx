import { app, withFx, noFx, type Dispatch, type Init, type UpdateResult } from "teelm";
import { storageSet, storageGet } from "teelm/fx";
import { Decode, Result } from "teelm/functional";
import { makeEvents } from "teelm/events";
import { attachDebugger } from "teelm/debugger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Todo {
  id: number;
  text: string;
  done: boolean;
}

type Filter = "all" | "active" | "completed";

interface State {
  todos: Todo[];
  filter: Filter;
  input: string;
  nextId: number;
  lastAddedId: number | null;
}

type Msg =
  | { tag: "AddTodo" }
  | { tag: "ToggleTodo"; id: number }
  | { tag: "RemoveTodo"; id: number }
  | { tag: "SetFilter"; filter: Filter }
  | { tag: "SetInput"; value: string }
  | { tag: "ClearCompleted" }
  | { tag: "LoadTodos"; loaded: readonly Todo[] };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = "teelm-todos";

const todoDecoder = Decode.array(
  Decode.object<Todo>({
    id: Decode.number,
    text: Decode.string,
    done: Decode.boolean,
  }),
);

function saveTodos(todos: Todo[]) {
  return storageSet<Msg>(STORAGE_KEY, JSON.stringify(todos));
}

function filteredTodos(todos: Todo[], filter: Filter): Todo[] {
  switch (filter) {
    case "active":
      return todos.filter((t) => !t.done);
    case "completed":
      return todos.filter((t) => t.done);
    default:
      return todos;
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

const init: Init<State, Msg> = [
  { todos: [], filter: "all", input: "", nextId: 1, lastAddedId: null },
  [
    storageGet<Todo[], Msg>({
      key: STORAGE_KEY,
      decoder: todoDecoder,
      toMsg: (result) => ({
        tag: "LoadTodos",
        loaded: Result.withDefault(Result.map(result, (v) => v ?? []), [] as Todo[]),
      }),
    }),
  ] as unknown as Init<State, Msg>[1],
];

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

function update(state: State, msg: Msg): UpdateResult<State, Msg> {
  switch (msg.tag) {
    case "AddTodo": {
      const text = state.input.trim();
      if (!text) return noFx(state);
      const todo: Todo = { id: state.nextId, text, done: false };
      const todos = [...state.todos, todo];
      const next = {
        ...state,
        todos,
        input: "",
        nextId: state.nextId + 1,
        lastAddedId: todo.id,
      };
      return withFx<State, Msg>(next, saveTodos(todos));
    }

    case "ToggleTodo": {
      const todos = state.todos.map((t) =>
        t.id === msg.id ? { ...t, done: !t.done } : t,
      );
      return withFx<State, Msg>({ ...state, todos, lastAddedId: null }, saveTodos(todos));
    }

    case "RemoveTodo": {
      const todos = state.todos.filter((t) => t.id !== msg.id);
      return withFx<State, Msg>({
        ...state,
        todos,
        lastAddedId: state.lastAddedId === msg.id ? null : state.lastAddedId,
      }, saveTodos(todos));
    }

    case "SetFilter":
      return noFx({ ...state, filter: msg.filter });

    case "SetInput":
      return noFx({ ...state, input: msg.value });

    case "ClearCompleted": {
      const todos = state.todos.filter((t) => !t.done);
      return withFx<State, Msg>({ ...state, todos, lastAddedId: null }, saveTodos(todos));
    }

    case "LoadTodos": {
      const loaded = msg.loaded;
      if (loaded.length === 0) return noFx(state);
      const maxId = loaded.reduce((max, t) => Math.max(max, t.id), 0);
      return noFx({
        ...state,
        todos: [...loaded],
        nextId: maxId + 1,
        lastAddedId: null,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

function view(state: State, dispatch: Dispatch<Msg>) {
  const E = makeEvents(dispatch);
  const visible = filteredTodos(state.todos, state.filter);
  const remaining = state.todos.filter((t) => !t.done).length;
  const hasCompleted = state.todos.some((t) => t.done);

  return (
    <div class="card bg-base-100 shadow-xl max-w-lg mx-auto mt-12">
      <div class="card-body">
        <div class="flex items-center justify-between mb-4">
          <h1 class="card-title text-2xl font-bold">Todo</h1>
          <span class="badge badge-primary">{`${remaining} left`}</span>
        </div>

        <p class="text-sm text-base-content/60 mb-4">
          onMount focuses the input, afterRender scrolls newly-added todos into view.
        </p>

        <form class="flex gap-2 mb-4" {...E.onSubmit({ tag: "AddTodo" })}>
          <input
            id="todo-input"
            class="input input-bordered flex-1"
            type="text"
            placeholder="What needs to be done?"
            value={state.input}
            {...E.onInput((value) => ({ tag: "SetInput", value }))}
          />
          <button class="btn btn-primary" type="submit">Add</button>
        </form>

        <div class="tabs tabs-boxed mb-4 justify-center">
          {(["all", "active", "completed"] as Filter[]).map((f) => (
            <a
              key={f}
              class={`tab${state.filter === f ? " tab-active" : ""}`}
              {...E.onClick({ tag: "SetFilter", filter: f })}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </a>
          ))}
        </div>

        {visible.map((todo) => (
          <div
            key={todo.id}
            id={`todo-${todo.id}`}
            class="flex items-center gap-3 py-2 px-1 group"
          >
            <input
              type="checkbox"
              class="checkbox checkbox-sm"
              checked={todo.done}
              {...E.onClick({ tag: "ToggleTodo", id: todo.id })}
            />
            <span class={`flex-1${todo.done ? " line-through opacity-50" : ""}`}>
              {todo.text}
            </span>
            <button
              class="btn btn-ghost btn-xs opacity-0 group-hover:opacity-100"
              {...E.onClick({ tag: "RemoveTodo", id: todo.id })}
            >
              x
            </button>
          </div>
        ))}

        {hasCompleted && <div class="divider my-2" />}

        <div class="flex justify-between items-center mt-2">
          <span>{`${remaining} item${remaining !== 1 ? "s" : ""} left`}</span>
          {hasCompleted && (
            <button class="btn btn-ghost btn-sm" {...E.onClick({ tag: "ClearCompleted" })}>
              Clear completed
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

const instance = app<State, Msg>({
  init,
  update,
  view,
  onMount: ({ node }) => {
    node.querySelector<HTMLInputElement>("#todo-input")?.focus();
    document.title = "Teelm Todo";
  },
  afterRender: ({ state, prevState, node }) => {
    document.title = `Todo (${state.todos.length})`;
    if (state.lastAddedId !== null && state.lastAddedId !== prevState?.lastAddedId) {
      node.querySelector<HTMLElement>(`#todo-${state.lastAddedId}`)?.scrollIntoView({
        block: "nearest",
      });
      node.querySelector<HTMLInputElement>("#todo-input")?.focus();
    }
  },
  onUnmount: () => {
    document.title = "Teelm";
  },
  node: document.getElementById("app")!,
  debug: true,
});

attachDebugger(instance);
