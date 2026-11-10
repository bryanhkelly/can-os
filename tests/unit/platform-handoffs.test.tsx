import { beforeEach, describe, expect, it, vi } from "vitest";
import { AssignmentConversation } from "@/components/learning/AssignmentConversation";
import { handleAcademicInterventionEvent } from "@/modules/learning/missing-assignment-event-handler";
import { assignmentMissingPolicy } from "@/platform/notifications/policies/assignment-missing";
import { EventTypes } from "@/domain/event-types";

const state = vi.hoisted(() => ({
  transaction: vi.fn(), update: vi.fn(), insert: vi.fn(), values: vi.fn(), where: vi.fn(),
  email: vi.fn(),
}));

vi.mock("@/db/client", () => ({ db: { transaction: state.transaction } }));
vi.mock("@/modules/communication/notification-email.server", () => ({
  emailNotificationRecipients: vi.fn(), sendNotificationEmail: state.email,
}));
vi.mock("@/modules/learning/class-communication.functions", () => ({ startAssignmentConversation: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  state.where.mockResolvedValue(undefined);
  state.values.mockReturnValue({ where: state.where });
  state.update.mockReturnValue({ set: state.values });
  state.transaction.mockImplementation(async (work: (tx: unknown) => Promise<void>) => work({
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [{
      id: "missing-event", eventType: EventTypes.AssignmentBecameMissing, status: "pending",
    }] }) }) }),
    update: state.update, insert: state.insert,
  }));
});

describe("canonical workflow handoffs", () => {
  it("completes obsolete missing-work events without insights, notices, or email", async () => {
    const load = vi.spyOn(assignmentMissingPolicy, "load").mockResolvedValueOnce(null);
    try {
      await handleAcademicInterventionEvent("missing-event");
      expect(state.values).toHaveBeenCalledWith({ status: "processed", processedAt: expect.any(Date) });
      expect(state.insert).not.toHaveBeenCalled();
      expect(state.email).not.toHaveBeenCalled();
    } finally {
      load.mockRestore();
    }
  });

  it("isolates message drafts and sent-thread state by assignment and student", () => {
    const first = AssignmentConversation({ assessmentId: "essay", studentPersonId: "first-student" });
    const same = AssignmentConversation({ assessmentId: "essay", studentPersonId: "first-student" });
    const nextStudent = AssignmentConversation({ assessmentId: "essay", studentPersonId: "second-student" });
    const nextAssignment = AssignmentConversation({ assessmentId: "quiz", studentPersonId: "first-student" });
    expect(first.key).toBe(same.key);
    expect(first.key).not.toBe(nextStudent.key);
    expect(first.key).not.toBe(nextAssignment.key);
    expect(first.props).toMatchObject({ assessmentId: "essay", studentPersonId: "first-student" });
  });
});