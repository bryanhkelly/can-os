import type { PublicParentSchoolProfile, PublicClaim } from "./parent-information";

/** Diagnostic only: this projection cannot grant marketing, legal or
 * admissions authority and never persists parallel website tasks. */
export type PublicInformationCategory =
  | "identity_contact" | "academics" | "school_day" | "activities"
  | "tuition" | "family_services" | "church_story" | "leadership"
  | "legal_disclosures" | "admissions";

export type PublicInformationGap = {
  category: PublicInformationCategory;
  owner: "site_admin" | "church_editor" | "institutional_publisher" |
    "registrar" | "finance" | "operations" | "compliance";
  message: string;
  /** The existing owning workspace, not an invented CMS task route. */
  destination: string;
  required: boolean;
};

export type PublicInformationReadiness = {
  information: "complete" | "incomplete";
  marketing: "published" | "not_published";
  externalHost: "reachable" | "unverified";
  admissions: "authorized" | "not_authorized";
  opening: "confirmed" | "not_confirmed";
  gaps: PublicInformationGap[];
};

function visible<T>(claim: PublicClaim<T>): boolean {
  return claim.canDisplay && claim.audience === "public" &&
    (claim.status === "verified" || claim.status === "available") &&
    claim.value !== null;
}

/** All operational gates must be passed independently as authoritative,
 * server-derived inputs; a complete site profile never sets them true. */
export function projectPublicInformationReadiness(input: {
  profile: PublicParentSchoolProfile;
  /** Optional authenticated scope for real existing editor/review routes. */
  siteId?: string;
  marketingPublished: boolean;
  externalHostReachable: boolean;
  admissionsAuthorized: boolean;
  openingConfirmed: boolean;
}): PublicInformationReadiness {
  const p = input.profile;
  const siteEditor = input.siteId ? `/sites/${encodeURIComponent(input.siteId)}/parent-information` : "/sites";
  const institutionalPublisher = input.siteId ? `/sites/${encodeURIComponent(input.siteId)}/publish` : "/sites";
  const siteSetup = input.siteId ? `/sites/${encodeURIComponent(input.siteId)}` : "/sites";
  const scheduleReview = "/operations/school-years";
  const gaps: PublicInformationGap[] = [];
  const missing = (category:PublicInformationCategory, owner:PublicInformationGap["owner"],
    message:string, destination:string, required:boolean) =>
    gaps.push({category,owner,message,destination,required});

  if (!visible(p.site.name) || !visible(p.site.organizationName))
    missing("identity_contact","site_admin","Confirm the published school and partner names.",
      siteSetup,true);
  if (!visible(p.site.address))
    missing("identity_contact","institutional_publisher",
      "Review this Site's public-facing location separately from its private legal/physical address.",
      siteEditor,true);
  if (!visible(p.site.contact))
    missing("identity_contact","institutional_publisher",
      "Approve an explicit school-controlled public contact; the draft Site contact is not public consent.",
      siteEditor,true);
  if (!p.academics.some(program => visible(program.title) && visible(program.grades)))
    missing("academics","institutional_publisher","Review and publish an academic Program.",
      "/sites",true);
  for (const program of p.academics) {
    if (!visible(program.title)) continue;
    const approved = p.programSchedules.some(schedule =>
      schedule.programId === program.programId &&
      visible(schedule.name) && schedule.name.value === program.title.value &&
      visible(schedule.grades) &&
      schedule.grades.value?.min === program.grades.value?.min &&
      schedule.grades.value?.max === program.grades.value?.max &&
      visible(schedule.weeklyPattern) &&
      schedule.weeklyPattern.value!.length > 0);
    if (!approved) missing("school_day","operations",
      `Review the current instructional days and times for ${program.title.value}; Sunday is permitted.`,
      scheduleReview,true);
  }
  if (!p.activities.length)
    missing("activities","operations","Add reviewed student activities when offered.",
      "/operations",false);
  if (!visible(p.tuition.description))
    missing("tuition","finance",
      "An institutionally approved, current tuition/fee statement is missing; do not invent a price.",
      "/admissions",true);
  if (!visible(p.tuition.financialAid))
    missing("tuition","finance",
      "Financial assistance eligibility or availability is not yet approved; offer an information request.",
      "/admissions",false);
  if (!p.services.some(item => visible(item.description)))
    missing("family_services","institutional_publisher","Review available meals, transportation, care and family visit services.",
      institutionalPublisher,false);
  if (!visible(p.churchStory))
    missing("church_story","church_editor","Publish the church's reviewed local story.",
      "/site-website",false);
  if (!p.people.length)
    missing("leadership","institutional_publisher",
      "Optional public introductions require current self-consent, active Site assignment and exact-content institutional review.",
      institutionalPublisher,false);
  if (!p.disclosures.some(item => visible(item.statement)))
    missing("legal_disclosures","compliance",
      "Review applicable public legal statements for this Site's operating model.",
      "/operations/jurisdiction-profiles",true);
  if (!visible(p.admissions.description))
    missing("admissions","registrar",
      "No Program has verified application-start authority. Keep the request-information path distinct from Apply.",
      "/admissions",false);

  return {
    information: gaps.some(gap=>gap.required) ? "incomplete" : "complete",
    marketing: input.marketingPublished ? "published" : "not_published",
    externalHost: input.externalHostReachable ? "reachable" : "unverified",
    admissions: input.admissionsAuthorized ? "authorized" : "not_authorized",
    opening: input.openingConfirmed ? "confirmed" : "not_confirmed",
    gaps,
  };
}
