import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ loadStewardHome: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  redirect: vi.fn(),
}));
vi.mock("@/components/shell/WorkspaceSession", () => ({ workspaceSessionQueryOptions: () => ({}) }));
vi.mock("@/components/workspace", () => ({ WorkspaceShell: () => null }));
vi.mock("@/components/home/StewardHome", () => ({
  CANPartnerDesk: () => null,
  loadStewardHome: state.loadStewardHome,
}));

import { loadHomeDashboard } from "@/routes/home";

beforeEach(() => vi.resetAllMocks());

describe("jurisdiction reviewer home", () => {
  it("routes the reviewer to the independently authorized review desk", async () => {
    await expect(loadHomeDashboard("can_jurisdiction_reviewer", {})).resolves.toEqual({
      kind: "jurisdiction-review",
    });
    expect(state.loadStewardHome).not.toHaveBeenCalled();
  });

  it("keeps the network steward on the separate steward desk", async () => {
    state.loadStewardHome.mockResolvedValue({ items: [] });

    await expect(loadHomeDashboard("can_network_steward", {})).resolves.toEqual({
      kind: "steward", outcome: { items: [] },
    });
    expect(state.loadStewardHome).toHaveBeenCalledOnce();
  });
});