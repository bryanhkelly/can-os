import { describe, expect, it, vi } from "vitest";
import { createWatch } from "@/platform/agent/tools";

const academic = vi.hoisted(() => ({ assertStudentAccess: vi.fn() }));

vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/platform/subscriptions/preferences", () => ({
  getNotificationPreferences: vi.fn(),
}));
vi.mock("@/modules/learning/academic-domain-api", () => ({
  resolveVisibleStudents: vi.fn(),
  assertStudentAccess: academic.assertStudentAccess,
  assertGuardianAcademicAccess: vi.fn(),
  getStudentAcademicSummary: vi.fn(),
}));

const context = { actorPersonId: "guardian-1" } as never;
const tx = {} as never;

describe("createWatch event type validation", () => {
  it("rejects event types with no registered subscription policy", async () => {
    await expect(
      createWatch.execute(context, { studentProfileId: "s1", eventTypes: ["GradePosted"] }, tx),
    ).rejects.toThrow("Unsupported watch event type(s): GradePosted");
    expect(academic.assertStudentAccess).not.toHaveBeenCalled();
  });

  it("rejects an explicit empty event type list", async () => {
    await expect(
      createWatch.execute(context, { studentProfileId: "s1", eventTypes: [] }, tx),
    ).rejects.toThrow("A watch needs at least one event type");
    expect(academic.assertStudentAccess).not.toHaveBeenCalled();
  });

  it("accepts the registered AssignmentBecameMissing event type", async () => {
    academic.assertStudentAccess.mockRejectedValueOnce(new Error("sentinel: validation passed"));
    await expect(
      createWatch.execute(context, { studentProfileId: "s1", eventTypes: ["AssignmentBecameMissing"] }, tx),
    ).rejects.toThrow("sentinel: validation passed");
  });
});
