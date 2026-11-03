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
  marketingPublished: boolean;
  externalHostReachable: boolean;
  admissionsAuthorized: boolean;
  openingConfirmed: boolean;
}): PublicInformationReadiness {
  const p = input.profile;
  const gaps: PublicInformationGap[] = [];
  const missing = (category:PublicInformationCategory, owner:PublicInformationGap["owner"],
    message:string, destination:string, required:boolean) =>
    gaps.push({category,owner,message,destination,required});

  if (!visible(p.site.name) || !visible(p.site.organizationName))
    missing("identity_contact","site_admin","Confirm the public school and partner identity.",
      "/site-website",true);
  if (!visible(p.site.contact))
    missing("identity_contact","site_admin","Add a verified public contact channel.",
      "/site-website",true);
  if (!p.academics.some(program => visible(program.title) && visible(program.grades)))
    missing("academics","institutional_publisher","Review and publish an academic Program.",
      "/sites",true);
  if (!visible(p.schoolDay.days) || !visible(p.schoolDay.startTime) || !visible(p.schoolDay.endTime))
    missing("school_day","operations","Publish the approved school-day schedule.",
      "/operations",false);
  if (!p.activities.length)
    missing("activities","operations","Add reviewed student activities when offered.",
      "/activities",false);
  if (!visible(p.tuition.description))
    missing("tuition","finance","Approve tuition details, or keep prices hidden and route families to admissions.",
      "/finance",false);
  if (!p.services.some(item => visible(item.description)))
    missing("family_services","operations","Confirm optional meals, transportation, or care services.",
      "/operations",false);
  if (!visible(p.churchStory))
    missing("church_story","church_editor","Add your church's reviewed story.",
      "/site-website",false);
  // Public biographies are not in the approved parent-information contract.
  // Never infer staff consent or make their names a publication requirement.
  missing("leadership","institutional_publisher",
    "Publish leadership introductions only after public consent and review.",
    "/site-website",false);
  if (!p.disclosures.some(item => visible(item.statement)))
    missing("legal_disclosures","compliance",
      "Review applicable public legal statements for this Site's operating model.",
      "/operations/jurisdiction-profiles",true);
  if (!visible(p.admissions.description))
    missing("admissions","registrar",
      "Approve a source-backed admissions description and opening state.",
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
