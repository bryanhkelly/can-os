import { siteLaunchModules, type SiteLaunchModuleIdV61, type SiteLaunchStageV61 } from "./launch-site-navigation-v61";
import type { LaunchOverviewEvidence } from "./launch-overview-v61";

export type LaunchCompletionState = "complete" | "incomplete" | "unavailable";
export type LaunchModuleCompletion = Partial<Record<SiteLaunchModuleIdV61, LaunchCompletionState>>;

/**
 * Green checks require a saved, authorized Site record. Reading a screen,
 * starting a draft or submitting a Solution for review is not completion.
 * Unverified operational modules deliberately remain unmarked until their
 * owning services provide completion decisions.
 */
export function launchModuleCompletionV61(site: {
  id: string;
  name: string;
  organizationId: string;
  slug: string;
  timezone: string;
  siteIdentityRevision?: string | null;
  websiteDraft: { status: "draft" | "published" } | null;
}, evidence: LaunchOverviewEvidence | null): LaunchModuleCompletion {
  const result: LaunchModuleCompletion = {};
  // Signup or an authorized profile save establishes a Site identity.
  result["site-profile"] = site.id && site.name.trim() && site.organizationId &&
    site.slug && site.timezone && site.siteIdentityRevision ? "complete" : "incomplete";
  if (!evidence) return result;
  result["site-information"] = evidence.information.state === "unavailable"
    ? "unavailable" : evidence.information.value.hostingSaved &&
      evidence.information.value.environmentSaved ? "complete" : "incomplete";
  result["programs-audiences"] = evidence.programs.state === "unavailable"
    ? "unavailable" : evidence.programs.value.saved ? "complete" : "incomplete";
  result["website-brand"] = evidence.brand.state === "unavailable"
    ? "unavailable" : evidence.brand.value.saved && evidence.websiteDraftAvailable
      ? "complete" : "incomplete";

  // An editable package is not proof of completed outreach or an actual event.
  // An unapproved Solution is not a launch-ready Program Catalog selection.
  // Readiness, staffing, opening and enrollment require their own decisions.
  result["publish-site"] = site.websiteDraft?.status === "published"
    ? "complete" : "incomplete";
  return result;
}

export function completedLaunchStageV61(stage: SiteLaunchStageV61,
  modules: LaunchModuleCompletion): boolean {
  const members=siteLaunchModules.filter(item=>item.stage===stage);
  return members.length>0 && members.every(item=>modules[item.id]==="complete");
}
