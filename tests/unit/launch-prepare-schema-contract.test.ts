import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { isCanonicalSiteDiscoverable } from "@/domain/canonical-site-availability";
import {
  canonicalClasses,
  canonicalClassOfferings,
  blueprintComponents,
  blueprintConfigurations,
  blueprintConfigurationVersions,
  blueprintVersions,
  catalogSites,
  educationOperationOrganizationRoles,
  educationOperationSites,
  educationOperations,
  courses, courseVersions, courseUnits, courseLessons,
  geographicAreas,
  offeringVersions,
  offerings,
  qualificationProgramFitPolicies,
  qualificationProgramFitPolicyVersions,
  siteOrganizationRoles,
} from "@/db/canonical-v301";

/**
 * Verify the exact tables consumed by Prepare's canonical Blueprint and
 * Offering readers. These are schema ownership contracts, not authorization
 * or database acceptance tests.
 */
describe("V6.1 Prepare canonical schema bindings", () => {
  it("requires a classified, nonclosed Site before any catalog discovery", () => {
    expect(isCanonicalSiteDiscoverable("planning")).toBe(true);
    expect(isCanonicalSiteDiscoverable("active")).toBe(true);
    expect(isCanonicalSiteDiscoverable("closed")).toBe(false);
    expect(isCanonicalSiteDiscoverable(null)).toBe(false);
    expect(isCanonicalSiteDiscoverable(undefined)).toBe(false);
  });

  it("maps Site, Blueprint, Offering, geographic and operator records to public", () => {
    const sourceTables = {
      catalogSites, siteOrganizationRoles, geographicAreas, canonicalClasses, canonicalClassOfferings,
      courses, courseVersions, courseUnits, courseLessons,
      educationOperations, educationOperationSites, educationOperationOrganizationRoles,
      blueprintVersions, blueprintComponents, blueprintConfigurations,
      blueprintConfigurationVersions, offerings, offeringVersions,
      qualificationProgramFitPolicies, qualificationProgramFitPolicyVersions,
    };
    for (const [name, table] of Object.entries(sourceTables)) {
      expect(getTableConfig(table).schema ?? "public", name).toBe("public");
    }
  });

});
