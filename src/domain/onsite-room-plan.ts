import { z } from "zod";

const uuid = z.string().uuid();
export const roomPlanBlockSchema = z.object({
  programId: uuid, sectionId: uuid, periodId: uuid,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const day = new Date(value + "T12:00:00Z");
    return Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === value;
  }, "Invalid school-local date"),
}).strict();
export const submitRoomPlanSchema = roomPlanBlockSchema.extend({
  documentId: uuid, expectedDocumentId: uuid.nullable(),
  primaryPersonId: uuid, backupPersonId: uuid, substitutesForPersonId: uuid.optional(),
  roomLabel: z.string().trim().min(2).max(120), roomCapacity: z.number().int().min(1).max(1000),
  expiresAt: z.string().datetime({ offset: true }),
  rationale: z.string().trim().min(10).max(2000),
}).strict().refine(value => value.primaryPersonId !== value.backupPersonId,
  "Primary and backup must be different adults");
export const reviewRoomPlanSchema = roomPlanBlockSchema.extend({
  documentId: uuid, decision: z.enum(["approve", "reject"]),
  reason: z.string().trim().min(10).max(2000),
}).strict();

/** A reviewed onsite replacement is bounded to the already-selected exact
 * block and its scheduled primary. It never rewrites academic delivery. */
export function effectiveRoomPrimary(scheduledPrimaryPersonId:string|null,
  reviewedPlan:{primaryPersonId:string;substitutesForPersonId?:string|null}|undefined){
  if(!scheduledPrimaryPersonId)return null;
  return reviewedPlan?.substitutesForPersonId===scheduledPrimaryPersonId
    ? reviewedPlan.primaryPersonId : scheduledPrimaryPersonId;
}
export function assertRoomPrimaryChoice(scheduledIds:readonly string[],primaryPersonId:string,substitutesForPersonId?:string){
  const ids=[...new Set(scheduledIds)];
  if(ids.length!==1)throw new Error("A single current scheduled primary is required before planning a replacement");
  if(primaryPersonId===ids[0]){
    if(substitutesForPersonId)throw new Error("A substitution must name a different primary adult");
  }else if(substitutesForPersonId!==ids[0]){
    throw new Error("The scheduled primary changed; refresh before requesting a substitution");
  }
}
