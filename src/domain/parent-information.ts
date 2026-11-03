import { z } from "zod";
import type { PublicAcademicProgram } from "./academic-program-publication";
import type { SiteLocalContent } from "./site-local-content";
import type { PublicSitePerson } from "./public-site-people";

/**
 * PX-002–004: public information is a projection of approved source records,
 * never an editable parent-facing store. No student, staff or household IDs.
 */
export const parentClaimStatusSchema = z.enum([
  "not_configured", "planned", "verified", "available",
  "not_offered", "withdrawn", "stale",
]);
export const parentClaimAudienceSchema = z.enum([
  "public", "authenticated_family", "on_request", "internal",
]);
export type ParentClaimStatus = z.infer<typeof parentClaimStatusSchema>;
export type ParentClaimAudience = z.infer<typeof parentClaimAudienceSchema>;

export const publicClaimSchema = <T extends z.ZodTypeAny>(value: T) =>
  z.object({
    value: value.nullable(),
    source: z.enum([
      "site_publication", "organization_site", "program_publication",
      "site_local_content", "enrichment_catalog", "institutional_record",
      "calendar", "jurisdiction_profile", "admissions",
    ]).nullable(),
    revision: z.number().int().nonnegative().nullable(),
    audience: parentClaimAudienceSchema,
    status: parentClaimStatusSchema,
    /** Set by the server-side owning adapter, never by a browser or editor. */
    canDisplay: z.boolean(),
  }).strict().superRefine((claim, ctx) => {
    if (claim.canDisplay && (claim.value === null ||
      claim.audience !== "public" ||
      !["verified", "available"].includes(claim.status) ||
      claim.source === null)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom,
        message: "Displayable public claims require a public, approved source and value" });
    }
  });

export type PublicClaim<T> = {
  value: T | null;
  source: "site_publication" | "organization_site" | "program_publication" |
    "site_local_content" | "enrichment_catalog" | "institutional_record" |
    "calendar" | "jurisdiction_profile" | "admissions" | null;
  revision: number | null;
  audience: ParentClaimAudience;
  status: ParentClaimStatus;
  canDisplay: boolean;
};

export type PublicSchoolIdentity = {
  name: PublicClaim<string>;
  organizationName: PublicClaim<string>;
  address: PublicClaim<string>;
  contact: PublicClaim<string>;
};
export type PublicAcademicSummary = {
  title: PublicClaim<string>;
  summary: PublicClaim<string>;
  grades: PublicClaim<{ min: string; max: string }>;
  delivery: PublicClaim<PublicAcademicProgram["delivery"]>;
  availability: "planned" | "operating"; // marketing label, NOT authorization
};
export type PublicSchoolDay = {
  days: PublicClaim<readonly number[]>; // 0 = Sunday, 6 = Saturday
  startTime: PublicClaim<string>;
  endTime: PublicClaim<string>;
  mode: PublicClaim<"onsite" | "online" | "hybrid">;
};
/** Public Program ID is already used by the published application destination.
 * This never contains staff/student IDs or internal schedule-template IDs. */
export type PublicProgramWeeklyPeriod = {
  dayOfWeek: number; // Sunday 0 through Saturday 6
  startsAtLocal: string;
  endsAtLocal: string;
  timezone: string;
};
export type PublicProgramSchoolDay = {
  programId: string;
  name: PublicClaim<string>;
  grades: PublicClaim<{ min: string; max: string }>;
  timezone: PublicClaim<string>;
  effectiveFrom: PublicClaim<string>;
  effectiveThrough: PublicClaim<string>;
  weeklyPattern: PublicClaim<readonly PublicProgramWeeklyPeriod[]>;
};
export type PublicActivitySummary = {
  title: PublicClaim<string>;
  season: PublicClaim<string>;
  dates: PublicClaim<{ startsOn: string; endsOn: string }>;
  registrationOpen: boolean; // enrichment gate, not academic admissions
};
export type PublicSchoolService = {
  category: "meals" | "transportation" | "before_care" | "after_care" |
    "communication" | "family_visits" | "safety_summary";
  description: PublicClaim<string>;
};
export type PublicTuitionSummary = {
  description: PublicClaim<string>;
  financialAid: PublicClaim<string>;
};
export type PublicProgramAdmissions = {
  programId: string;
  /** Pre-opening inquiry is not an application, waitlist or booked session. */
  status: "verified_application" | "preopening_inquiry" | "information_only";
  /** Never true merely because a family may ask for a tour. */
  informationSessionInterestAvailable?: boolean;
  description: PublicClaim<string>;
};
export type PublicAdmissionsState = {
  /** True only if at least one published Program passed the current intake command gate. */
  applicationOpen: boolean;
  description: PublicClaim<string>;
  /** Site-wide applicationOpen is legacy only; never imply every Program is open. */
  programs?: PublicProgramAdmissions[];
};
export type PublicInstitutionalDisclosure = {
  category: "authorization" | "licensure" | "accreditation" | "jurisdiction";
  statement: PublicClaim<string>;
};
export type PublicParentSchoolProfile = {
  site: PublicSchoolIdentity;
  churchStory: PublicClaim<string>;
  faith: PublicClaim<string>;
  spiritualFormation: PublicClaim<string>;
  academics: PublicAcademicSummary[];
  schoolDay: PublicSchoolDay;
  /** Program-attributed approved seven-day schedules; never flatten multiple Programs. */
  programSchedules: PublicProgramSchoolDay[];
  /** Consent/revision-checked biographies only, with no private person keys. */
  people: PublicSitePerson[];
  activities: PublicActivitySummary[];
  services: PublicSchoolService[];
  tuition: PublicTuitionSummary;
  admissions: PublicAdmissionsState;
  disclosures: PublicInstitutionalDisclosure[];
  familyPortal: PublicClaim<string>;
};

/** An unimplemented domain adapter is not permission to synthesize a fact. */
export function unconfiguredClaim<T>(
  source: PublicClaim<T>["source"] = null,
  audience: ParentClaimAudience = "public",
): PublicClaim<T> {
  return { value: null, source, revision: null, audience,
    status: "not_configured", canDisplay: false };
}

export function verifiedPublicClaim<T>(
  value: T, source: NonNullable<PublicClaim<T>["source"]>,
  revision: number | null = null,
): PublicClaim<T> {
  return { value, source, revision, audience: "public",
    status: "verified", canDisplay: true };
}

export function plannedPublicClaim<T>(
  value: T, source: NonNullable<PublicClaim<T>["source"]>,
): PublicClaim<T> {
  return { value, source, revision: null, audience: "public",
    status: "planned", canDisplay: false };
}

/** A pure adapter: inputs must already have passed their owning domain gates. */
export function projectApprovedParentInformation(input: {
  site: { name: string; organizationName: string };
  academicPrograms: readonly PublicAcademicProgram[];
  localContent: SiteLocalContent | null;
  offerings: readonly {
    title: string; season: string; startsOn: string; endsOn: string;
    registrationOpen: boolean;
  }[];
  /** Optional CAN-reviewed, single-Program schedule. Never infer a Site-wide timetable. */
  schoolDay?: PublicSchoolDay;
  programSchedules?: PublicProgramSchoolDay[];
  people?: PublicSitePerson[];
  /** Institutional approval is separate from draft Site address or contact. */
  publicAddress?: PublicClaim<string>;
  publicContact?: PublicClaim<string>;
  /** Finance/compliance/registrar must already have granted source-specific authority. */
  tuition?: PublicTuitionSummary;
  admissions?: PublicAdmissionsState;
  disclosures?: PublicInstitutionalDisclosure[];
  /** Site-owned services must already be institutionally reviewed and public-safe. */
  services?: PublicSchoolService[];
}): PublicParentSchoolProfile {
  const copy = input.localContent;
  const story = (copy?.localDescription ?? "").trim();
  const faith = (copy?.statementOfFaith ?? "").trim();
  const formation = (copy?.spiritualFormation ?? "").trim();
  const name = input.site.name.trim();
  const organizationName = input.site.organizationName.trim();
  return {
    site: {
      name: name ? verifiedPublicClaim(name, "organization_site") : unconfiguredClaim("organization_site"),
      organizationName: organizationName ? verifiedPublicClaim(organizationName, "organization_site") : unconfiguredClaim("organization_site"),
      address: input.publicAddress ?? unconfiguredClaim("organization_site"),
      contact: input.publicContact ?? unconfiguredClaim("organization_site"),
    },
    churchStory: story ? verifiedPublicClaim(story, "site_local_content") : unconfiguredClaim("site_local_content"),
    faith: faith ? verifiedPublicClaim(faith, "site_local_content") : unconfiguredClaim("site_local_content"),
    spiritualFormation: formation ? verifiedPublicClaim(formation, "site_local_content") : unconfiguredClaim("site_local_content"),
    academics: input.academicPrograms.map(program => ({
      title: verifiedPublicClaim(program.title, "program_publication"),
      summary: verifiedPublicClaim(program.summary, "program_publication"),
      grades: verifiedPublicClaim(program.grades, "program_publication"),
      delivery: verifiedPublicClaim(program.delivery, "program_publication"),
      availability: program.availability,
    })),
    schoolDay: input.schoolDay ?? {
      days: unconfiguredClaim("calendar"),
      startTime: unconfiguredClaim("calendar"),
      endTime: unconfiguredClaim("calendar"),
      mode: unconfiguredClaim("calendar"),
    },
    programSchedules: (input.programSchedules ?? []).filter(schedule =>
      schedule.weeklyPattern.canDisplay &&
      schedule.weeklyPattern.audience === "public" &&
      schedule.weeklyPattern.status === "verified" &&
      schedule.weeklyPattern.value !== null &&
      input.academicPrograms.some(program => program.programId === schedule.programId &&
        schedule.name.value === program.title &&
        schedule.grades.value?.min === program.grades.min &&
        schedule.grades.value?.max === program.grades.max)),
    people: input.people ?? [],
    activities: input.offerings.map(activity => ({
      title: verifiedPublicClaim(activity.title, "enrichment_catalog"),
      season: verifiedPublicClaim(activity.season, "enrichment_catalog"),
      dates: verifiedPublicClaim({
        startsOn: activity.startsOn, endsOn: activity.endsOn,
      }, "enrichment_catalog"),
      registrationOpen: activity.registrationOpen,
    })),
    services: input.services ?? (["meals", "transportation", "before_care", "after_care", "communication", "family_visits", "safety_summary"] as const)
      .map(category => ({ category, description: unconfiguredClaim<string>("institutional_record") })),
    tuition: input.tuition ?? {
      description: unconfiguredClaim("institutional_record"),
      financialAid: unconfiguredClaim("institutional_record"),
    },
    admissions: input.admissions ?? {
      // Never synthesize opening authority from a published marketing record.
      applicationOpen: false,
      description: unconfiguredClaim("admissions"),
    },
    disclosures: input.disclosures ?? (["authorization", "licensure", "accreditation", "jurisdiction"] as const)
      .map(category => ({ category, statement: unconfiguredClaim<string>("jurisdiction_profile") })),
    familyPortal: unconfiguredClaim("admissions", "authenticated_family"),
  };
}
