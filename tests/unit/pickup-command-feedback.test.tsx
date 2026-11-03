import { isValidElement, type EffectCallback, type ReactElement, type ReactNode, type SetStateAction } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GuardianPickupPanel } from "@/components/operations/GuardianPickupPanel";
import { OnsitePickupPanel } from "@/components/operations/OnsitePickupPanel";
import { MutationFeedback } from "@/components/workspace";

const state = vi.hoisted(() => ({
  slots: [] as unknown[], cursor: 0, effects: [] as EffectCallback[],
  read: vi.fn(), first: vi.fn(), second: vi.fn(),
}));
vi.mock("@/modules/operations/pickup.functions", () => ({
  getGuardianPickupWorkspace: state.read, getOnsitePickupRoster: state.read,
  createPickupAuthorization: state.first, recordDeniedPickup: state.first,
  revokePickupAuthorization: state.second, createPickupCustodyHold: state.second,
  recordUncollectedChild: vi.fn(), recordVerifiedPickupRelease: vi.fn(),
  resolvePickupCustodyHold: vi.fn(), proposePickupCustodyResolution: vi.fn(),
}));
vi.mock("react", async original => ({
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

type Props = {
  children?: ReactNode; disabled?: boolean; onClick?: () => void;
  state?: { pending: boolean; refreshFailed: boolean; retryRefresh: () => Promise<unknown> };
};
function nodes(node: ReactNode): ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!isValidElement<Props>(node)) return [];
  return [node, ...nodes(node.props.children)];
}
const student = {
  studentProfileId: "student", studentName: "Synthetic Student", programId: "program", programName: "Test School",
  householdId: "household", householdIds: ["household"], schoolLocalToday: "2030-01-01",
  status: "present", holds: [], releases: [], activeHolds: [], authorizedAdults: [], deniedAttempts: [],
  authorizations: [{ id: "adult", pickupName: "Synthetic Adult", status: "active",
    relationshipLabel: "Guardian", identityVerificationMethod: "government_photo_id", startsOn: "2030-01-01" }],
};
beforeEach(() => {
  vi.resetAllMocks(); state.slots = []; state.cursor = 0; state.effects = [];
  state.read.mockResolvedValue({ students: [student], canRecordPickupObservations: true, note: "Isolated fixture" });
  state.first.mockResolvedValue({ saved: true }); state.second.mockResolvedValue({ saved: true });
});

describe.each([
  { name: "guardian", panel: () => GuardianPickupPanel({}), first: "Save pickup authorization", second: "Revoke future pickup" },
  { name: "staff", panel: () => OnsitePickupPanel({ date: "2030-01-01" }), first: "Record denial — no release", second: "Block all release" },
])("$name pickup recovery", ({ panel, first, second }) => {
  function render() {
    state.cursor = 0; state.effects = [];
    return nodes(panel());
  }
  function button(label: string) {
    const result = render().find(node => node.type === "button" && node.props.children === label);
    if (!result) throw new Error(`Missing pickup control: ${label}`);
    return result;
  }
  function feedback() {
    const result = render().find(node => node.type === MutationFeedback)?.props.state;
    if (!result) throw new Error("Missing mutation feedback");
    return result;
  }
  async function mount() {
    render(); state.effects.forEach(effect => effect());
    await vi.waitFor(() => expect(button(first)).toBeDefined());
  }
  async function settled() {
    await vi.waitFor(() => expect(feedback().pending).toBe(false));
  }
  it("reuses an uncertain command ID until acknowledged, then assigns a new ID", async () => {
    await mount();
    state.first.mockRejectedValueOnce(new Error("Response lost"));
    button(first).props.onClick?.(); await settled();
    button(first).props.onClick?.(); await settled();
    button(first).props.onClick?.(); await settled();
    expect(state.first).toHaveBeenCalledTimes(3);
    const ids = state.first.mock.calls.map(([input]) => input.data.mutationId);
    expect(ids[0]).toBe(ids[1]); expect(ids[2]).not.toBe(ids[1]);
  });
  it("recovers refresh without replaying a command or dropping an unrelated uncertain ID", async () => {
    await mount();
    state.first.mockRejectedValueOnce(new Error("Response lost"));
    button(first).props.onClick?.(); await settled();
    state.read.mockRejectedValueOnce(new Error("Refresh unavailable"));
    button(second).props.onClick?.(); await settled();
    expect(feedback().refreshFailed).toBe(true);
    expect(render().some(node => node.type === "button" &&
      [first, second].includes(String(node.props.children)) && !node.props.disabled)).toBe(false);
    await feedback().retryRefresh();
    expect(feedback().refreshFailed).toBe(false);
    expect(state.second).toHaveBeenCalledOnce();
    button(first).props.onClick?.(); await settled();
    expect(state.first).toHaveBeenCalledTimes(2);
    expect(state.first.mock.calls[0][0].data.mutationId).toBe(state.first.mock.calls[1][0].data.mutationId);
    button(second).props.onClick?.(); await settled();
    expect(state.second).toHaveBeenCalledTimes(2);
    expect(state.second.mock.calls[0][0].data.mutationId).not.toBe(state.second.mock.calls[1][0].data.mutationId);
  });
});
