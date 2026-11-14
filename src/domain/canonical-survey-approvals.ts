import { z } from "zod";
import { AuthorizationError, type CommandContext } from "@/domain/command-context";

export const requiredSurveyReviews = ["privacy","accessibility","safeguarding"] as const;
export const recordSurveyReviewInput = z.object({
  surveyVersionId: z.string().uuid(),
  kind: z.enum(requiredSurveyReviews),
  decision: z.enum(["approved","rejected"]),
  evidenceVersionId: z.string().uuid().nullable(),
  rationale: z.string().trim().min(20).max(1500),
}).strict().superRefine((value,ctx)=>{
  if(value.decision==="approved" && !value.evidenceVersionId)
    ctx.addIssue({code:"custom",message:"Approval requires verified evidence"});
});
export const publishSurveyInput = z.object({
  surveyVersionId: z.string().uuid(),
}).strict();

export type SurveyReviewRow = {
  kind: string; decision: string; reviewerPersonId: string; decisionOrder: bigint;
  evidenceVersionId: string | null;
};
/** Only the latest decision in each domain may satisfy the independent gate. */
export function reviewGate(
  authorPersonId: string,
  reviews: readonly SurveyReviewRow[],
  validEvidenceIds: ReadonlySet<string>,
): {ready: boolean; required: {kind: typeof requiredSurveyReviews[number]; decision: string | null; independent: boolean; evidenceCurrent: boolean}[]} {
  const latest = new Map<string,SurveyReviewRow>();
  for (const row of reviews) {
    const previous=latest.get(row.kind);
    if (!previous || row.decisionOrder>previous.decisionOrder) latest.set(row.kind,row);
  }
  const required=requiredSurveyReviews.map(kind=>{
    const found=latest.get(kind);
    return {kind,decision:found?.decision??null,
      independent:Boolean(found && found.reviewerPersonId!==authorPersonId),
      evidenceCurrent:Boolean(found?.evidenceVersionId && validEvidenceIds.has(found.evidenceVersionId))};
  });
  return {ready:required.every(x=>x.decision==="approved"&&x.independent&&x.evidenceCurrent),required};
}

export function surveyApprovalDatabaseRole(context: Pick<CommandContext,"capabilities"|"scope">,purpose:"survey_reviewer"|"survey_publisher") {
  const capability=purpose==="survey_reviewer"?"survey.review":"survey.publish";
  if (!context.capabilities.has(capability)) throw new AuthorizationError(capability);
  const ids=context.scope.organizationIds??[];
  if (ids.length!==1 || !z.string().uuid().safeParse(ids[0]).success)
    throw new AuthorizationError("one canonical survey organization");
  return "can_v30_"+purpose+"_"+ids[0]!.replaceAll("-","").toLowerCase();
}
