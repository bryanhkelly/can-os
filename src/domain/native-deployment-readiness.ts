import {z} from "zod";
import {nativeAdoptionReviewKinds} from "./native-adoption-readiness";
export const deploymentReadinessCommand=z.object({
 deploymentId:z.string().uuid(),reviewId:z.string().uuid(),reviewKind:z.enum(nativeAdoptionReviewKinds),
 outcome:z.enum(["ready","ready_with_conditions","not_ready"]),evidenceVersionId:z.string().uuid(),
 expiresAt:z.string().datetime({offset:true}),supersedesId:z.string().uuid().nullable(),
}).strict().refine(v=>v.reviewId!==v.supersedesId,"A review cannot supersede itself");
export type DeploymentReadinessCommand=z.infer<typeof deploymentReadinessCommand>;
export function sameDeploymentReadinessReceipt(prior:{
 id:string;deploymentId:string;reviewKind:string;outcome:string;evidenceVersionId:string;
 evaluatedByPersonId:string;expiresAt:Date|null;supersedesId:string|null;
},data:DeploymentReadinessCommand,personId:string){
 return prior.id===data.reviewId&&prior.deploymentId===data.deploymentId&&
 prior.reviewKind===data.reviewKind&&prior.outcome===data.outcome&&prior.evidenceVersionId===data.evidenceVersionId&&
 prior.evaluatedByPersonId===personId&&prior.expiresAt?.getTime()===Date.parse(data.expiresAt)&&prior.supersedesId===data.supersedesId;
}
