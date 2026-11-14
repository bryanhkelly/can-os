import { describe, expect, it } from "vitest";
import { existingMissingWorkFollowUpResponse } from "@/domain/missing-work-follow-up-ownership";

describe("teacher-owned missing-work Action visibility", () => {
  it("returns the persisted Action ID only to its owner", () => {
    expect(existingMissingWorkFollowUpResponse(
      { id: "owned-action", ownerPersonId: "teacher-one" }, "teacher-one",
    )).toEqual({
      actionId: "owned-action", created: false, assignedToAnotherTeacher: false,
    });
  });

  it("does not disclose a colleague-owned Action ID", () => {
    const response=existingMissingWorkFollowUpResponse(
      { id: "private-colleague-action", ownerPersonId: "teacher-two" },
      "teacher-one",
    );
    expect(response).toEqual({
      actionId: null, created: false, assignedToAnotherTeacher: true,
    });
    expect(JSON.stringify(response)).not.toContain("private-colleague-action");
  });

  it("does not disclose an unassigned private Action ID", () => {
    expect(existingMissingWorkFollowUpResponse(
      { id: "unassigned-action", ownerPersonId: null }, "teacher-one",
    )).toMatchObject({ actionId: null, assignedToAnotherTeacher: true });
  });
});
