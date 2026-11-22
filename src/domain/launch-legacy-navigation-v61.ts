import { schoolLaunchSteps } from "@/domain/launch-studio";
import type { SiteLaunchModuleIdV61 } from "@/domain/launch-site-navigation-v61";

/** Keep old academic setup links compatible with the single V6.1 Launch Studio.
 * This is a navigation adapter only: it does not recreate the retired wizard.
 * Site authorization and the actual workflow are owned by /launch/site.
 */
const moduleForLegacyStep = {
  welcome: undefined,
  school: "site-information",
  academics: "program-catalog",
  website: "website-brand",
  families: "create-outreach",
  readiness: "opening-compliance",
  next: "open",
} as const satisfies Record<(typeof schoolLaunchSteps)[number], SiteLaunchModuleIdV61 | undefined>;

export function legacySchoolStepModuleV61(
  step: (typeof schoolLaunchSteps)[number],
): SiteLaunchModuleIdV61 | undefined {
  return moduleForLegacyStep[step];
}
