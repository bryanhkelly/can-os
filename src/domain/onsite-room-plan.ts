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
  primaryPersonId: uuid, backupPersonId: uuid,
  roomLabel: z.string().trim().min(2).max(120), roomCapacity: z.number().int().min(1).max(1000),
  expiresAt: z.string().datetime({ offset: true }),
  rationale: z.string().trim().min(10).max(2000),
}).strict().refine(value => value.primaryPersonId !== value.backupPersonId,
  "Primary and backup must be different adults");
export const reviewRoomPlanSchema = roomPlanBlockSchema.extend({
  documentId: uuid, decision: z.enum(["approve", "reject"]),
  reason: z.string().trim().min(10).max(2000),
}).strict();
