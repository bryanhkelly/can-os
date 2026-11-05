import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadOperationsHome } from "@/components/home/OperationsHome";

const state = vi.hoisted(() => ({
  getOperationsActions: vi.fn(),
  getReleaseHealth: vi.fn(),
  getLiveOperationsCommandCenter: vi.fn(),
  getLiveFullFlowOperations: vi.fn(),
  listLaunches: vi.fn(),
}));

vi.mock("@/modules/operations/action-workspace.functions", () => ({ getOperationsActions: state.getOperationsActions }));
vi.mock("@/modules/operations/release-health.functions", () => ({ getReleaseHealth: state.getReleaseHealth }));
vi.mock("@/modules/operations/command-center.functions", () => ({
  getLiveOperationsCommandCenter: state.getLiveOperationsCommandCenter,
  getLiveFullFlowOperations: state.getLiveFullFlowOperations,
}));
vi.mock("@/modules/programs/launch.functions", () => ({ listLaunches: state.listLaunches }));
vi.mock("@/components/operations/OperationsWorkspace", () => ({ OperationsWorkspace: () => null }));

beforeEach(() => {
  vi.resetAllMocks();
  state.getOperationsActions.mockResolvedValue({ items: [] });
  state.getReleaseHealth.mockRejectedValue(new Error("health unavailable"));
  state.getLiveOperationsCommandCenter.mockRejectedValue(new Error("command center unavailable"));
  state.getLiveFullFlowOperations.mockRejectedValue(new Error("dashboard unavailable"));
  state.listLaunches.mockRejectedValue(new Error("launches unavailable"));
});

describe("Operations Home supplementary reads", () => {
  it("keeps the primary page available while preserving each supplementary failure state", async () => {
    const outcome = await loadOperationsHome({});

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.operations).toEqual({ items: [] });
    expect(outcome.data.health).toEqual({ state: "unavailable", data: null });
    expect(outcome.data.commandCenter).toEqual({ state: "unavailable", data: null });
    expect(outcome.data.dashboard).toEqual({ state: "unavailable", data: null });
    expect(outcome.data.launches).toEqual({ state: "unavailable", data: null });
  });

  it("preserves a real empty launch list as data instead of treating it as unavailable", async () => {
    state.listLaunches.mockResolvedValue({ launches: [] });

    const outcome = await loadOperationsHome({});

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.launches).toEqual({ state: "empty", data: { launches: [] } });
  });
});