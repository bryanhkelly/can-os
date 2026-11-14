import { z } from "zod";

type JsonValue = null | string | number | boolean | JsonValue[] | { [key: string]: JsonValue };
const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.null(),
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.array(jsonValueSchema),
  z.record(jsonValueSchema),
]));
const jsonObjectSchema = z.record(jsonValueSchema);

export const blueprintEditorialIdentityKeys = [
  "community_belonging",
  "academic_excellence",
  "innovation_discovery",
  "classical_humanities",
  "creative_expression",
  "leadership_service",
] as const;

export const blueprintReferenceKinds = [
  "program_model",
  "community",
  "experience",
  "club",
  "activity",
] as const;

export const blueprintConfigurationIdentitySchema = z.object({
  religiousAffiliationCode: z.string().min(1).max(96).nullable(),
  editorialIdentity: z.enum(blueprintEditorialIdentityKeys),
  culturalContext: jsonObjectSchema.default({}),
}).strict();

/**
 * Published recipe requirements are non-negotiable when creating or revising
 * a configuration. Optional components may be excluded, but required ones
 * must be explicitly selected.
 */
export function missingRequiredBlueprintComponents(
  catalog: readonly { id: string; requirementMode: string }[],
  selections: readonly { componentId: string; selectionStatus: string }[],
): string[] {
  const selected = new Set(selections
    .filter(item => item.selectionStatus === "selected")
    .map(item => item.componentId));
  return catalog
    .filter(component => component.requirementMode === "required" && !selected.has(component.id))
    .map(component => component.id);
}

export const blueprintComponentSelectionSchema = z.object({
  componentId: z.string().uuid(),
  selectionStatus: z.enum(["selected", "excluded", "proposed"]),
  referenceItemVersionIds: z.array(z.string().uuid()).default([]),
  settings: jsonObjectSchema.default({}),
}).strict();

export const blueprintOfferingAdoptionSchema = z.object({
  componentId: z.string().uuid(),
  offeringVersionId: z.string().uuid(),
  configuration: jsonObjectSchema.default({}),
}).strict();

export const blueprintLocalExperienceProposalSchema = z.object({
  source: z.literal("proposed_local_experience"),
  componentId: z.string().uuid(),
  kind: z.enum(["community", "experience", "club", "activity"]),
  title: z.string().trim().min(2).max(160),
  summary: z.string().max(4000).default(""),
  configuration: jsonObjectSchema.default({}),
}).strict();

export const blueprintConfigurationVersionInputSchema = z.object({
  config: jsonObjectSchema.default({}),
  identity: blueprintConfigurationIdentitySchema,
  components: z.array(blueprintComponentSelectionSchema).max(200).default([]),
  offeringAdoptions: z.array(blueprintOfferingAdoptionSchema).max(200).default([]),
  localExperiences: z.array(blueprintLocalExperienceProposalSchema).max(200).default([]),
}).strict().superRefine((input, ctx) => {
  const componentIds = new Set<string>();
  const selectionByComponent = new Map<string, string>();
  for (const [index, component] of input.components.entries()) {
    if (componentIds.has(component.componentId)) {
      ctx.addIssue({
        code: "custom",
        path: ["components", index, "componentId"],
        message: "A component can only be selected once per configuration version.",
      });
    }
    componentIds.add(component.componentId);
    selectionByComponent.set(component.componentId, component.selectionStatus);
    if (new Set(component.referenceItemVersionIds).size !== component.referenceItemVersionIds.length) {
      ctx.addIssue({
        code: "custom",
        path: ["components", index, "referenceItemVersionIds"],
        message: "A reference can only be selected once per component.",
      });
    }
    if (component.selectionStatus === "excluded" && component.referenceItemVersionIds.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["components", index, "referenceItemVersionIds"],
        message: "Excluded components cannot include reference selections.",
      });
    }
  }
  const offeringIntentKeys = new Set<string>();
  for (const [index, intent] of input.offeringAdoptions.entries()) {
    const key = `${intent.componentId}:${intent.offeringVersionId}`;
    if (offeringIntentKeys.has(key)) {
      ctx.addIssue({
        code: "custom",
        path: ["offeringAdoptions", index],
        message: "A published Offering can only be adopted once per component.",
      });
    }
    offeringIntentKeys.add(key);
    const status = selectionByComponent.get(intent.componentId);
    if (status !== "selected" && status !== "proposed") {
      ctx.addIssue({
        code: "custom",
        path: ["offeringAdoptions", index, "componentId"],
        message: "Offering adoption intent requires a selected or proposed component.",
      });
    }
  }
  for (const [index, experience] of input.localExperiences.entries()) {
    const status = selectionByComponent.get(experience.componentId);
    if (status !== "selected" && status !== "proposed") {
      ctx.addIssue({
        code: "custom",
        path: ["localExperiences", index, "componentId"],
        message: "A local experience proposal requires a selected or proposed component.",
      });
    }
  }
});

export const createBlueprintConfigurationInputSchema = z.object({
  configurationId: z.string().uuid(),
  initialVersionId: z.string().uuid(),
  blueprintId: z.string().uuid(),
  blueprintVersionId: z.string().uuid(),
  owningOrganizationId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  version: blueprintConfigurationVersionInputSchema,
}).strict();

export const saveBlueprintConfigurationInputSchema = z.object({
  configurationId: z.string().uuid(),
  versionId: z.string().uuid(),
  expectedRevision: z.number().int().positive(),
  version: blueprintConfigurationVersionInputSchema,
}).strict();

export const submitBlueprintConfigurationInputSchema = z.object({
  configurationId: z.string().uuid(),
  expectedRevision: z.number().int().positive(),
}).strict();

export const blueprintProgramModelDraftSchema = z.object({
  name: z.string().trim().min(2).max(120),
  kind: z.string().trim().min(2).max(60),
  gradeRange: z.object({
    min: z.string().max(12).optional(),
    max: z.string().max(12).optional(),
  }).strict(),
  deliveryModel: z.record(z.unknown()).default({}),
}).strict();

export const blueprintReferenceSelectionSchema = z.object({
  source: z.literal("catalog_reference"),
  referenceItemVersionId: z.string().uuid(),
  configuration: z.record(z.unknown()).default({}),
}).strict();

export const proposedLocalExperienceSchema = z.object({
  source: z.literal("proposed_local_experience"),
  kind: z.enum(["community", "experience", "club", "activity"]),
  title: z.string().trim().min(2).max(160),
  summary: z.string().max(4000).default(""),
  configuration: z.record(z.unknown()).default({}),
}).strict();

export const offeringAdoptionIntentSchema = z.object({
  source: z.literal("published_offering"),
  offeringVersionId: z.string().uuid(),
  configuration: z.record(z.unknown()).default({}),
}).strict();

export const blueprintWeeklyPeriodSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startsAtLocal: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  endsAtLocal: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  kind: z.enum(["site_hours", "attendance", "instruction", "support", "enrichment"]),
  label: z.string().trim().min(1).max(90),
}).strict().refine((period) => period.startsAtLocal < period.endsAtLocal, {
  message: "End must follow start. Split overnight periods across days.",
});

const blueprintOutreachPolicyInputSchema = z.object({
  distinctContactCount: z.number().int().min(0),
  maximumDistinctContacts: z.number().int().min(0),
  existingContact: z.boolean(),
  hasOutreachPermission: z.boolean(),
  hasCurrentConsent: z.boolean(),
  abuseProtectionPassed: z.boolean(),
}).strict();

export type BlueprintOutreachDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason:
        | "permission_required"
        | "current_consent_required"
        | "abuse_protection_required"
        | "configured_contact_limit_reached";
    };

export function evaluateBlueprintOutreach(
  input: z.input<typeof blueprintOutreachPolicyInputSchema>,
): BlueprintOutreachDecision {
  const policy = blueprintOutreachPolicyInputSchema.parse(input);
  if (!policy.hasOutreachPermission) return { allowed: false, reason: "permission_required" };
  if (!policy.hasCurrentConsent) return { allowed: false, reason: "current_consent_required" };
  if (!policy.abuseProtectionPassed) return { allowed: false, reason: "abuse_protection_required" };
  if (
    !policy.existingContact
    && policy.distinctContactCount >= policy.maximumDistinctContacts
  ) {
    return { allowed: false, reason: "configured_contact_limit_reached" };
  }
  return { allowed: true };
}
