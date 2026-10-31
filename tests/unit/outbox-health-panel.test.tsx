import { type EffectCallback, type ReactElement, type ReactNode, type SetStateAction, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OutboxHealthPanel } from "@/components/operations/OutboxHealthPanel";

const state = vi.hoisted(() => ({
  slots: [] as unknown[], cursor: 0, effects: [] as EffectCallback[],
  read: vi.fn(),
}));
vi.mock("@/modules/operations/outbox-health.functions", () => ({
  getOutboxHealthSummary: state.read,
}));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState: <T,>(initial: T | (() => T)) => {
    const index = state.cursor++;
    if (!(index in state.slots)) state.slots[index] = typeof initial === "function" ? (initial as () => T)() : initial;
    return [state.slots[index] as T, (next: SetStateAction<T>) => {
      state.slots[index] = typeof next === "function" ? (next as (value: T) => T)(state.slots[index] as T) : next;
    }];
  },
  useRef: <T,>(initial: T) => {
    const index = state.cursor++;
    if (!(index in state.slots)) state.slots[index] = { current: initial };
    return state.slots[index];
  },
  useCallback: <T,>(callback: T) => callback,
  useEffect: (effect: EffectCallback) => { state.effects.push(effect); },
}));

type ControlProps = { children?: ReactNode; onClick?: () => void };

function render() {
  state.cursor = 0; state.effects = [];
  return OutboxHealthPanel();
}
function controls(node: ReactNode): Array<ReactElement<ControlProps>> {
  if (Array.isArray(node)) return node.flatMap(controls);
  if (!isValidElement<ControlProps>(node)) return [];
  return [node, ...controls(node.props.children)];
}
function words(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(words).join("");
  return isValidElement<ControlProps>(node) ? words(node.props.children) : "";
}
/** QueryState renders the retry control; invoke it with its props to reach the button. */
function findRetry() {
  const queryState = controls(render()).find((node) => typeof node.type === "function" && node.props.onRetry);
  if (!queryState) return undefined;
  const output = (queryState.type as (props: ControlProps) => ReactElement)(queryState.props);
  return controls(output).find((node) => node.type === "button" && words(node.props.children).includes("Retry"));
}
function mount() {
  render();
  const cleanup = state.effects[0]?.();
  return typeof cleanup === "function" ? cleanup : () => {};
}
async function loaded() {
  mount();
  await vi.waitFor(() => expect(renderToStaticMarkup(render())).toContain("Pending"));
}

beforeEach(() => {
  vi.clearAllMocks(); state.slots = []; state.cursor = 0; state.effects = [];
  state.read.mockResolvedValue({ failed: 2, pending: 9, pendingUnhandled: 3, processing: 1 });
});

describe("operations outbox health panel", () => {
  it("renders pending, unhandled, and failed counts from the server", async () => {
    await loaded();
    const html = renderToStaticMarkup(render());
    expect(html).toContain("Event outbox");
    expect(html).toContain("Pending");
    expect(html).toContain("Unhandled");
    expect(html).toContain("Failed");
    expect(html).toContain(">9</p>");
    expect(html).toContain(">3</p>");
    expect(html).toContain(">2</p>");
    expect(html).toContain("3 pending events have no registered");
    expect(state.read).toHaveBeenCalledOnce();
  });

  it("omits the unhandled warning when every pending type is claimed", async () => {
    state.read.mockResolvedValue({ failed: 0, pending: 4, pendingUnhandled: 0, processing: 0 });
    await loaded();
    const html = renderToStaticMarkup(render());
    expect(html).toContain(">4</p>");
    expect(html).not.toContain("will not drain");
  });

  it("shows the server's rejection instead of fake counts", async () => {
    state.read.mockRejectedValue(new Error("authorized school operator"));
    mount();
    await vi.waitFor(() => {
      const html = renderToStaticMarkup(render());
      expect(html).toContain("authorized school operator");
      expect(html).toContain("role=\"alert\"");
    });
    expect(renderToStaticMarkup(render())).not.toContain(">9</p>");
  });

  it("reloads on retry after a read failure", async () => {
    state.read.mockRejectedValueOnce(new Error("authorized school operator"));
    mount();
    await vi.waitFor(() => expect(findRetry()).toBeDefined());
    state.read.mockResolvedValue({ failed: 0, pending: 1, pendingUnhandled: 0, processing: 0 });
    findRetry()?.props.onClick?.();
    await vi.waitFor(() => expect(renderToStaticMarkup(render())).toContain(">1</p>"));
    expect(state.read).toHaveBeenCalledTimes(2);
  });
});
