import { describe, expect, it } from "vitest";
import {
  assertChurchLocalInvitationOrganization, localStaffInviteInput, staffOnboardingState,
} from "@/domain/staff-onboarding-policy";

const siteId = "11111111-1111-4111-8111-111111111111";
const invitation = {
  email: "director@example.test", firstName: "Local", lastName: "Director",
  role: "site_leader", siteId,
};

describe("church-local staff invitation policy", () => {
  it.each(["network_admin", "can_network_steward", "student", "guardian"])(
    "rejects institutional or non-staff role %s", role => {
      expect(localStaffInviteInput.safeParse({ ...invitation, role }).success).toBe(false);
    },
  );

  it("requires an exact Site and rejects a CAN-network inviter organization", () => {
    expect(localStaffInviteInput.safeParse({ ...invitation, siteId: undefined }).success).toBe(false);
    expect(() => assertChurchLocalInvitationOrganization("can_network")).toThrow(/separate, independently authorized/);
    expect(() => assertChurchLocalInvitationOrganization("church")).not.toThrow();
  });
});

describe("visible staff onboarding readiness", () => {
  const accepted = {
    active: true, invitationPending: false, emailVerified: true,
    role: "room_facilitator", screeningCurrent: false, trainingCurrent: false,
    hasQualificationClaims: false,
  };

  it("keeps an unaccepted exact-site invitation visibly pending", () => {
    expect(staffOnboardingState({ ...accepted, active: false, invitationPending: true, emailVerified: false })).toMatchObject({
      status: "invited", accepted: false, nextAction: "accept_invitation",
    });
  });

  it("distinguishes accepted staff who still need evidence or independent review", () => {
    expect(staffOnboardingState(accepted)).toMatchObject({
      status: "needs_action", accepted: true, nextAction: "submit_qualifications",
    });
    expect(staffOnboardingState({ ...accepted, hasQualificationClaims: true })).toMatchObject({
      status: "needs_action", nextAction: "await_qualification_review",
    });
  });

  it("shows qualified only when both canonical safety evidence types are current", () => {
    expect(staffOnboardingState({ ...accepted, screeningCurrent: true, hasQualificationClaims: true }).status).toBe("needs_action");
    expect(staffOnboardingState({ ...accepted, screeningCurrent: true, trainingCurrent: true, hasQualificationClaims: true })).toMatchObject({
      status: "qualified", qualificationStatus: "qualified", nextAction: "none",
    });
  });

  it("does not impose onsite evidence requirements on other accepted local staff", () => {
    expect(staffOnboardingState({ ...accepted, role: "teacher" })).toMatchObject({
      status: "accepted", qualificationStatus: "not_required",
    });
  });
});
