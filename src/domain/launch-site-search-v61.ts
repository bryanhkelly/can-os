import { decodeUuidPathParam } from "@/domain/opaque-url-id";
import { z } from "zod";
import { normalizeSiteLaunchModuleV61, siteLaunchModules, type SiteLaunchModuleIdV61 } from "./launch-site-navigation-v61";

const compactOrLegacyUuid = z.preprocess(value =>
  typeof value === "string" ? decodeUuidPathParam(value) ?? value : value,
  z.string().uuid().optional());

/** Normalize retired Launch Studio deep links before TanStack Router parses the
 * search parameters. A retired or unknown module is a navigation concern, not
 * an exception that should escape to the app's generic error boundary.
 * Site identifiers remain strictly validated and authorization remains in the
 * route's server loader. */
export const siteLaunchSearchSchemaV61 = z.object({
  siteId: compactOrLegacyUuid,
  programId: compactOrLegacyUuid,
  solutionPlanId: compactOrLegacyUuid,
  module: z.preprocess(normalizeSiteLaunchModuleV61,
    z.enum(siteLaunchModules.map(item => item.id) as [SiteLaunchModuleIdV61, ...SiteLaunchModuleIdV61[]]).optional()),
});
