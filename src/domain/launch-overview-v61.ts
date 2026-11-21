/**
 * A launch recommendation is a navigation hint derived from independently
 * authorized saved records, never an operating or enrollment approval.
 * Missing and unavailable records are distinct. Do not count visited pages.
 */
export type LaunchOverviewSource<T> =
  | { state: "ready"; value: T }
  | { state: "unavailable" };

export type LaunchOverviewEvidence = {
  information: LaunchOverviewSource<{ identitySaved?: boolean; hostingSaved: boolean; environmentSaved: boolean }>;
  programs: LaunchOverviewSource<{ saved: boolean }>;
  brand: LaunchOverviewSource<{ saved: boolean }>;
  marketing: LaunchOverviewSource<{ hasPackages: boolean }>;
  /** Private, authorized Site-owned plans. Not qualification or opening approval. */
  solutions?: LaunchOverviewSource<{ plans: readonly {
    configurationId: string; lifecycle: "draft" | "frozen";
  }[] }>;
  websiteDraftAvailable: boolean;
  /** An actual versioned Site website-copy record, not merely a reserved host. */
  websiteContentSaved?: boolean;
};

export function launchSiteLifecycleLabel(status: "planning" | "active" | "closed" | null | undefined) {
  if (status === "planning") return "Planning";
  if (status === "active") return "Active Site";
  if (status === "closed") return "Closed Site";
  return "Lifecycle not recorded";
}

export function nextLaunchAction(siteId: string, evidence: LaunchOverviewEvidence,
  lifecycleStatus?: "planning" | "active" | "closed" | null) {
  // Closed Sites may retain historical drafts. Never present those as work
  // that can be reopened or make enrollment-ready without a new authorization.
  if (lifecycleStatus === "closed") {
    return { title: "Review Closed Site",
      description: "This site is closed. Review its information before deciding what to do next.",
      href: "/sites/" + encodeURIComponent(siteId) };
  }
  const route = (module: string) => "/launch/site?siteId=" + encodeURIComponent(siteId) + "&module=" + module;
  if (evidence.information.state === "unavailable") {
    return { title: "Review Site Information",
      description: "We couldn't load your Site Information. Check it before continuing.",
      href: route("site-information") };
  }
  if (evidence.information.value.identitySaved === false || !evidence.information.value.hostingSaved || !evidence.information.value.environmentSaved) {
    return { title: "Complete Site Information",
      description: "Describe your Site identity, hosting and learning environment."
      href: route("site-information") };
  }
  if (evidence.programs.state === "unavailable") {
    return { title: "Review Programs & Audiences",
      description: "We couldn't load your saved program ideas. Try again before making changes.",
      href: route("programs-audiences") };
  }
  if (!evidence.programs.value.saved) {
    return { title: "Choose Programs & Audiences",
      description: "Record the types of learning and audiences you want to serve.",
      href: route("programs-audiences") };
  }
  if (evidence.brand.state === "unavailable") {
    return { title: "Review Website & Brand",
      description: "We couldn't load your saved brand. Check Website & Brand before continuing.",
      href: route("website-brand") };
  }
  if (!evidence.brand.value.saved || !evidence.websiteDraftAvailable ||
      !evidence.websiteContentSaved) {
    return { title: "Continue Website & Brand",
      description: "Save your brand and a private website draft. You can publish the website later.",
      href: route("website-brand") };
  }
  if (evidence.marketing.state === "unavailable") {
    return { title: "Review Introduce",
      description: "We couldn't load your saved outreach plans. Try again before editing or creating materials.",
      href: route("create-outreach") };
  }
  if (!evidence.marketing.value.hasPackages) {
    return { title: "Create an Outreach Plan",
      description: "Choose who to reach and create a message using your saved brand and story.",
      href: route("create-outreach") };
  }
  if (evidence.solutions?.state === "unavailable") {
    return { title: "Review Program Catalog",
      description: "We couldn't load your solution plans. Check them before continuing.",
      href: route("program-catalog") };
  }
  if (evidence.solutions?.state === "ready") {
    const plans = evidence.solutions.value.plans;
    if (plans.length === 1) {
      const plan = plans[0]!;
      return {
        title: plan.lifecycle === "draft" ? "Continue Solution Plan" : "Review Submitted Solution",
        description: plan.lifecycle === "draft"
          ? "Continue building your saved solution plan."
          : "Check your submitted solution plan and its review decision.",
        href: route("program-catalog") + "&solutionPlanId=" +
          encodeURIComponent(plan.configurationId),
      };
    }
    if (plans.length > 1) {
      return { title: "Continue Preparing Solutions",
        description: "Open Program Catalog and choose a saved plan to continue.",
        href: route("program-catalog") };
    }
  }
  return { title: "Explore the Program Catalog",
    description: "Explore available solutions and choose one to plan for your community.",
    href: route("program-catalog") };
}
