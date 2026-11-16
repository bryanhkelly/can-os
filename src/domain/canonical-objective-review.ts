import { z } from "zod";
import { AuthorizationError, type CommandContext } from "@/domain/command-context";

export const assessmentReviewKind=z.enum(["academic","rights","accessibility","independent"]);
export const assessmentReviewDecision=z.enum(["approved","rejected"]);
export const assessmentReviewTarget=z.enum(["item","assessment","form"]);
export const recordObjectiveReviewInput=z.object({
  assessmentVersionId:z.string().uuid(),
  target:assessmentReviewTarget,
  itemVersionId:z.string().uuid().optional(),
  kind:assessmentReviewKind,
  decision:assessmentReviewDecision,
  rationale:z.string().trim().min(20).max(1500),
}).strict().superRefine((v,ctx)=>{
  if((v.target==="item")!==Boolean(v.itemVersionId))
    ctx.addIssue({code:"custom",message:"Exact item version is required only for an item review"});
  if(v.target==="assessment"&&v.kind==="independent")return;
  if(v.target!=="assessment"&&v.kind==="independent")
    ctx.addIssue({code:"custom",message:"Independent release review belongs to the assessment version"});
});
export const publishObjectiveAssessmentInput=z.object({
  assessmentVersionId:z.string().uuid(),
}).strict();
export const objectiveReviewRequirements={
  item:["academic","rights","accessibility"],
  assessment:["academic","rights","accessibility","independent"],
  form:["academic","rights","accessibility"],
} as const;

export type AssessmentReviewDecision={
  itemVersionId?:string;
  kind:string;decision:string;reviewerPersonId:string;order:number;
};
export type ObjectivePublicationReviewInput={
  items:readonly {id:string;authorPersonId:string}[];
  assessmentReviews:readonly AssessmentReviewDecision[];
  formReviews:readonly AssessmentReviewDecision[];
  itemReviews:readonly AssessmentReviewDecision[];
};
/** Every canonical question must have its own latest academic/rights/
 * accessibility approval, all by someone other than any author of this
 * Course assessment. An approval for question A NEVER approves question B.
 * The DB repeats these checks while holding the publication advisory lock.
 */
export function objectiveApprovalGate(input:ObjectivePublicationReviewInput){
  const authors=new Set(input.items.map(item=>item.authorPersonId));
  function valid(rows:readonly AssessmentReviewDecision[],kind:string){
    const latest=rows.filter(row=>row.kind===kind)
      .sort((a,b)=>b.order-a.order)[0];
    return !!latest&&latest.decision==="approved"&&
      !authors.has(latest.reviewerPersonId);
  }
  const items=input.items.map(item=>({
    id:item.id,
    ready:objectiveReviewRequirements.item.every(kind=>
      valid(input.itemReviews.filter(row=>row.itemVersionId===item.id),kind)),
  }));
  const assessmentReady=objectiveReviewRequirements.assessment.every(kind=>
    valid(input.assessmentReviews,kind));
  const formReady=objectiveReviewRequirements.form.every(kind=>
    valid(input.formReviews,kind));
  return {items,assessmentReady,formReady,
    ready:items.length>0&&items.length<=10&&items.every(item=>item.ready)&&
      assessmentReady&&formReady};
}
/** App capability is only an initial gate. A separately provisioned,
 * NOLOGIN, exact-Organization PostgreSQL reviewer or publisher role is
 * required for every read, review and publication command.
 */
export function canonicalAssessmentApprovalRole(actor:Pick<CommandContext,"scope"|"capabilities">,
  purpose:"assessment_reviewer"|"assessment_publisher"){
  // Reviewer/publisher *database* roles are the separate positive authority;
  // a generic staff capability alone never grants either one.
  if(!actor.capabilities.has("curriculum.publish")&&
     !actor.capabilities.has("class.manage"))
    throw new AuthorizationError("publisher staff authority");
  const ids=actor.scope.organizationIds??[];
  if(ids.length!==1||!z.string().uuid().safeParse(ids[0]).success)
    throw new AuthorizationError("single publisher organization");
  return "can_v30_"+(purpose==="assessment_reviewer"?"assess_reviewer_":"assess_publisher_")+
    ids[0]!.replaceAll("-","").toLowerCase();
}
