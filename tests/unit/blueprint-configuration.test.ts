import { describe, expect, it } from "vitest";
import {
  blueprintConfigurationIdentitySchema,
  blueprintConfigurationVersionInputSchema,
  missingRequiredBlueprintComponents,
  selectBlueprintWorkspaceRecipes,
  includedBlueprintComponentIds,
  blueprintProgramModelDraftSchema,
  blueprintReferenceSelectionSchema,
  blueprintWeeklyPeriodSchema,
  evaluateBlueprintOutreach,
  offeringAdoptionIntentSchema,
  blueprintLocalExperienceProposalSchema,
  proposedLocalExperienceSchema,
} from "@/domain/blueprint-configuration";

describe("canonical Blueprint configuration contracts", () => {

  it("keeps proposed component intents when revising a Blueprint", () => {
    const included = includedBlueprintComponentIds(
      ["required", "selected"],
      [
        { componentId: "required", selectionStatus: "selected" },
        { componentId: "proposed", selectionStatus: "proposed" },
        { componentId: "excluded", selectionStatus: "excluded" },
      ],
    );
    expect([...included].sort()).toEqual(["proposed", "required", "selected"]);
    expect(included.has("proposed")).toBe(true);
    expect(included.has("excluded")).toBe(false);
  });


  it("keeps saved published recipe versions accessible after a newer release", () => {
    const recipes = [
      { blueprintId: "school", blueprintVersionId: "school-v3" },
      { blueprintId: "school", blueprintVersionId: "school-v2" },
      { blueprintId: "school", blueprintVersionId: "school-v1" },
      { blueprintId: "center", blueprintVersionId: "center-v2" },
      { blueprintId: "center", blueprintVersionId: "center-v1" },
    ];
    expect(selectBlueprintWorkspaceRecipes(recipes, new Set(["school-v1"])).map(
      recipe => recipe.blueprintVersionId,
    )).toEqual(["school-v3", "school-v1", "center-v2"]);
    expect(selectBlueprintWorkspaceRecipes(recipes, new Set()).map(
      recipe => recipe.blueprintVersionId,
    )).toEqual(["school-v3", "center-v2"]);
  });


  it("requires mandatory recipe components on every saved Blueprint version", () => {
    const catalog = [
      { id: "academic", requirementMode: "required" },
      { id: "clubs", requirementMode: "optional" },
    ];
    expect(missingRequiredBlueprintComponents(catalog, [
      { componentId: "academic", selectionStatus: "selected" },
    ])).toEqual([]);
    expect(missingRequiredBlueprintComponents(catalog, [
      { componentId: "academic", selectionStatus: "excluded" },
      { componentId: "clubs", selectionStatus: "selected" },
    ])).toEqual(["academic"]);
    expect(missingRequiredBlueprintComponents(catalog, [
      { componentId: "clubs", selectionStatus: "selected" },
    ])).toEqual(["academic"]);
  });


  it("keeps self-declared affiliation on the configured Operation, not its host", () => {
    expect(blueprintConfigurationIdentitySchema.parse({
      religiousAffiliationCode: "nonsectarian",
      editorialIdentity: "innovation_discovery",
      culturalContext: { languages: ["English", "Spanish"] },
    })).toMatchObject({ religiousAffiliationCode: "nonsectarian" });
    expect(blueprintConfigurationIdentitySchema.parse({
      religiousAffiliationCode: null,
      editorialIdentity: "community_belonging",
    }).religiousAffiliationCode).toBeNull();
  });

  it("allows program planning before academic provider or operating approval", () => {
    expect(blueprintProgramModelDraftSchema.parse({
      name: "Saturday Academy",
      kind: "weekend",
      gradeRange: { min: "6", max: "12" },
    }).name).toBe("Saturday Academy");
  });

  it("keeps a catalog reference distinct from a proposed local experience", () => {
    const reference = blueprintReferenceSelectionSchema.parse({
      source: "catalog_reference",
      referenceItemVersionId: "e35d4c81-d146-4fc7-b430-a2f4d8c71a69",
    });
    expect(reference.source).toBe("catalog_reference");
    expect(proposedLocalExperienceSchema.safeParse(reference).success).toBe(false);
    expect(proposedLocalExperienceSchema.parse({
      source: "proposed_local_experience",
      kind: "experience",
      title: "Local Oral History Project",
    }).source).toBe("proposed_local_experience");
  });

  it("keeps a published Offering adoption intent distinct from creating an Offering", () => {
    const adoption = offeringAdoptionIntentSchema.parse({
      source: "published_offering",
      offeringVersionId: "e35d4c81-d146-4fc7-b430-a2f4d8c71a69",
      configuration: { delivery: "onsite" },
    });
    expect(adoption.source).toBe("published_offering");
    expect(proposedLocalExperienceSchema.safeParse(adoption).success).toBe(false);
  });

  it("binds Offering adoption intent to an actively selected Blueprint component", () => {
    const componentId = "e35d4c81-d146-4fc7-b430-a2f4d8c71a69";
    const offeringVersionId = "6ca779f1-8c03-4832-85a3-4f4a32b36089";
    const version = {
      identity: {
        religiousAffiliationCode: null,
        editorialIdentity: "community_belonging",
      },
      components: [{ componentId, selectionStatus: "selected" }],
      offeringAdoptions: [{ componentId, offeringVersionId, configuration: { delivery: "onsite" } }],
    };
    expect(blueprintConfigurationVersionInputSchema.safeParse(version).success).toBe(true);
    expect(blueprintConfigurationVersionInputSchema.safeParse({
      ...version,
      components: [{ componentId, selectionStatus: "excluded" }],
    }).success).toBe(false);
  });

  it("keeps local experience proposals separate and tied to a chosen component", () => {
    const componentId = "e35d4c81-d146-4fc7-b430-a2f4d8c71a69";
    const proposal = {
      source: "proposed_local_experience",
      componentId,
      kind: "experience",
      title: "Community Garden Visit",
      configuration: { hostOrganization: "local partner" },
    };
    expect(blueprintLocalExperienceProposalSchema.safeParse(proposal).success).toBe(true);
    expect(blueprintConfigurationVersionInputSchema.safeParse({
      identity: {
        religiousAffiliationCode: null,
        editorialIdentity: "community_belonging",
      },
      components: [{ componentId, selectionStatus: "proposed" }],
      localExperiences: [proposal],
    }).success).toBe(true);
    expect(blueprintConfigurationVersionInputSchema.safeParse({
      identity: {
        religiousAffiliationCode: null,
        editorialIdentity: "community_belonging",
      },
      localExperiences: [proposal],
    }).success).toBe(false);
  });

  it("rejects duplicate component or reference selections in a version", () => {
    const componentId = "e35d4c81-d146-4fc7-b430-a2f4d8c71a69";
    const referenceVersionId = "6ca779f1-8c03-4832-85a3-4f4a32b36089";
    expect(blueprintConfigurationVersionInputSchema.safeParse({
      identity: {
        religiousAffiliationCode: null,
        editorialIdentity: "community_belonging",
      },
      components: [
        { componentId, selectionStatus: "selected" },
        { componentId, selectionStatus: "proposed" },
      ],
    }).success).toBe(false);
    expect(blueprintConfigurationVersionInputSchema.safeParse({
      identity: {
        religiousAffiliationCode: null,
        editorialIdentity: "community_belonging",
      },
      components: [{
        componentId,
        selectionStatus: "selected",
        referenceItemVersionIds: [referenceVersionId, referenceVersionId],
      }],
    }).success).toBe(false);
  });

  it("rejects invalid local times and weekdays", () => {
    expect(blueprintWeeklyPeriodSchema.safeParse({
      dayOfWeek: 2,
      startsAtLocal: "15:00",
      endsAtLocal: "08:00",
      kind: "instruction",
      label: "Invalid",
    }).success).toBe(false);
    expect(blueprintWeeklyPeriodSchema.safeParse({
      dayOfWeek: 7,
      startsAtLocal: "08:00",
      endsAtLocal: "12:00",
      kind: "support",
      label: "Invalid",
    }).success).toBe(false);
  });

  it("uses configured outreach limits and independently requires permission, consent, and abuse checks", () => {
    const allowed = {
      distinctContactCount: 11,
      maximumDistinctContacts: 12,
      existingContact: false,
      hasOutreachPermission: true,
      hasCurrentConsent: true,
      abuseProtectionPassed: true,
    };
    expect(evaluateBlueprintOutreach(allowed)).toEqual({ allowed: true });
    expect(evaluateBlueprintOutreach({
      ...allowed,
      distinctContactCount: 12,
    })).toEqual({ allowed: false, reason: "configured_contact_limit_reached" });
    expect(evaluateBlueprintOutreach({
      ...allowed,
      existingContact: true,
      distinctContactCount: 12,
    })).toEqual({ allowed: true });
    expect(evaluateBlueprintOutreach({
      ...allowed,
      hasOutreachPermission: false,
    })).toEqual({ allowed: false, reason: "permission_required" });
    expect(evaluateBlueprintOutreach({
      ...allowed,
      hasCurrentConsent: false,
    })).toEqual({ allowed: false, reason: "current_consent_required" });
    expect(evaluateBlueprintOutreach({
      ...allowed,
      abuseProtectionPassed: false,
    })).toEqual({ allowed: false, reason: "abuse_protection_required" });
  });
});
