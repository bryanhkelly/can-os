import {z} from "zod";
export {noncreditPublishCommand} from "@/domain/noncredit-self-enrollment";
export const closeInput=z.object({releaseId:z.string().uuid()}).strict();
export const noncreditReadinessSelection=z.object({
  deploymentId:z.string().uuid(),
  adoptionId:z.string().uuid(),
  trainingVersionId:z.string().uuid(),
  courseVersionId:z.string().uuid(),
}).strict();
export const multiSitePublishInput=z.object({
  deploymentId:z.string().uuid(),adoptionId:z.string().uuid(),
  trainingVersionId:z.string().uuid(),courseVersionId:z.string().uuid(),
  siteIds:z.array(z.string().uuid()).min(2).max(50),
  opensAt:z.string().datetime({offset:true}),
  closesAt:z.string().datetime({offset:true}),
  maxParticipants:z.number().int().min(1).max(1000000),
  consentVersion:z.string().trim().min(3).max(80),
  consentText:z.string().trim().min(25).max(4000),
}).strict().refine(x=>new Date(x.opensAt)<new Date(x.closesAt),{
  message:"Registration closing must follow opening",
});
