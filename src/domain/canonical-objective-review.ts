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
  target:"item"|"assessment"|"form";kind:string;decision:string;
  reviewerPersonId:string;decisionOrder:number;
};
export function objectiveApprovalGate(rows:readonly AssessmentReviewDecision[],
  authorPersonId:string,expectedItemCount:number,reviewedItemCount:number){
  const groups=Object.entries(objectiveReviewRequirements).flatMap(([target,kinds])=>
    kinds.map(kind=>({target,kind})));
  const latest=new Map<string,AssessmentReviewDecision>();
  for(const item of rows){
    const key=item.target+":"+item.kind;
    const prev=latest.get(key);
    if(!prev||item.decisionOrder>prev.decisionOrder)latest.set(key,item);
  }
  const requirements=groups.map(({target,kind})=>{
    const match=latest.get(target+":"+kind);
    return {target,kind,decision:match?.decision??null,
      independent:Boolean(match&&match.reviewerPersonId!==authorPersonId)};
  });
  return {ready:reviewedItemCount===expectedItemCount&&expectedItemCount>0&&
    requirements.every(x=>x.decision==="approved"&&x.independent),
    requirements};
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
