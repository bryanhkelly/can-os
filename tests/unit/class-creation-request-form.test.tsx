import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMutationRunner, type MutationFeedbackState } from "@/lib/mutation-feedback";
import { ClassCreationRequestForm } from "@/components/learning/ClassCreationRequestForm";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";

const state = vi.hoisted(() => ({
  slots: [] as unknown[], cursor: 0,
  feedback: { pending: false, error: "", notice: "", refreshFailed: false } as MutationFeedbackState,
  runner: null as ReturnType<typeof createMutationRunner> | null,
  completed: Promise.resolve() as Promise<unknown>,
  submit: vi.fn(), refresh: vi.fn(),
}));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = state.cursor++;
    if (!(index in state.slots)) state.slots[index] = typeof initial === "function" ? initial() : initial;
    return [state.slots[index], (next: unknown) => { state.slots[index] = next; }];
  },
  useRef: (initial: unknown) => {
    const index = state.cursor++;
    if (!(index in state.slots)) state.slots[index] = { current: initial };
    return state.slots[index];
  },
}));
vi.mock("@tanstack/react-router", () => ({ useRouter: () => ({ invalidate: state.refresh }) }));
vi.mock("@/modules/programs/section-creation-requests.functions", () => ({ submitTeacherClassRequest: state.submit }));
vi.mock("@/lib/mutation-feedback", async original => {
  const actual = await original<typeof import("@/lib/mutation-feedback")>();
  return { ...actual, useMutationFeedback: () => ({
    ...state.feedback,
    run: (...args: Parameters<ReturnType<typeof actual.createMutationRunner>>) => {
      state.completed = state.runner!(...args);
      return state.completed;
    },
    retryRefresh: () => state.runner!.retryRefresh(),
  }) };
});

type Props = {
  children?: ReactNode; value?: string; disabled?: boolean;
  state?: MutationFeedbackState & { retryRefresh: () => Promise<unknown> };
  onChange?: (event: { target: { value: string } }) => void;
  onSubmit?: (event: { preventDefault: () => void }) => void;
};
function nodes(node: ReactNode): ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<Props>(node)) return [];
  return [node, ...nodes(node.props.children)];
}
function render() {
  state.cursor = 0;
  return nodes(ClassCreationRequestForm({ options: {
    programs: [{ id: "program", name: "Example program" }], requests: [],
  } }));
}
function title(controls: ReactElement<Props>[]) {
  const label = controls.find(node => node.type === Label &&
    Array.isArray(node.props.children) && node.props.children[0]?.toString().includes("Proposed class title"));
  const input = label && nodes(label).find(node => node.type === Input);
  if (!input) throw new Error("Missing canonical title input");
  return input;
}
function submit() {
  const form = render().find(node => node.type === "form");
  if (!form?.props.onSubmit) throw new Error("Missing request form");
  form.props.onSubmit({ preventDefault() {} });
  return state.completed;
}
beforeEach(() => {
  vi.resetAllMocks();
  state.slots = [];
  state.feedback = { pending: false, error: "", notice: "", refreshFailed: false };
  state.runner = createMutationRunner({ refresh: state.refresh, update: next => { state.feedback = next; } });
  state.submit.mockResolvedValue({ requestId: "saved" });
});

describe("class request reconciliation", () => {
  it("preserves the saved draft and confirmation through failed refreshes, clearing only after recovery", async () => {
    state.refresh.mockRejectedValueOnce(new Error("offline"))
      .mockRejectedValueOnce(new Error("still offline")).mockResolvedValue(undefined);
    title(render()).props.onChange!({ target: { value: "Biology" } });
    await submit();
    expect(title(render()).props.value).toBe("Biology");
    expect(state.feedback.notice).toBe("Class request sent to the registrar.");
    expect(render().find(node => node.type === "fieldset")?.props.disabled).toBe(true);
    await submit();
    expect(state.submit).toHaveBeenCalledTimes(1);
    const feedback = () => render().find(node => node.type === MutationFeedback)!.props.state!;
    expect(await feedback().retryRefresh()).toEqual({ status: "refresh-failed" });
    expect(title(render()).props.value).toBe("Biology");
    expect(await feedback().retryRefresh()).toEqual({ status: "refreshed" });
    expect(title(render()).props.value).toBe("");
    expect(state.submit).toHaveBeenCalledTimes(1);
    expect(render().find(node => node.type === "fieldset")?.props.disabled).toBe(false);
    title(render()).props.onChange!({ target: { value: "Physics" } });
    await submit();
    const first = state.submit.mock.calls[0][0].data.requestId;
    expect(state.submit.mock.calls[1][0].data.requestId).not.toBe(first);
  });

  it("keeps the draft and idempotency key after command failure, then clears on successful reconciliation", async () => {
    state.submit.mockRejectedValueOnce(new Error("unavailable")).mockResolvedValue({ requestId: "saved" });
    state.refresh.mockResolvedValue(undefined);
    title(render()).props.onChange!({ target: { value: "Biology" } });
    await submit();
    expect(title(render()).props.value).toBe("Biology");
    expect(state.refresh).not.toHaveBeenCalled();
    await submit();
    expect(state.submit.mock.calls[1][0].data.requestId).toBe(state.submit.mock.calls[0][0].data.requestId);
    expect(title(render()).props.value).toBe("");
  });
});
