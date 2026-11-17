import { sql } from "drizzle-orm";
import type { db } from "@/db/client";
import { AuthorizationError, type CommandContext } from "@/domain/command-context";
import { assertNativeClassLearnerSessionForExit } from "@/domain/native-class-lifecycle";
import { canonicalSessionDigestFromRequest } from
  "@/modules/identity/canonical-command-context.server";

type Tx = Pick<typeof db, "execute">;

/** Revalidate the SAME currently authenticated native learner session inside
 * an enrollment transaction. A person can enroll in a publicly published Class
 * operated by a different Organization: check the current learner's home-org
 * grant, never assert that their home Organization owns the Class provider.
 *
 * This is current-session evidence only. Class/course Site and enrollment
 * eligibility are checked independently by the transaction's command.
 */
export async function assertCurrentNativeClassLearnerForMutation(
  tx:Tx,request:Request,actor:CommandContext,
):Promise<void>{
  if(!actor.actorPersonId || actor.role!=="learner" ||
     !actor.capabilities.has("learning.participate") ||
     actor.scope.organizationIds?.length!==1 ||
     actor.scope.siteIds?.length!==0){
    throw new AuthorizationError("exact native learner grant");
  }
  const digest=canonicalSessionDigestFromRequest(request);
  const session=await tx.execute(sql`
    SELECT person_id,role_code,organization_id,site_id
    FROM education_v30.v301_canonical_session_context(${digest}::text)
  `);
  if(session.rows.length!==1)
    throw new AuthorizationError("current canonical learner session");
  assertNativeClassLearnerSessionForExit(
    session.rows[0] as Record<string,unknown>,
    actor.actorPersonId,actor.scope.organizationIds[0],
  );
}
