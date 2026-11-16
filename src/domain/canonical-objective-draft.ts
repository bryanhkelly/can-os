import { z } from "zod";
import { AuthorizationError, type CommandContext } from "@/domain/command-context";

const choice = z.string().trim().min(1).max(200);
export const canonicalObjectiveDraftInput = z.object({
  courseVersionId: z.string().uuid(),
  assessmentKey: z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9_-]{2,63}$/),
  title: z.string().trim().min(5).max(160),
  passingFraction: z.number().min(0.5).max(1),
  maxAttempts: z.number().int().min(1).max(5),
  questions: z.array(z.object({
    prompt: z.string().trim().min(5).max(500),
    choices: z.array(choice).min(2).max(6),
    correctIndex: z.number().int().min(0).max(5),
  }).strict().superRefine((question, ctx) => {
    if (question.correctIndex >= question.choices.length)
      ctx.addIssue({code:"custom",message:"Correct choice must be among published options"});
    if (new Set(question.choices.map(x=>x.toLowerCase())).size!==question.choices.length)
      ctx.addIssue({code:"custom",message:"Duplicate choice text"});
  })).min(1).max(10),
}).strict();
export type CanonicalObjectiveDraftInput=z.infer<typeof canonicalObjectiveDraftInput>;

/** Construct only from server-verified one-organization scope. Direct SQL
 * draft privileges remain denied unless a separately provisioned NOLOGIN
 * role is bound to that exact organization and purpose.
 */
export function canonicalAssessmentDraftDatabaseRole(
  actor: Pick<CommandContext,"scope"|"capabilities">,
):string{
  // Native Class staff currently receive class.manage; this is only a
  // preliminary application gate. The purpose-bound NOLOGIN DB role and
  // Course copyright owner check are still mandatory before any write.
  if(!actor.capabilities.has("curriculum.publish")&&
     !actor.capabilities.has("class.manage"))
    throw new AuthorizationError("canonical Course publisher capability");
  const ids=actor.scope.organizationIds;
  if(ids?.length!==1||!z.string().uuid().safeParse(ids[0]).success)
    throw new AuthorizationError("one verified Course publisher organization");
  return "can_v30_assess_draft_author_"+ids[0]!.replaceAll("-","").toLowerCase();
}

/** A local Class may issue fewer attempts than the publisher's published
 * maximum, but may never silently exceed the immutable Course policy.
 * Existing legacy assessment blueprints retain their previous behavior.
 */
export function assertPublisherObjectiveAttemptLimit(
  blueprint:unknown,attemptLimit:number,
):void{
  if(!blueprint||typeof blueprint!=="object"||Array.isArray(blueprint))return;
  const policy=blueprint as Record<string,unknown>;
  if(policy.source!=="course-activities")return;
  const limit=policy.maxAttempts;
  if(typeof limit!=="number"||!Number.isInteger(limit)||limit<1||limit>5||
      !Number.isInteger(attemptLimit)||attemptLimit<1||attemptLimit>limit)
    throw new AuthorizationError("local Class assessment attempts exceed published Course policy");
}
