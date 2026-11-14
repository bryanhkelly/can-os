import { z } from "zod";
import { AuthorizationError, type CommandContext } from "@/domain/command-context";

export const requiredSurveyReviews = ["privacy","accessibility","safeguarding"] as const;
export const recordSurveyReviewInput = z.object({
  surveyVersionId: z.string().uuid(),
  kind: z.enum(requiredSurveyReviews),
  decision: z.enum(["approved","rejected"]),
}).strict();
export const publishSurveyInput = z.object({
  surveyVersionId: z.string().uuid(),
}).strict();

export type SurveyReviewRow = {
  kind: string; decision: string; reviewerPersonId: string; decisionOrder: bigint;
};
/** Only the latest decision in each domain may satisfy the independent gate. */
export function reviewGate(
  authorPersonId: string,
  reviews: readonly SurveyReviewRow[],
): {ready: boolean; required: {kind: typeof requiredSurveyReviews[number]; decision: string | null; independent: boolean}[]} {
  const latest = new Map<string,SurveyReviewRow>();
  for (const row of reviews) {
    const previous=latest.get(row.kind);
    if (!previous || row.decisionOrder>previous.decisionOrder) latest.set(row.kind,row);
  }
  const required=requiredSurveyReviews.map(kind=>{
    const found=latest.get(kind);
    return {kind,decision:found?.decision??null,
      independent:Boolean(found && found.reviewerPersonId!==authorPersonId)};
  });
  return {ready:required.every(x=>x.decision==="approved"&&x.independent),required};
}

export function surveyApprovalDatabaseRole(context: Pick<CommandContext,"capabilities"|"scope">,purpose:"survey_reviewer"|"survey_publisher") {
  const capability=purpose==="survey_reviewer"?"survey.review":"survey.publish";
  if (!context.capabilities.has(capability)) throw new AuthorizationError(capability);
  const ids=context.scope.organizationIds??[];
  if (ids.length!==1 || !z.string().uuid().safeParse(ids[0]).success)
    throw new AuthorizationError("one canonical survey organization");
  return "can_v30_"+purpose+"_"+ids[0]!.replaceAll("-","").toLowerCase();
}
