import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  invitations: vi.fn(), admissions: vi.fn(), enrollments: vi.fn(), extended: vi.fn(), guidance: vi.fn(), research: vi.fn(),
}));
vi.mock("@/components/operations/LaunchWizardPage", () => ({ LaunchWizardPage: () => null }));
vi.mock("@/modules/programs/launch.functions", () => ({ listLaunchOptions: async () => ({}), listLaunches: async () => ({ launches: [] }) }));
vi.mock("@/modules/enrollment/admissions-program-directory.functions", () => ({ listAdmissionsPrograms: async () => [] }));
vi.mock("@/modules/enrollment/family-invitations.functions", () => ({ listFamilyInvitations: state.invitations }));
vi.mock("@/modules/enrollment/launch-admissions-counts.functions", () => ({ getLaunchAdmissionsCounts: state.admissions }));
vi.mock("@/modules/enrollment/admissions-dashboard.functions", () => ({ getActiveEnrollmentCounts: state.enrollments }));
vi.mock("@/modules/activities/extended-learning.functions", () => ({ listExtendedSeasonPlanning: state.extended }));
vi.mock("@/modules/programs/jurisdiction-profile.functions", () => ({ listPublishedJurisdictionGuidance: state.guidance }));
vi.mock("@/modules/programs/jurisdiction-launch-research.functions", () => ({ listLaunchJurisdictionResearch: state.research }));
import { Route } from "@/routes/operations.launch.index";
import { launchMilestoneAvailable } from "@/lib/supplementary-read";

const load = () => (Route.options.loader as (input: unknown) => Promise<any>)({ deps: { siteId: "school", programId: "program" } });
beforeEach(() => {
  vi.resetAllMocks();
  state.invitations.mockResolvedValue({ batches: [] });
  state.admissions.mockResolvedValue({ total: 0 }); state.enrollments.mockResolvedValue([]);
  state.extended.mockResolvedValue({}); state.guidance.mockResolvedValue({}); state.research.mockResolvedValue({});
});
describe("launch loader availability", () => {
  it("retains failed jurisdiction and enrollment reads as unavailable, not zero outstanding work", async () => {
    state.guidance.mockRejectedValue(new Error("unavailable"));
    state.enrollments.mockRejectedValue(new Error("unavailable"));
    const result = await load();
    expect(result.ok).toBe(true);
    expect(result.data.reads).toMatchObject({ jurisdictionGuidance: "unavailable", enrollmentCounts: "unavailable", admissionsCounts: "empty" });
    expect(result.data.enrollmentCounts).toBeNull();
    expect(launchMilestoneAvailable(result.data.reads, "opening")).toBe(false);
  });
  it("distinguishes permission denial from unavailable service", async () => {
    state.research.mockRejectedValue({ code: "FORBIDDEN" });
    const result = await load();
    expect(result.data.reads.jurisdictionResearch).toBe("unauthorized");
    expect(launchMilestoneAvailable(result.data.reads, "configuration")).toBe(false);
  });
  it("preserves successful empty reads as actual empty results", async () => {
    const result = await load();
    expect(result.data.reads).toMatchObject({ enrollmentCounts: "empty", jurisdictionGuidance: "empty" });
    expect(result.data.enrollmentCounts).toEqual([]);
    expect(launchMilestoneAvailable(result.data.reads, "opening")).toBe(true);
  });
});