import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ assessment: {} as Record<string, unknown>, writes: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ validator: () => ({ handler: (handler: unknown) => handler }), handler: (handler: unknown) => handler }),
}));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => ({}) }));
vi.mock("@/modules/identity/command-context.server", () => ({
  getCommandContext: async () => ({ role: "student", actorPersonId: "person",
    capabilities: new Set(["assignments:submit"]), scope: { siteIds: ["site"], programIds: ["program"] } }),
}));
vi.mock("@/modules/learning/class-access.server", () => ({
  authorizeClass: async () => ({ studentProfileId: "student" }), accessibleClasses: async () => [],
}));
vi.mock("@/modules/learning/gradebook.functions", () => ({
  createAssessment: vi.fn(), gradeSubmission: vi.fn(), manageAssessment: vi.fn(), returnSubmissionForRevision: vi.fn(),
}));
vi.mock("@/db/client", () => {
  const query = () => {
    const chain: Record<string, unknown> = {};
    for (const method of ["from", "innerJoin", "where"]) chain[method] = () => chain;
    chain.limit = async () => [state.assessment];
    return chain;
  };
  return { db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: "student" }] }) }) }),
    transaction: async (fn: (tx: unknown) => unknown) => fn({
      select: query, execute: async () => {}, insert: state.writes, update: state.writes,
    }),
  } };
});
import { saveAssignmentDraft, saveAssignmentResponse } from "@/modules/student-experience/assignments.functions";
beforeEach(() => {
  vi.clearAllMocks();
  state.assessment = { id: "assessment", sectionId: "section", status: "published",
    availableAt: null, closesAt: null, metadata: {} };
});
describe("student write availability", () => {
  for (const [name, fn] of [["draft", saveAssignmentDraft], ["submission", saveAssignmentResponse]] as const) {
    it.each(["unreleased", "closed"])("blocks " + name + " when %s before changing attempts", async reason => {
      if (reason === "unreleased") state.assessment.availableAt = new Date(Date.now() + 60000);
      else state.assessment.closesAt = new Date(Date.now() - 60000);
      await expect((fn as unknown as (arg: unknown) => Promise<unknown>)({
        data: { assessmentId: "assessment", text: "My revised answer" },
      })).rejects.toThrow(reason === "unreleased" ? "not been released" : "closed");
      expect(state.writes).not.toHaveBeenCalled();
    });
  }
});
