import {z} from "zod";
const id=z.string().uuid();
export const createOperationalTaskSchema=z.object({
 requestId:id,siteId:id,programId:id.optional(),title:z.string().trim().min(3).max(200),
 description:z.string().trim().max(2000).optional(),ownerPersonId:id.nullable(),
 priority:z.enum(["normal","high","urgent"]).default("normal"),
 dueAt:z.string().datetime({offset:true}).nullable().optional(),
}).strict();
export const escalateOperationalTaskSchema=z.object({
 id,requestId:id,expectedUpdatedAt:z.string().datetime({offset:true}),reason:z.string().trim().min(5).max(500),
}).strict();
export const manualTaskPageSchema=z.object({
 siteId:id.optional(),programId:id.optional(),afterId:id.optional(),
}).strict();
export const workInboxSchema=z.object({}).strict();
export const dependencyReadSchema=z.object({id}).strict();
export const dependencyChangeSchema=z.object({id,blockedByActionId:id,operation:z.enum(["add","remove"]),expectedUpdatedAt:z.string().datetime({offset:true}),reason:z.string().trim().min(5).max(500)}).strict();
