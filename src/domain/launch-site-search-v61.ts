import { z } from "zod";
import { normalizeSiteLaunchModuleV61, siteLaunchModules } from "./launch-site-navigation-v61";

/** Normalize retired Launch Studio deep links before TanStack Router parses the
 * search parameters. A retired or unknown module is a navigation concern, not
 * an exception that should escape to the app's generic error boundary.
 * Site identifiers remain strictly validated and authorization remains in the
 * route's server loader. */
export const siteLaunchSearchSchemaV61 = z.object({
  siteId: z.string().uuid().optional(),
  programId: z.string().uuid().optional(),
  solutionPlanId: z.string().uuid().optional(),
  module: z.preprocess(normalizeSiteLaunchModuleV61,
    z.enum(siteLaunchModules.map(item => item.id) as [string, ...string[]]).optional()),
});
