import type { PublicAcademicProgram } from "./academic-program-publication";

/** Public buttons are navigation affordances, never authorization tokens.
 * Actual opening and admission rules are checked again by server commands. */
export type PublicFamilyCtaState =
  | "request_information" | "interest_list" | "request_visit" | "apply"
  | "register_enrichment" | "closed" | "unavailable";

export type PublicFamilyCta = {
  state: PublicFamilyCtaState;
  label: string;
  reason: string;
  /** Internal public-host destination only; never a privileged CAN OS route. */
  destination: "/apply" | "/inquiry" | null;
};

export type AcademicCtaContext = {
  /** An accepted and currently published academic snapshot is required. */
  program: PublicAcademicProgram | null;
  /** Visit interest is distinct from a confirmed scheduled tour. */
  visitInterestAvailable?: boolean;
  /** An independently confirmed, program-specific application opening. */
  intakeEligible?: boolean;
  /** Site marketing authority; unrelated to opening school or admissions. */
  marketingPublished: boolean;
  /** Whether a prospective family may submit ordinary contact interest. */
  informationRequestsAvailable?: boolean;
  /** A source-backed intake reason (e.g. closed window or full capacity). */
  unavailableReason?: string;
};

/** Fail closed on missing admissions eligibility, even if a Program looks active.
 * The caller must obtain intakeEligible from canonical year/window/capacity and
 * authority checks, never from a marketing editor or static content flag. */
export function academicFamilyCta(input: AcademicCtaContext): PublicFamilyCta {
  if (!input.marketingPublished || !input.program) {
    return {
      state: "unavailable", label: "Not available",
      reason: "This school's public program details are not currently approved.",
      destination: null,
    };
  }
  if (input.program.applicationOpen === true && input.intakeEligible === true) {
    return {
      state: "apply", label: "Verify email to apply",
      reason: "Applications are currently eligible. Guardian verification and a school decision are still required.",
      destination: "/apply",
    };
  }
  if (input.informationRequestsAvailable !== false) {
    return {
      state: "request_information", label: "Request information",
      reason: input.unavailableReason ??
        (input.program.availability === "planned"
          ? "This program is planned; school applications are not yet open."
          : "Applications are not currently available through this school website."),
      destination: "/inquiry",
    };
  }
  return {
    state: "closed", label: "Applications unavailable",
    reason: input.unavailableReason ?? "This program is not currently accepting requests.",
    destination: null,
  };
}
