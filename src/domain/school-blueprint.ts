import { z } from "zod";

/** Launch library choices do not confer operational capability. */
export const blueprintCatalogKinds=["program","community","experience","club","activity"] as const;
export const blueprintItemKinds=["community","experience","club","activity"] as const;
export const hostRelationshipRoles=["facility_host","local_operator","sponsor","property_owner"] as const;
export const editorialIdentityKeys=["community_belonging","academic_excellence","innovation_discovery",
  "classical_humanities","creative_expression","leadership_service"] as const;

export const siteBlueprintIdentitySchema=z.object({
  religiousAffiliationCode:z.string().min(1).max(96).nullable(),
  editorialIdentity:z.enum(editorialIdentityKeys),
  culturalContext:z.record(z.unknown()).default({}),
}).strict();

export const siteBlueprintProgramDraftSchema=z.object({
  name:z.string().trim().min(2).max(120),
  kind:z.string().trim().min(2).max(60),
  gradeRange:z.object({min:z.string().max(12).optional(),max:z.string().max(12).optional()}).strict(),
  deliveryModel:z.record(z.unknown()).default({}),
  religiousAffiliationCode:z.string().min(1).max(96).nullable().optional(),
}).strict();

export const siteBlueprintItemDraftSchema=z.object({
  kind:z.enum(blueprintItemKinds),
  title:z.string().trim().min(2).max(160),
  summary:z.string().max(4000).default(""),
  configuration:z.record(z.unknown()).default({}),
  catalogVersionId:z.string().uuid().nullable().optional(),
  programPlanId:z.string().uuid().nullable().optional(),
}).strict();

export const blueprintWeeklyPeriodSchema=z.object({
  dayOfWeek:z.number().int().min(0).max(6),
  startsAtLocal:z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  endsAtLocal:z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  kind:z.enum(["site_hours","attendance","instruction","support","enrichment"]),
  label:z.string().trim().min(1).max(90),
}).strict().refine(v=>v.startsAtLocal<v.endsAtLocal,{
  message:"End must follow start. Split overnight periods across days.",
});

/** A linked plan still does not authorize publication; canonical services decide. */
export function blueprintCanAppearAsLiveOffering(_status:string):boolean{return false;}

/** Enforcement must occur under a Site-scoped database lock/transaction. */
export function assertConceptContactLimit(distinctContacts:number,alreadyExists:boolean,maximum=10):void{
  if(!Number.isInteger(distinctContacts)||distinctContacts<0||!Number.isInteger(maximum)||maximum<1)
    throw new Error("Invalid concept outreach limit");
  if(!alreadyExists&&distinctContacts>=maximum)
    throw new Error("Concept outreach is limited to ten distinct adult contacts per Site");
}
