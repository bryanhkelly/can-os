import {z} from "zod";
const uuid=z.string().uuid();
export const requestSchema=z.object({
  evidenceReference:z.string().trim().min(25).max(1200),
}).strict();
export const reviewSchema=z.object({
  approvalId:uuid,
  decision:z.enum(["approve","reject"]),
  evidenceReference:z.string().trim().min(25).max(1200),
  expiresAt:z.string().datetime({offset:true}).optional(),
}).strict();
export const revokeSchema=z.object({
  approvalId:uuid,
  reason:z.string().trim().min(25).max(1200),
}).strict();


