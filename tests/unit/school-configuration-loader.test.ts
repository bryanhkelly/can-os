import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  hub: vi.fn(),
  academic: vi.fn(),
  draft: vi.fn(),
  research: vi.fn(),
}));

vi.mock("@/modules/programs/school-hub.functions", () => ({ getSchoolHubData: state.hub }));
vi.mock("@/modules/programs/launch-academics.functions", () => ({ getLaunchAcademicSetup: state.academic }));
vi.mock("@/modules/programs/launch-drafts.functions", () => ({ getLaunchStudioDraft: state.draft }));
vi.mock("@/modules/programs/jurisdiction-launch-research.functions", () => ({ listLaunchJurisdictionResearch: state.research }));

import { loadSchoolConfiguration } from "@/modules/programs/school-configuration-loader";

const siteId = "00000000-0000-4000-8000-000000000001";

describe("school configuration loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.hub.mockResolvedValue({ launches: [], selectedProgramId: null });
    state.draft.mockResolvedValue({ revision: 1 });
    state.research.mockResolvedValue({});
  });

  it("loads a saved academic setup draft for Academics before the first Program exists", async () => {
    const result = await loadSchoolConfiguration({ siteId }, "academics");

    expect(state.draft).toHaveBeenCalledWith({ data: { audience: "school", context: `${siteId}:` } });
    expect(result.draft).toEqual({ revision: 1 });
    expect(result.jurisdictionResearch).toEqual({});
    expect(result.jurisdictionResearchUnavailable).toBe(false);
    expect(state.academic).not.toHaveBeenCalled();
    expect(state.research).toHaveBeenCalledOnce();
  });

  it("does not load academic drafts from School details", async () => {
    await loadSchoolConfiguration({ siteId }, "profile");

    expect(state.draft).not.toHaveBeenCalled();
    expect(state.research).not.toHaveBeenCalled();
  });
});