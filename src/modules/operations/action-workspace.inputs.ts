import {z} from "zod";
const id=z.string().uuid();
export const actionSelectionSchema=z.object({siteId:id.optional(),programId:id.optional()}).strict();
export const actionStatusSchema=z.object({id,status:z.enum(["in_progress","waiting","resolved"]),resolutionNote:z.string().trim().max(2000).optional()}).strict().refine(v=>v.status!=="resolved"||!!v.resolutionNote,"Resolution note required");
export const actionAssignmentSchema=z.object({id,ownerPersonId:id.nullable(),priority:z.enum(["normal","high","urgent"])}).strict();
export const actionDeadlineSchema=z.object({id,dueAt:z.string().datetime({offset:true}).nullable(),reason:z.string().trim().min(5).max(500)}).strict();
export const ownedActionResolutionSchema=z.object({id,resolutionNote:z.string().trim().min(10).max(2000)}).strict();
