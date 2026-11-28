import {and,eq,gt,isNull,inArray,sql} from "drizzle-orm";
import {db} from "@/db/client";
import {accessAccounts,accessSessions,accountPersonGrants,programs,sites as schoolSites} from "@/db/schema";
import {AuthorizationError,assertCapability} from "@/domain/command-context";
import {assertSingleAccountPerson,resolveAccessContext,authorizedProgramIds,type AccessContext} from "@/domain/access-context";
import {accessSessionCookie,hashAccessSecret,sessionIdleCutoff} from "@/domain/access-tokens";
import {readSessionGrants, readOwnerDelegationGrants} from "./session-grants.server";
import { readCookie } from "@/domain/session-cookies";
import { assertRawAccountPerson } from "./unambiguous-adult-account.server";
import { authorizedProgramWhere } from "./authorized-program-query.server";
import { isDemoAccountEmail } from "@/domain/domain-classification";
import { sessionCredentialMode } from "@/domain/session-credential-policy";
import { getVerifiedPlatformOwnerSession, mayActAsDelegationTarget } from "./platform-owner-delegation.server";

/**
 * Resolve the account and active persona from a server-issued session.
 * Never use client-supplied actor IDs, role names or localStorage to grant access.
 */
type SessionFailure = "cookie_missing" | "cookie_invalid" | "session_configuration" | "session_not_current" | "membership_unavailable";
function rejectSession(_request: Request, reason: SessionFailure): never {
 // Only fixed categories enter logs. Never include headers, tokens, hashes,
 // account identifiers, grant identifiers, request URLs or driver exceptions.
 // Missing cookies on ordinary public page loads are expected, not warnings.
 if (reason !== "cookie_missing")
  console.warn("Session validation rejected", { reason });
 throw new AuthorizationError(reason === "membership_unavailable" ? "active membership" : "authenticated session");
}
export async function getIdentityContext(request: Request, options: {allowExpiredOwnerRecovery?:boolean} = {}): Promise<AccessContext> {
 const value=readCookie(request,accessSessionCookie);
 if(!value) return rejectSession(request,"cookie_missing");
 if(!/^[A-Za-z0-9_-]{40,}$/.test(value)) return rejectSession(request,"cookie_invalid");
 const pepper=process.env.CAN_ACCESS_TOKEN_PEPPER;
 if(!pepper || pepper.length<32) return rejectSession(request,"session_configuration");
 const digest=hashAccessSecret(value,pepper);
 const now=new Date();
 const [session]=await db.select({
  id:accessSessions.id,accountId:accessSessions.accountId,activeGrantId:accessSessions.activeGrantId,
  email:accessAccounts.emailNormalized,emailVerifiedAt:accessAccounts.emailVerifiedAt,
  accountPersonId:accessAccounts.personId,
  authenticationMethod:accessSessions.authenticationMethod,
  privateCredential:sql<boolean>`(${accessAccounts.privateAccessCodeHash} IS NOT NULL)`,
  sharedDevice:accessSessions.sharedDevice,lastActivityAt:accessSessions.lastActivityAt,
  delegatedGrantId:accessSessions.delegatedGrantId,
  delegatedMode:accessSessions.delegatedMode,
  delegatedUntil:accessSessions.delegatedUntil,
 }).from(accessSessions)
  .innerJoin(accessAccounts,eq(accessAccounts.id,accessSessions.accountId))
  .where(and(eq(accessSessions.secretHash,digest),isNull(accessSessions.revokedAt),gt(accessSessions.expiresAt,now),
   gt(accessSessions.updatedAt,sessionIdleCutoff(now)),eq(accessAccounts.disabled,false)))
  .limit(1);
 // Only real email-link logins attest mailbox ownership. A .demo session
 // must instead pass the exact active grant and tenant binding checks below.
 if(!session || (!session.emailVerifiedAt && !isDemoAccountEmail(session.email)) ||
    sessionCredentialMode({email:session.email,privateCredential:session.privateCredential,authenticationMethod:session.authenticationMethod})==="denied")
  return rejectSession(request,"session_not_current");
 if(session.sharedDevice&&now.getTime()-session.lastActivityAt.getTime()>=5*60_000)
  return rejectSession(request,"session_not_current");
 const {grants}=await readSessionGrants(session.accountId,session.email,db,session.authenticationMethod);
 // Every direct session belongs to exactly one immutable Person. No public
 // credential or demo classification may switch to another Account.
 const activeGrant=grants.find(grant=>grant.id===session.activeGrantId && grant.accountId===session.accountId);
 if(!activeGrant || !session.accountPersonId || session.accountPersonId!==activeGrant.personId)
  return rejectSession(request,"membership_unavailable");
 try{
  await assertRawAccountPerson(session.accountId,activeGrant.personId);
  assertSingleAccountPerson(session.accountId,grants);
 }catch{return rejectSession(request,"membership_unavailable");}
 // A Platform Owner's actual grant remains active on the original session.
 // The impersonated Person is an independently verified, expiring projection,
 // never a browser-provided role or permanent membership transfer.
 let effectiveGrant=activeGrant;
 let effectiveGrants=grants;
 let ownerDelegation: { mode:"view"|"act"; expiresAt:Date }|null=null;
 // Expired delegation must not silently elevate a stale browser mutation.
 // Show the owner in read-only mode until the explicit Return action clears it.
 if(session.delegatedGrantId&&session.delegatedUntil&&session.delegatedUntil<=now){
  const owner=await getVerifiedPlatformOwnerSession(request);
  if(activeGrant.role!=="platform_owner"||activeGrant.id!==owner.grantId||
     owner.delegatedGrantId!==session.delegatedGrantId || owner.delegatedUntil?.getTime()!==session.delegatedUntil.getTime())
   return rejectSession(request,"membership_unavailable");
  if(request.method!=="GET"||!options.allowExpiredOwnerRecovery)throw new AuthorizationError("expired owner delegation: return to Platform Owner");
  ownerDelegation={mode:"view",expiresAt:session.delegatedUntil};
 }else if(session.delegatedGrantId){
  const owner=await getVerifiedPlatformOwnerSession(request);
  if(activeGrant.role!=="platform_owner"||activeGrant.id!==owner.grantId||
     owner.delegatedGrantId!==session.delegatedGrantId || owner.delegatedMode!==session.delegatedMode ||
     owner.delegatedUntil?.getTime()!==session.delegatedUntil?.getTime() ||
     session.delegatedMode!=="view"&&session.delegatedMode!=="act"||
     !session.delegatedUntil||session.delegatedUntil<=now)
   return rejectSession(request,"membership_unavailable");
  // View As never runs mutations, including privileged server functions.
  if(session.delegatedMode==="view"&&request.method!=="GET")
   throw new AuthorizationError("read-only owner delegation");
  const [target]=await db.select({
   accountId:accountPersonGrants.accountId,
   personId:accountPersonGrants.personId,
   role:accountPersonGrants.role,
   email:accessAccounts.emailNormalized,
   accountPersonId:accessAccounts.personId,
  }).from(accountPersonGrants)
   .innerJoin(accessAccounts,eq(accessAccounts.id,accountPersonGrants.accountId))
   .where(and(eq(accountPersonGrants.id,session.delegatedGrantId),
      eq(accountPersonGrants.active,true),eq(accessAccounts.disabled,false))).limit(1);
  if(!target||target.role==="platform_owner"||target.accountId===owner.ownerAccountId||
     !target.accountPersonId||target.accountPersonId!==target.personId)
   return rejectSession(request,"membership_unavailable");
  try{await assertRawAccountPerson(target.accountId,target.personId);}
  catch{return rejectSession(request,"membership_unavailable");}
  const eligible=await readOwnerDelegationGrants(target.accountId,target.personId,target.email);
  const exact=eligible.find(grant=>grant.id===session.delegatedGrantId&&grant.active);
  if(!exact)return rejectSession(request,"membership_unavailable");
  if(session.delegatedMode==="act" && !await mayActAsDelegationTarget(exact))
   throw new AuthorizationError("independent protected reviewer role");
  effectiveGrant=exact;
  effectiveGrants=eligible;
  ownerDelegation={mode:session.delegatedMode,expiresAt:session.delegatedUntil};
 }
 // A malformed Site membership must never expand into a different tenant.
 if(effectiveGrant.siteId){
  const [site]=await db.select({organizationId:schoolSites.organizationId}).from(schoolSites)
   .where(eq(schoolSites.id,effectiveGrant.siteId)).limit(1);
  if(!site||!effectiveGrant.organizationId||site.organizationId!==effectiveGrant.organizationId)
   return rejectSession(request,"membership_unavailable");
 }
 const context=resolveAccessContext({
  accountId:effectiveGrant.accountId,
  sessionId:session.id,activeGrantId:effectiveGrant.id,
 },effectiveGrants);
 context.authenticationMethod=session.authenticationMethod;
 if(ownerDelegation){
  context.impersonatedByAccountId=session.accountId;
  context.delegatedByPlatformOwner=true;
  context.delegationMode=ownerDelegation.mode;
  context.delegationExpiresAt=ownerDelegation.expiresAt.toISOString();
 }
 // A relationship manager has consent-workflow authority only, not implicit
 // Site, Program or learner-record access. Resource choices are resolved by
 // the dedicated relationship service; ordinary academic scopes stay empty.
 if(context.role==="reporting_relationship_manager"||context.role==="deployment_readiness_reviewer"){
  if(context.grantSiteId!==null||context.scope.organizationIds?.length!==1)
   throw new AuthorizationError("organization-wide reporting relationship appointment");
  context.scope.siteIds=[];
  context.scope.programIds=[];
  return context;
 }
 // Program authorization derives from the verified active organization grant, not a browser claim.
 const organizations=context.scope.organizationIds??[];
 const grantSites=context.scope.siteIds??[];
 // Site expansion and Program reads are independent once the verified grant
 // breadth is known. Run both DB reads concurrently, without caching grants or
 // reusing identity contexts across requests. Preserve original grantSites when
 // projecting Program scope so a Site grant never expands to sibling Sites.
 const [ownedSites, permittedPrograms] = await Promise.all([
  organizations.length && !grantSites.length
   ? db.select({id:schoolSites.id}).from(schoolSites)
      .where(inArray(schoolSites.organizationId,organizations))
   : Promise.resolve(null),
  organizations.length
   ? db.select({id:programs.id,siteId:programs.siteId}).from(programs)
.where(authorizedProgramWhere(organizations, grantSites))
   : Promise.resolve([]),
 ]);
 if(ownedSites) context.scope.siteIds=ownedSites.map(site=>site.id);
 context.scope.programIds=authorizedProgramIds(permittedPrograms,organizations,grantSites);
 return context;
}

/**
 * Compatibility entrypoint for unmigrated school academic screens only.
 * Native Classes must call getIdentityContext, never rely on Section scope.
 */
export async function getCommandContext(request: Request): Promise<AccessContext> {
  const context = await getIdentityContext(request);
  if (context.role !== "teacher") return context;
  const { projectRetiringSchoolSectionScope } =
    await import("./retiring-school-section-scope.server");
  return projectRetiringSchoolSectionScope(context);
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
