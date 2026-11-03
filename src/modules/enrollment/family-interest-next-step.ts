/**
 * Registrar-facing family next step derived exclusively from authoritative
 * scoped records returned by the canonical admissions inbox. No marketing
 * publication, invitation delivery, guardianship or attendance is inferred.
 * This is a read model, not a workflow or authorization decision.
 */
export type FamilyInterestNextStep = {
  state: "closed" | "follow_up" | "await_admissions" | "invite_to_apply" |
    "await_email_verification" | "await_application" | "review_application" |
    "await_guardian_offer" | "activate_enrollment" | "assign_class" |
    "student_access" | "first_day_preparation";
  owner: "registrar" | "guardian" | "school";
  message: string;
};

export function familyInterestNextStep(input: {
  interestStatus: string;
  consented: boolean;
  admissionsAuthorized: boolean;
  canInvite: boolean;
  hasFamilyStartRequest: boolean;
  emailVerified: boolean;
  hasApplication: boolean;
  latestOfferStatus: string | null;
  activeEnrollment: boolean;
  placedInClass: boolean;
  studentAccessStatus: string | null;
}): FamilyInterestNextStep {
  if (input.activeEnrollment) {
    if (!input.placedInClass) return {
      state: "assign_class", owner: "school",
      message: "Enrollment is active for the linked offer year. The school must assign a staffed instructional class.",
    };
    if (input.studentAccessStatus !== "approved") return {
      state: "student_access", owner: "guardian",
      message: "Class placement is active. Separate guardian consent and approved student sign-in are still required.",
    };
    return {
      state: "first_day_preparation", owner: "school",
      message: "Enrollment, class placement and student sign-in are recorded. Confirm actual onsite scheduling and safe arrival separately.",
    };
  }
  if (input.hasApplication) {
    if (input.latestOfferStatus === "accepted") return {
      state: "activate_enrollment", owner: "registrar",
      message: "The guardian accepted an offer. Registrar activation for the correct school year and staffed class remains.",
    };
    if (input.latestOfferStatus === "issued") return {
      state: "await_guardian_offer", owner: "guardian",
      message: "An offer was issued. Await the verified guardian's response; issuance alone is not enrollment.",
    };
    return {
      state: "review_application", owner: "registrar",
      message: "Review the actual application stage, eligibility, requirements and offer decision.",
    };
  }
  if (input.interestStatus === "closed" || input.interestStatus === "converted") return {
    state: "closed", owner: "registrar",
    message: "This interest has been closed or converted. Use linked records for any later family actions.",
  };
  if (!input.consented) return {
    state: "follow_up", owner: "registrar",
    message: "No affirmative adult contact consent is recorded. Do not initiate unsolicited follow-up.",
  };
  if (!input.admissionsAuthorized) return {
    state: "await_admissions", owner: "school",
    message: "Interest is recorded. Formal application invitations require CAN admissions authorization.",
  };
  if (input.emailVerified) return {
    state: "await_application", owner: "guardian",
    message: "Email verification was recorded, but an application is not yet linked. Email verification does not prove guardianship.",
  };
  if (input.canInvite) return {
    state: "invite_to_apply", owner: "registrar",
    message: input.hasFamilyStartRequest
      ? "The previous verification link expired. Registrar may request a new verified-email invitation."
      : "Registrar may request a verified-email application invitation for this consented family.",
  };
  if (input.hasFamilyStartRequest) return {
    state: "await_email_verification", owner: "guardian",
    message: "A verification invitation was requested. Await the family's verified response; provider acceptance is not delivery.",
  };
  return {
    state: "follow_up", owner: "registrar",
    message: "Review this family's inquiry and consent in the registrar follow-up queue.",
  };
}
