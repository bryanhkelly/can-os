import { sql } from "drizzle-orm";
import { getRequest } from "@tanstack/react-start/server";
import { db } from "@/db/client";
import { canonicalSessionRowSchema } from "@/domain/canonical-access";
import { AuthorizationError, type CommandContext } from "@/domain/command-context";
import { accessSessionCookie, hashAccessSecret } from "@/domain/access-tokens";
import { readCookie } from "@/domain/session-cookies";
import { getIdentityContext } from "@/modules/identity/command-context.server";
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
  const raw=readCookie(request,accessSessionCookie);
  const pepper=process.env.CAN_ACCESS_TOKEN_PEPPER;
  if(!raw || !/^[A-Za-z0-9_-]{40,}$/.test(raw) || !pepper || pepper.length<32)
    throw new AuthorizationError("current CAN facilitator session");
  const digest=hashAccessSecret(raw,pepper);
  const result=await tx.execute(sql`
    SELECT account_id,session_id,grant_id,person_id,
      role_code,organization_id,site_id
    FROM education_v30.v301_can_staff_session_context(${digest}::text)
  `);
  if(result.rows.length!==1)
    throw new AuthorizationError("active canonical room facilitator session");
  const row=canonicalSessionRowSchema.parse(result.rows[0]);
  // The request must still be using the same selected CAN grant, not merely
  // another currently valid role for the same Person at the same Site.
  const selected=await getIdentityContext(request);
  if(selected.sessionAccountId || selected.role!=="room_facilitator" ||
     selected.sessionId!==row.session_id || selected.accountId!==row.account_id ||
     selected.grantId!==row.grant_id || selected.actorPersonId!==row.person_id ||
     selected.grantSiteId!==row.site_id)
    throw new AuthorizationError("unchanged selected facilitator grant and session");
  if(row.role_code!=="room_facilitator" ||
     row.person_id!==actor.actorPersonId ||
     row.organization_id!==actor.scope.organizationIds[0] ||
     row.site_id!==actor.scope.siteIds[0])
    throw new AuthorizationError("unchanged exact current Class facilitator");
}
