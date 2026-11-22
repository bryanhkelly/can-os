import { prepareStageModulesV61 } from "@/domain/launch-prepare-v61";

/**
 * Single V6.1 Launch Studio navigation contract.
 * Routes, Site navigation and Overview consume these identifiers, not each other.
 * Authoritative access and readiness still belong to their server services.
 */
export const siteLaunchStagesV61 = ["Shape", "Share", "Prepare", "Launch"] as const;

export const siteLaunchModules = [
  { stage: "Shape", id: "site-profile", title: "Site Profile" },
  { stage: "Shape", id: "site-information", title: "Site Information" },
  { stage: "Shape", id: "programs-audiences", title: "Programs & Audiences" },
  { stage: "Shape", id: "website-brand", title: "Website & Brand" },
  { stage: "Share", id: "create-outreach", title: "Create Outreach" },
  { stage: "Share", id: "my-outreach", title: "My Outreach" },
  ...prepareStageModulesV61.map(module => ({
    stage: "Prepare" as const, id: module.id, title: module.title,
  })),
  { stage: "Launch", id: "open", title: "Opening Checklist" },
] as const;

export type SiteLaunchModuleIdV61 = (typeof siteLaunchModules)[number]["id"];
export type SiteLaunchStageV61 = (typeof siteLaunchStagesV61)[number];

/** Retired Launch Studio module links may still exist in bookmarks and saved
 * handoffs. Resolve them to the canonical Share workflow rather than letting
 * a route-search validation error escape to the application error boundary.
 * Unknown modules safely open the Site overview; no access is granted here. */
const legacySiteLaunchModulesV61 = new Map<string, SiteLaunchModuleIdV61>([
  ["promote", "create-outreach"],
  ["recruit", "create-outreach"],
  ["recruitment", "create-outreach"],
  ["interest-events", "create-outreach"],
  ["events", "create-outreach"],
]);
const currentSiteLaunchModulesV61 = new Set<string>(siteLaunchModules.map(item => item.id));

export function normalizeSiteLaunchModuleV61(value: unknown): SiteLaunchModuleIdV61 | undefined {
  if (typeof value !== "string") return undefined;
  const moduleId = legacySiteLaunchModulesV61.get(value) ?? value;
  return currentSiteLaunchModulesV61.has(moduleId)
    ? moduleId as SiteLaunchModuleIdV61
    : undefined;
}
