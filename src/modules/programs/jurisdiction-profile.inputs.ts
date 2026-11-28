import {z} from "zod";
export const reviewInput=z.object({
 id:z.string().uuid(),
 title:z.string().trim().min(3).max(250),
 summary:z.string().trim().min(10).max(4000),
 profile:z.record(z.string(),z.unknown()),
 evidence:z.array(z.object({
  title:z.string().min(1),
  url:z.string().url().refine(value=>value.startsWith("https://"),"HTTPS required"),
  authority:z.string().min(1),
  checkedAt:z.string().datetime(),
 })),
});
export const verificationInput=z.object({
 id:z.string().uuid(),
 note:z.string().trim().min(25).max(2000),
});
export const publicationInput=z.object({id:z.string().uuid()});
