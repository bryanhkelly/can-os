import { describe, expect, it } from "vitest";
import {
  familyInvitationDraftIssues, type FamilyInvitationDraft,
} from "../../src/components/admissions/FamilyInvitationForm";

const authorized = [{id:"program-a"},{id:"program-b"}];
const draft:FamilyInvitationDraft = {
  programId:"program-a",contacts:"Alex,alex@example.com",
  subject:"Learn about our community",
  introduction:"We are exploring learning opportunities for our neighbors.",
};

describe("Launch family invitation validation", () => {
  it("passes a complete authorized Program draft", () => {
    expect(Object.values(familyInvitationDraftIssues(draft,authorized)).filter(Boolean)).toEqual([]);
  });

  it("rejects a different Site's Program even when a stale ID is in the draft", () => {
    expect(familyInvitationDraftIssues({...draft,programId:"other-site-program"},authorized).program)
      .toBe("Choose an eligible Program.");
    expect(familyInvitationDraftIssues(draft,[]).program).toBe("Choose an eligible Program.");
  });

  it("rejects missing contacts, subject and introduction on the first submit", () => {
    const errors = familyInvitationDraftIssues({
      ...draft,contacts:" ",subject:"No",introduction:"  ",
    },authorized);
    expect(errors.contacts).toBeTruthy();
    expect(errors.subject).toBeTruthy();
    expect(errors.introduction).toBeTruthy();
  });
});
