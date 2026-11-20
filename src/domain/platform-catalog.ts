import { z } from "zod";

/** Platform-authored reusable content, never a Site configuration or enrollment grant. */
const globalCode = z.string().trim().min(5).max(120)
  .regex(/^can(?:\.[a-z0-9][a-z0-9_-]*)+$/);
const offeringCode = z.string().trim().min(2).max(120)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);
const componentKey = z.string().trim().min(2).max(120)
  .regex(/^[a-z][a-z0-9_-]*$/);
const title = z.string().trim().min(3).max(160);
const description = z.string().trim().max(4000);

export const savePlatformProgramSchema = z.object({
  code: globalCode,
  category: z.string().trim().min(1).max(50),
  title,
  summary: z.string().trim().min(3).max(500),
  description,
  expectedVersion: z.number().int().min(0),
}).strict();

export const savePlatformBlueprintSchema = z.object({
  code: globalCode,
  title,
  targetKind: z.enum(["offering", "operation", "composite"]),
  programCode: globalCode,
  offeringCode: offeringCode.optional(),
  expectedVersion: z.number().int().min(0),
  components: z.array(z.object({
    key: componentKey,
    kind: z.enum(["program_model", "community", "experience", "club", "activity"]),
    requirementMode: z.enum(["required", "optional", "conditional"]),
    description: z.string().trim().max(500),
  }).strict()).min(1).max(30),
}).strict().superRefine((value, ctx) => {
  const keys = value.components.map(component => component.key);
  if (new Set(keys).size !== keys.length) {
    ctx.addIssue({ code: "custom", message: "Component keys must be unique", path: ["components"] });
  }
});

export const platformCatalogDecisionSchema = z.object({
  kind: z.enum(["program", "blueprint"]),
  versionId: z.string().uuid(),
}).strict();

export type PlatformProgramDraft = z.infer<typeof savePlatformProgramSchema>;
export type PlatformBlueprintDraft = z.infer<typeof savePlatformBlueprintSchema>;
export type PlatformCatalogDecision = z.infer<typeof platformCatalogDecisionSchema>;

/** Independent reviewer invariant, including revisions of old planning fixtures. */
export function mayApprovePlatformVersion(authorId: string | null, reviewerId: string | null): boolean {
  return Boolean(authorId && reviewerId && authorId !== reviewerId);
}
