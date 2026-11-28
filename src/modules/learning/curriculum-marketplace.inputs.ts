import {z} from "zod";
const uuid=z.string().uuid();
export const empty=z.object({}).strict();
export const program=z.object({programId:uuid}).strict();
export const install=program.extend({packId:uuid,termsAccepted:z.literal(true)}).strict();
export const adopt=program.extend({packId:uuid,versionId:uuid}).strict();
export const annualReview=program.extend({packId:uuid,academicYearId:uuid}).strict();
export const rollover=annualReview.extend({versionId:uuid}).strict();
export const rollback=annualReview.extend({reason:z.string().trim().min(8).max(2000)}).strict();
const url=z.string().url().max(2048).refine(value=>{
 try{const parsed=new URL(value);return parsed.protocol==="https:"&&!parsed.username&&!parsed.password;}catch{return false;}
},"Use a HTTPS URL without embedded credentials.");
export const supplement=program.extend({
 courseVersionId:uuid,sectionId:uuid.optional(),lessonId:z.string().min(1).max(100).optional(),
 scope:z.enum(["program","site","section"]),title:z.string().trim().min(3).max(200),
 kind:z.enum(["link","video","pdf","image","audio","document"]),url
}).strict();
