import { sql } from "drizzle-orm";
import { getRequest } from "@tanstack/react-start/server";
import { db } from "@/db/client";
import { canonicalSessionRowSchema } from "@/domain/canonical-access";
import { AuthorizationError, type CommandContext } from "@/domain/command-context";
import { canonicalSessionDigestFromRequest } from "@/modules/identity/canonical-command-context.server";
import { assertCurrentCanonicalStaffForMutation } from "@/modules/identity/canonical-transaction-authorization.server";

type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Revalidate a facilitator's current bearer session inside the same
 * transaction as a Class Session scheduling or opening write.
 * A Class assignment and Site grant alone are not an active login.
 */
export async function assertCurrentNativeClassFacilitatorSession(
  tx:Tx,actor:CommandContext,
):Promise<void>{
  const request=getRequest();
  if(!actor.actorPersonId ||
     actor.scope.organizationIds?.length!==1 ||
     actor.scope.siteIds?.length!==1)
    throw new AuthorizationError("one exact current Class facilitator principal");
  if(actor.role==="site_admin"||actor.role==="registrar"){
    await assertCurrentCanonicalStaffForMutation(tx,request,actor);
    return;
  }
  if(actor.role!=="room_facilitator" || !actor.capabilities.has("learning.room.facilitate"))
    throw new AuthorizationError("current canonical room facilitator");
  const digest=canonicalSessionDigestFromRequest(request);
  const result=await tx.execute(sql`
    SELECT account_id,session_id,grant_id,person_id,
      role_code,organization_id,site_id
    FROM education_v30.v301_canonical_session_context(${digest}::text)
  `);
  if(result.rows.length!==1)
    throw new AuthorizationError("active canonical room facilitator session");
  const row=canonicalSessionRowSchema.parse(result.rows[0]);
  if(row.role_code!=="room_facilitator" ||
     row.person_id!==actor.actorPersonId ||
     row.organization_id!==actor.scope.organizationIds[0] ||
     row.site_id!==actor.scope.siteIds[0])
    throw new AuthorizationError("unchanged exact current Class facilitator");
}
