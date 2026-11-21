import { prepareStageModulesV61 } from "@/domain/launch-prepare-v61";

/**
 * Single V6.1 Launch Studio navigation contract.
 * Routes, Site navigation and Overview consume these identifiers, not each other.
 * Authoritative access and readiness still belong to their server services.
 */
export const siteLaunchStagesV61 = ["Establish", "Introduce", "Prepare", "Open"] as const;

export const siteLaunchModules = [
  { stage: "Establish", id: "site-profile", title: "Site Profile" },
  { stage: "Establish", id: "site-information", title: "Site Information" },
  { stage: "Establish", id: "programs-audiences", title: "Programs & Audiences" },
  { stage: "Establish", id: "website-brand", title: "Website & Brand" },
  { stage: "Introduce", id: "create-outreach", title: "Create Outreach" },
  { stage: "Introduce", id: "my-outreach", title: "My Outreach" },
  ...prepareStageModulesV61.map(module => ({
    stage: "Prepare" as const, id: module.id, title: module.title,
  })),
  { stage: "Open", id: "open", title: "Open" },
] as const;

export type SiteLaunchModuleIdV61 = (typeof siteLaunchModules)[number]["id"];
export type SiteLaunchStageV61 = (typeof siteLaunchStagesV61)[number];
