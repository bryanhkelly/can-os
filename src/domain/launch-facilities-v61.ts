import { z } from "zod";

/** Self-reported physical capabilities. Published requirements and third-party
 * qualification verifications are governed separately, not inferred here. */
export const siteSpacePlanningResourcesV61Schema = z.object({
  connectivity: z.object({
    internetAvailable: z.boolean().nullable().default(null),
    wifiAvailable: z.boolean().nullable().default(null),
    downloadMbps: z.number().min(0).max(100000).nullable().default(null),
    notes: z.string().trim().max(1000).default(""),
  }).strict().default({
    internetAvailable:null,wifiAvailable:null,downloadMbps:null,notes:"",
  }),
  devices: z.array(z.object({
    category: z.string().trim().min(2).max(64),
    quantity: z.number().int().min(0).max(10000),
  }).strict()).max(30).refine(items=>
    new Set(items.map(x=>x.category.toLowerCase())).size===items.length,
    "Device categories must be unique").default([]),
  accessibility: z.object({
    stepFreeAccess: z.boolean().nullable().default(null),
    accessibleRestroom: z.boolean().nullable().default(null),
    notes: z.string().trim().max(1000).default(""),
  }).strict().default({
    stepFreeAccess:null,accessibleRestroom:null,notes:"",
  }),
  equipment: z.array(z.string().trim().min(2).max(100))
    .max(50).refine(items=>new Set(items.map(x=>x.toLowerCase())).size===items.length,
      "Equipment names must be unique").default([]),
  notes: z.string().trim().max(2000).default(""),
}).strict();

export type SiteSpacePlanningResourcesV61 =
  z.infer<typeof siteSpacePlanningResourcesV61Schema>;

export const siteSpaceInputV61 = z.object({
  siteId: z.string().uuid(),
  spaceId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  maxOccupancy: z.number().int().min(1).max(1000).nullable(),
  resources: siteSpacePlanningResourcesV61Schema,
}).strict();

export const saveSiteSpaceV61Schema = siteSpaceInputV61.extend({
  expectedRevision: z.number().int().positive(),
  reason: z.string().trim().min(5).max(1000),
}).strict();

export const createSiteSpaceV61Schema = siteSpaceInputV61;
export const readSiteSpacesV61Schema = z.object({
  siteId:z.string().uuid(),
}).strict();

export const saveClassPhysicalPlanV61Schema = z.object({
  siteId:z.string().uuid(),
  classId:z.string().uuid(),
  spaceId:z.string().uuid().nullable(),
  facilitatorAssignmentId:z.string().uuid().nullable(),
  /** Same Class.updatedAt value returned by the authorized Class workspace. */
  expectedRevision:z.number().int().positive(),
}).strict().refine(value=>value.spaceId!==null||value.facilitatorAssignmentId===null,
  "A physical facilitator assignment requires a physical space");

export function parseSitePlanningResourcesV61(raw:unknown):SiteSpacePlanningResourcesV61{
  const source = raw && typeof raw==="object" && !Array.isArray(raw)
    ? (raw as Record<string,unknown>).launchPlanningV61 : undefined;
  const parsed=siteSpacePlanningResourcesV61Schema.safeParse(source??{});
  if(!parsed.success)throw new Error("Saved Site Space planning resources need reconciliation");
  return parsed.data;
}

/** Preserve other governed Site Space resource fields; never overwrite
 * unrelated qualification data with local planning answers. */
export function mergeSitePlanningResourcesV61(
  existing:Record<string,unknown>,planning:SiteSpacePlanningResourcesV61,
):Record<string,unknown>{
  return {...existing,launchPlanningV61:siteSpacePlanningResourcesV61Schema.parse(planning)};
}

export function roomPlanningFitsClass(capacity:number|null,occupancy:number|null){
  return occupancy!==null && (capacity===null || capacity<=occupancy);
}
