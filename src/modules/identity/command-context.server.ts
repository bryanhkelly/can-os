import {and,eq,gt,isNull,inArray} from "drizzle-orm";
import {db} from "@/db/client";
import {accessAccounts,accessSessions,programs,sites as schoolSites} from "@/db/schema";
import {AuthorizationError,assertCapability} from "@/domain/command-context";
import {AuthenticationRequiredError} from "@/domain/errors";
import {resolveAccessContext,authorizedProgramIds,type AccessContext} from "@/domain/access-context";
import {accessSessionCookie,hashAccessSecret} from "@/domain/access-tokens";
import {
 isDemoAccountEmail,
} from "@/domain/local-demo-access";
import {readSessionGrants} from "./session-grants.server";

/**
 * Resolve the account and active persona from a server-issued session.
 * Never use client-supplied actor IDs, role names or localStorage to grant access.
 */
export async function getCommandContext(request: Request): Promise<AccessContext> {
 const cookie=request.headers.get("cookie")??"";
 const entry=cookie.split(";").map(x=>x.trim()).find(x=>x.startsWith(accessSessionCookie+"="));
 const value=entry?.slice(accessSessionCookie.length+1);
 if(!value || !/^[A-Za-z0-9_-]{40,}$/.test(value)) throw new AuthenticationRequiredError();
 const pepper=process.env.CAN_ACCESS_TOKEN_PEPPER;
 if(!pepper) throw new Error("CAN_ACCESS_TOKEN_PEPPER is not configured");
 const digest=hashAccessSecret(value,pepper);
 const now=new Date();
 const [session]=await db.select({
  id:accessSessions.id,accountId:accessSessions.accountId,activeGrantId:accessSessions.activeGrantId,
  email:accessAccounts.emailNormalized,
  emailVerifiedAt:accessAccounts.emailVerifiedAt,
 }).from(accessSessions)
  .innerJoin(accessAccounts,eq(accessAccounts.id,accessSessions.accountId))
  .where(and(eq(accessSessions.secretHash,digest),isNull(accessSessions.revokedAt),gt(accessSessions.expiresAt,now),
   eq(accessAccounts.disabled,false)))
  .limit(1);
 if(!session) throw new AuthenticationRequiredError();
 const publicDemoAccount=isDemoAccountEmail(session.email);
 const {grants,demoAccountSwitching}=await readSessionGrants(session.accountId,session.email);
 const selected=grants.find(grant=>grant.id===session.activeGrantId);
 if(!selected)throw new AuthorizationError("active membership");
 const context=resolveAccessContext({
  accountId:selected.accountId,
  sessionId:session.id,activeGrantId:session.activeGrantId,
 },grants);
 if(demoAccountSwitching)context.sessionAccountId=session.accountId;
 if(context.role==="applicant"&&!publicDemoAccount&&!session.emailVerifiedAt)
  throw new AuthorizationError("verified applicant email");
 // Program authorization derives from the verified active organization grant, not a browser claim.
 const organizations=context.scope.organizationIds??[];
 const grantSites=context.scope.siteIds??[];
 // An organization-wide membership can operate its own sites; a site-specific
 // membership must NEVER broaden to sibling sites under the organization.
 if(organizations.length && !grantSites.length){
  const ownedSites=await db.select({id:schoolSites.id}).from(schoolSites)
   .where(inArray(schoolSites.organizationId,organizations));
  context.scope.siteIds=ownedSites.map(s=>s.id);
 }
 // Program scope is projected from the original grant breadth, not expanded
 // site IDs: an organization-wide grant may also own a site-less program.
 context.scope.programIds=[];
 if(organizations.length){
  const permitted=await db.select({id:programs.id,siteId:programs.siteId}).from(programs).where(inArray(programs.organizationId,organizations));
  context.scope.programIds=authorizedProgramIds(permitted,organizations,grantSites);
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
