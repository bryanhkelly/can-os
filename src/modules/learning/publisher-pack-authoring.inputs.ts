import {z} from "zod";
const uuid=z.string().uuid();
const program=z.object({programId:uuid}).strict();
const version=program.extend({versionId:uuid,expectedRevision:z.string().regex(/^[a-f0-9]{64}$/)});
export const studioInput=program;
export const createInput=program.extend({
 requestId:uuid,slug:z.string().trim().min(3).max(80).regex(/^[a-z0-9-]+$/),
 name:z.string().trim().min(3).max(160),description:z.string().trim().min(10).max(2000),
 visibility:z.enum(["public","private"]),licenseCode:z.enum(["CC0","CC-BY-4.0","COMMERCIAL"]),
}).strict();
export const draftInput=program.extend({packId:uuid,requestId:uuid}).strict();
export const saveInput=version.extend({courseVersionIds:z.array(uuid).min(1).max(200)}).strict();
export const publishInput=version.extend({confirmed:z.literal(true),reason:z.string().trim().min(10).max(2000)}).strict();
