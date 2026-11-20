/**
 * A launch recommendation is a navigation hint derived from independently
 * authorized saved records, never an operating or enrollment approval.
 * Missing and unavailable records are distinct. Do not count visited pages.
 */
export type LaunchOverviewSource<T> =
  | { state: "ready"; value: T }
  | { state: "unavailable" };

export type LaunchOverviewEvidence = {
  information: LaunchOverviewSource<{ hostingSaved: boolean; environmentSaved: boolean }>;
  programs: LaunchOverviewSource<{ saved: boolean }>;
  brand: LaunchOverviewSource<{ saved: boolean }>;
  marketing: LaunchOverviewSource<{ hasPackages: boolean }>;
  websiteDraftAvailable: boolean;
};

export function launchSiteLifecycleLabel(status: "planning" | "active" | "closed" | null | undefined) {
  if (status === "planning") return "Planning";
  if (status === "active") return "Active Site";
  if (status === "closed") return "Closed Site";
  return "Lifecycle not recorded";
}

export function nextLaunchAction(siteId: string, evidence: LaunchOverviewEvidence) {
  const route = (module: string) => "/launch/site?siteId=" + encodeURIComponent(siteId) + "&module=" + module;
  if (evidence.information.state === "unavailable") {
    return { title: "Review Site Information",
      description: "Saved Site Information could not be verified. Check it before continuing.",
      href: route("site-information") };
  }
  if (!evidence.information.value.hostingSaved || !evidence.information.value.environmentSaved) {
    return { title: "Complete Site Information",
      description: "Save your hosting and learning environment choices.",
      href: route("site-information") };
  }
  if (evidence.programs.state === "unavailable") {
    return { title: "Review Programs & Audiences",
      description: "Saved planning interests could not be verified.",
      href: route("programs-audiences") };
  }
  if (!evidence.programs.value.saved) {
    return { title: "Choose Programs & Audiences",
      description: "Record the types of learning and audiences you want to serve.",
      href: route("programs-audiences") };
  }
  if (evidence.brand.state === "unavailable") {
    return { title: "Review Website & Brand",
      description: "Your saved Site Brand could not be verified.",
      href: route("website-brand") };
  }
  if (!evidence.brand.value.saved || !evidence.websiteDraftAvailable) {
    return { title: "Continue Website & Brand",
      description: "Save a Site Brand and a private website draft. Publishing is separate.",
      href: route("website-brand") };
  }
  if (evidence.marketing.state === "unavailable") {
    return { title: "Review Introduce",
      description: "Saved Marketing Packages could not be verified. No outreach status is inferred.",
      href: route("promote") };
  }
  if (!evidence.marketing.value.hasPackages) {
    return { title: "Prepare a Marketing Package",
      description: "Use your saved Site Brand and Story to introduce your learning community.",
      href: route("promote") };
  }
  return { title: "Explore the Program Catalog",
    description: "Select and privately configure a Solution. Readiness and approval remain independent.",
    href: route("program-catalog") };
}
