import {z} from "zod";
const id=z.string().uuid();
export const scopeInput=z.object({organizationId:id.nullable()}).strict();
export const changeInput=z.object({
 organizationId:id.nullable().optional(),
 from:z.string().trim().email().max(254),
 address:z.string().trim().min(1).max(500),
 reference:z.string().trim().min(5).max(500),
 expectedId:id.nullable(),
 confirmed:z.literal(true),
}).strict();
export const revokeInput=z.object({organizationId:id.nullable().optional(),expectedId:id,confirmed:z.literal(true)}).strict();
export const pageInput=z.object({limit:z.number().int().min(1).max(100),afterName:z.string().max(500).optional(),afterId:id.optional()}).strict().refine(v=>(v.afterName===undefined)===(v.afterId===undefined),"Supply both cursor fields");
