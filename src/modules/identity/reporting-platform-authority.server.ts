import {eq} from "drizzle-orm";
import {db} from "@/db/client";
import {accessAccounts} from "@/db/schema";
import {getCommandContext} from "@/modules/identity/command-context.server";
import {AuthorizationError,assertCapability} from "@/domain/command-context";
import {isDemoAccountEmail} from "@/domain/local-demo-access";

/** Account-wide, independently verified platform authority. Never inherit
 * this privilege from a delegated operating role or a tenant grant. */
export async function requireReportingPlatformAdministrator(request:Request){
 const actor=await getCommandContext(request);
 assertCapability(actor,"platform.admin");
 if(!["app_admin","platform_owner"].includes(actor.role)||actor.sessionAccountId||actor.delegationMode||!actor.actorPersonId||!actor.accountId||actor.grantSiteId||
    (actor.scope.organizationIds?.length??0)>0||(actor.scope.siteIds?.length??0)>0)
   throw new AuthorizationError("independently scoped platform administrator");
 const [account]=await db.select({verifiedAt:accessAccounts.emailVerifiedAt,disabled:accessAccounts.disabled,email:accessAccounts.emailNormalized})
  .from(accessAccounts).where(eq(accessAccounts.id,actor.accountId)).limit(1);
 if(!account?.verifiedAt||account.disabled||isDemoAccountEmail(account.email))throw new AuthorizationError("verified non-demo platform administrator");
 return actor;
}
