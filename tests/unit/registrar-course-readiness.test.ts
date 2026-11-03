import { beforeEach, describe, expect, it, vi } from "vitest";
import { listRegistrarCourseRequests } from "@/modules/learning/registrar-course-requests.functions";

const state = vi.hoisted(() => ({
  select: vi.fn(), policy: vi.fn(), actor: vi.fn(),
  batches: [] as unknown[][],
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ handler: (callback: () => unknown) => callback }),
}));
vi.mock("@tanstack/react-start/server", () => ({ setResponseHeader: vi.fn() }));
vi.mock("@/modules/identity/actors.server", () => ({
  requireActor: state.actor, actorSiteIds: () => ["site"],
}));
vi.mock("@/db/client", () => ({ db: { select: state.select } }));
vi.mock("@/modules/learning/section-registration-policy-service", () => ({
  getSectionRegistrationPolicy: state.policy,
}));

const curriculum = { learning: { version: 1, modules: [{
  id: "intro", title: "Introduction", lessons: [{
    id: "lesson", title: "First lesson", body: "Read this instruction.", resources: [],
  }],
}] } };
const request = {
  id: "request", title: "Course addition", metadata: {
    studentProfileId: "profile", schoolYearId: "year", operation: "add",
  },
  requestSiteId: "site", requestProgramId: "program", requestOrganizationId: "org",
  requestOwner: "student", studentProfileId: "profile", studentName: "Synthetic", studentLastName: "Student",
  sectionId: "section", sectionTitle: "Photography", sectionCode: "PHOTO",
  sectionSiteId: "site", sectionProgramId: "program", organizationId: "org",
  schoolYearId: "year", timezone: "America/Los_Angeles",
  curriculumStatus: "published", curriculum, createdAt: new Date("2030-01-01T12:00:00Z"),
};
beforeEach(() => {
  vi.clearAllMocks();
  state.actor.mockResolvedValue({ scope: { organizationIds: ["org"], programIds: ["program"] } });
  state.policy.mockResolvedValue({
    guardianApprovalRequired: false, addDropEndsOn: "2099-12-01", withdrawalEndsOn: "2099-12-31",
  });
  state.batches = [[request], [], [], [{ studentProfileId: "profile", programId: "program", schoolYearId: "year" }]];
  state.select.mockImplementation(() => {
    const rows = state.batches.shift() ?? [];
    const query = {
      from: () => query, innerJoin: () => query, where: () => query,
      orderBy: () => query, limit: () => query,
      then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve),
    };
    return query;
  });
});

describe("registrar course content preflight", () => {
  it("allows content-ready additions through the advisory preflight without exposing curriculum", async () => {
    const [result] = await listRegistrarCourseRequests();
    expect(result).toMatchObject({ contentReady: true, canApprove: true, sectionId: "section", programId: "program" });
    expect(result).not.toHaveProperty("curriculum");
    expect(state.actor).toHaveBeenCalledWith(["registrar"], "registrations:approve");
  });
  it.each([
    { curriculumStatus: "draft", curriculum },
    { curriculumStatus: "published", curriculum: {} },
  ])("blocks add approval when the pinned version lacks published instruction", async version => {
    state.batches[0] = [{ ...request, ...version }];
    const [result] = await listRegistrarCourseRequests();
    expect(result).toMatchObject({ contentReady: false, canApprove: false });
  });
  it.each(["drop", "withdraw"])("does not prevent %s because content is incomplete", async operation => {
    state.batches[0] = [{ ...request, curriculum: {}, metadata: { ...request.metadata, operation } }];
    const [result] = await listRegistrarCourseRequests();
    expect(result).toMatchObject({ contentReady: false, canApprove: true });
  });
  it("still requires guardian consent even when content is ready", async () => {
    state.policy.mockResolvedValue({ guardianApprovalRequired: true, addDropEndsOn: "2099-12-01" });
    const [result] = await listRegistrarCourseRequests();
    expect(result).toMatchObject({ contentReady: true, guardianState: "pending", canApprove: false });
  });
  it("still requires the student's active Program enrollment", async () => {
    state.batches[3] = [];
    const [result] = await listRegistrarCourseRequests();
    expect(result).toMatchObject({ contentReady: true, programActive: false, canApprove: false });
  });
  it("does not project readiness for a mismatched request scope", async () => {
    state.batches[0] = [{ ...request, requestSiteId: "other-site" }];
    expect(await listRegistrarCourseRequests()).toEqual([]);
    expect(state.policy).not.toHaveBeenCalled();
  });
});
