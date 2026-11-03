import { jurisdictionProfileSchema } from "./jurisdiction-profile";

/**
 * Informational launch projection of a jurisdiction profile.
 * Draft and in-review content must NEVER be treated as effective regulation,
 * automatically create compliance obligations, or clear opening readiness.
 */
export type LaunchJurisdictionResearch = {
  summary: string;
  reviewStatus: "draft" | "in_review" | "published";
  guidanceStatus: "research_only" | "verified_guidance";
  revision: number;
  publishedAt: string | null;
  fundingPrograms: Array<{
    id: string; name: string; summary: string;
    eligibilityStatus: "verified" | "conditional" | "under_review" | "unknown";
    sources: Array<{ title: string; url: string; authority: string; checkedAt: string }>;
  }>;
  investigationItems: Array<{
    id: string; title: string; description: string;
    responsibleParty: "can" | "church" | "family";
    phase: "before_opening" | "before_enrollment" | "follow_up";
    sources: Array<{ title: string; url: string; authority: string; checkedAt: string }>;
  }>;
  sources: Array<{ title: string; url: string; authority: string; checkedAt: string }>;
};

type ProfileRow = {
  profile: unknown;
  summary: string;
  evidence: unknown;
  status: string;
  revision: number;
  publishedAt: Date | string | null;
};

export function projectLaunchJurisdictionResearch(
  row: ProfileRow,
  verifiedGuidance: boolean,
): LaunchJurisdictionResearch | null {
  if (!["draft", "in_review", "published"].includes(row.status)) return null;
  const parsed = jurisdictionProfileSchema.safeParse({
    ...((row.profile && typeof row.profile === "object" && !Array.isArray(row.profile)) ? row.profile : {}),
    summary: row.summary,
    evidence: row.evidence,
  });
  if (!parsed.success) return null;
  const profile = parsed.data;
  // No research details go to a school operator without an authoritative source.
  // A verified publication can still provide its summary if it has been approved.
  if (!verifiedGuidance && profile.evidence.length === 0) return null;
  const safeSources = profile.evidence.filter(source => source.url.startsWith("https://"));
  const sourceFor = (ids: string[]) =>
    safeSources.filter(source => ids.includes(source.url));
  return {
    summary: profile.summary,
    reviewStatus: row.status as LaunchJurisdictionResearch["reviewStatus"],
    guidanceStatus: verifiedGuidance ? "verified_guidance" : "research_only",
    revision: row.revision,
    publishedAt: verifiedGuidance && row.publishedAt ? new Date(row.publishedAt).toISOString() : null,
    fundingPrograms: profile.fundingPrograms.map(program => ({
      id: program.id,
      name: program.name,
      summary: program.summary,
      // A funding field cannot imply CAN eligibility simply because a draft says verified.
      eligibilityStatus: verifiedGuidance ? program.eligibilityStatus : "under_review" as const,
      sources: sourceFor(program.evidenceIds),
    })),
    investigationItems: profile.requirements.filter(requirement =>
      requirement.disclosureAudience === "public_required" ||
      requirement.disclosureAudience === "public_optional"
    ).map(requirement => ({
      id: requirement.id,
      title: requirement.title,
      description: requirement.description,
      responsibleParty: requirement.responsibleParty,
      phase: requirement.phase,
      sources: sourceFor(requirement.evidenceIds),
    })),
    sources: safeSources,
  };
}
