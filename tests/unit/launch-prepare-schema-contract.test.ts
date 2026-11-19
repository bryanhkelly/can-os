import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  blueprintComponents,
  blueprintConfigurations,
  blueprintConfigurationVersions,
  blueprintVersions,
  catalogSites,
  educationOperationOrganizationRoles,
  educationOperationSites,
  educationOperations,
  geographicAreas,
  offeringVersions,
  offerings,
  qualificationProgramFitPolicies,
  qualificationProgramFitPolicyVersions,
  qualificationResourceNeeds,
  siteOrganizationRoles,
} from "@/db/canonical-v301";

/**
 * Verify the exact tables consumed by Prepare's canonical Blueprint and
 * Offering readers. These are schema ownership contracts, not authorization
 * or database acceptance tests.
 */
describe("V6.1 Prepare canonical schema bindings", () => {
  it("maps Site, Blueprint, Offering, geographic and operator records to public", () => {
    const sourceTables = {
      catalogSites, siteOrganizationRoles, geographicAreas,
      educationOperations, educationOperationSites, educationOperationOrganizationRoles,
      blueprintVersions, blueprintComponents, blueprintConfigurations,
      blueprintConfigurationVersions, offerings, offeringVersions,
      qualificationProgramFitPolicies, qualificationProgramFitPolicyVersions,
    };
    for (const [name, table] of Object.entries(sourceTables)) {
      expect(getTableConfig(table).schema ?? "public", name).toBe("public");
    }
  });

  it("does not prematurely move the still-legacy resource-needs table", () => {
    expect(getTableConfig(qualificationResourceNeeds).schema).toBe("education_v30");
  });
});
