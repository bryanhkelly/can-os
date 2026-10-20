import {and,eq,gt,isNull,inArray} from "drizzle-orm";
import {db} from "@/db/client";
import {accessAccounts,accessSessions,accountPersonGrants,programs,sites as schoolSites} from "@/db/schema";
import {AuthorizationError,assertCapability} from "@/domain/command-context";
import {resolveAccessContext,authorizedProgramIds,type AccessContext} from "@/domain/access-context";
import {accessSessionCookie,hashAccessSecret} from "@/domain/access-tokens";
import {LOCAL_DEMO_ADMIN} from "@/domain/local-demo-access";
import {listDemoFacilitatorGrants} from "./demo-facilitator.server";

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
 const grants=session.accountId===LOCAL_DEMO_ADMIN.accountId?await listDemoFacilitatorGrants(db):await db.select({
  id:accountPersonGrants.id,accountId:accountPersonGrants.accountId,personId:accountPersonGrants.personId,
  role:accountPersonGrants.role,organizationId:accountPersonGrants.organizationId,
  siteId:accountPersonGrants.siteId,active:accountPersonGrants.active,
 }).from(accountPersonGrants).where(and(eq(accountPersonGrants.accountId,session.accountId),eq(accountPersonGrants.active,true)));
 const selected=grants.find(grant=>grant.id===session.activeGrantId);
 const context=resolveAccessContext({
  accountId:session.accountId===LOCAL_DEMO_ADMIN.accountId&&selected?selected.accountId:session.accountId,
  sessionId:session.id,activeGrantId:session.activeGrantId,
 },grants);
 if(session.accountId===LOCAL_DEMO_ADMIN.accountId){
  context.demoFacilitator={
   accountId:LOCAL_DEMO_ADMIN.accountId,personId:LOCAL_DEMO_ADMIN.personId,sourceAccountId:context.accountId,
  };
  context.accountId=session.accountId;
 }
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
