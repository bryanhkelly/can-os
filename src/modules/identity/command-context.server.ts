import {and,eq,gt,isNull,inArray} from "drizzle-orm";
import {db} from "@/db/client";
import {accessAccounts,accessSessions,accountPersonGrants,programs} from "@/db/schema";
import {AuthorizationError,assertCapability} from "@/domain/command-context";
import {resolveAccessContext,authorizedProgramIds,type AccessContext} from "@/domain/access-context";
import {accessSessionCookie,hashAccessSecret} from "@/domain/access-tokens";

/**
 * Resolve the account and active persona from a server-issued session.
 * Never use client-supplied actor IDs, role names or localStorage to grant access.
 */
export async function getCommandContext(request: Request): Promise<AccessContext> {
 const cookie=request.headers.get("cookie")??"";
 const entry=cookie.split(";").map(x=>x.trim()).find(x=>x.startsWith(accessSessionCookie+"="));
 const value=entry?.slice(accessSessionCookie.length+1);
 if(!value || !/^[A-Za-z0-9_-]{40,}$/.test(value)) throw new AuthorizationError("authenticated session");
 const pepper=process.env.CAN_ACCESS_TOKEN_PEPPER;
 if(!pepper) throw new AuthorizationError("authenticated session");
 const digest=hashAccessSecret(value,pepper);
 const now=new Date();
 const [session]=await db.select({
  id:accessSessions.id,accountId:accessSessions.accountId,activeGrantId:accessSessions.activeGrantId
 }).from(accessSessions)
  .innerJoin(accessAccounts,eq(accessAccounts.id,accessSessions.accountId))
  .where(and(eq(accessSessions.secretHash,digest),isNull(accessSessions.revokedAt),gt(accessSessions.expiresAt,now),
   eq(accessAccounts.disabled,false)))
  .limit(1);
 if(!session) throw new AuthorizationError("authenticated session");
 const grants=await db.select({
  id:accountPersonGrants.id,accountId:accountPersonGrants.accountId,personId:accountPersonGrants.personId,
  role:accountPersonGrants.role,organizationId:accountPersonGrants.organizationId,
  siteId:accountPersonGrants.siteId,active:accountPersonGrants.active,
 }).from(accountPersonGrants).where(and(eq(accountPersonGrants.accountId,session.accountId),eq(accountPersonGrants.active,true)));
 const context=resolveAccessContext({
  accountId:session.accountId,sessionId:session.id,activeGrantId:session.activeGrantId,
 },grants);
 // Program authorization derives from the verified active organization grant, not a browser claim.
 const organizations=context.scope.organizationIds??[];
 const sites=context.scope.siteIds??[];
 // Fail closed for a grant without an organization; site-specific grants must not inherit all organization programs.
 context.scope.programIds=[];
 if(organizations.length){
  const permitted=await db.select({id:programs.id,siteId:programs.siteId}).from(programs).where(inArray(programs.organizationId,organizations));
  context.scope.programIds=authorizedProgramIds(permitted,organizations,sites);
 }
 return context;
}

/** Higher-level server functions may add a resource relationship guard. */
export async function withAuth<T>(
 request: Request,
 capability: string,
 handler: (context: AccessContext)=>Promise<T>,
 resourceGuard?: (context:AccessContext)=>Promise<void>,
): Promise<T> {
 const context=await getCommandContext(request);
 assertCapability(context,capability);
 if(resourceGuard) await resourceGuard(context);
 return handler(context);
}
