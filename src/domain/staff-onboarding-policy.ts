import { z } from "zod";
import { AuthorizationError } from "@/domain/command-context";

/** Church-local administration can never appoint CAN institutional/network staff. */
export const localStaffInviteRoles = [
  "teacher", "registrar", "specialist", "counselor", "room_facilitator",
  "site_staff", "site_leader", "paraeducator", "safeguarding_responder", "safeguarding_lead",
  "site_website_editor",
] as const;

export const localStaffInviteInput = z.object({
  email: z.string().trim().email(),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  role: z.enum(localStaffInviteRoles),
  /** Local onboarding never creates organization-wide or sibling-Site access. */
  siteId: z.string().uuid(),
}).strict();

export type LocalStaffInviteInput = z.infer<typeof localStaffInviteInput>;

const onsiteCredentialRoles = new Set(["room_facilitator", "site_leader", "site_staff"]);

export function assertChurchLocalInvitationOrganization(organizationType: string): void {
  if (organizationType === "can_network") {
    throw new AuthorizationError("CAN institutional staff require separate, independently authorized appointment");
  }
}

export type StaffOnboardingState = {
  status: "invited" | "accepted" | "qualified" | "needs_action" | "inactive";
  accepted: boolean;
  qualificationStatus: "not_required" | "pending" | "qualified";
  nextAction: "accept_invitation" | "submit_qualifications" | "await_qualification_review" | "none" | "restore_access";
};

/**
 * Project invitation and independently reviewed evidence into visible readiness.
 * Qualification booleans must come from the canonical evidence reader; an
 * approved role or uploaded document alone is not qualified onsite staff.
 */
export function staffOnboardingState(input: {
  active: boolean;
  invitationPending: boolean;
  emailVerified: boolean;
  role: string;
  screeningCurrent: boolean;
  trainingCurrent: boolean;
  hasQualificationClaims: boolean;
}): StaffOnboardingState {
  if (!input.active && !input.invitationPending) {
    return { status: "inactive", accepted: false, qualificationStatus: "not_required", nextAction: "restore_access" };
  }
  if (input.invitationPending || !input.emailVerified) {
    return { status: "invited", accepted: false, qualificationStatus: onsiteCredentialRoles.has(input.role) ? "pending" : "not_required", nextAction: "accept_invitation" };
  }
  if (!onsiteCredentialRoles.has(input.role)) {
    return { status: "accepted", accepted: true, qualificationStatus: "not_required", nextAction: "none" };
  }
  if (input.screeningCurrent && input.trainingCurrent) {
    return { status: "qualified", accepted: true, qualificationStatus: "qualified", nextAction: "none" };
  }
  return {
    status: "needs_action",
    accepted: true,
    qualificationStatus: "pending",
    nextAction: input.hasQualificationClaims ? "await_qualification_review" : "submit_qualifications",
  };
}
