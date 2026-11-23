import {and,eq,gt,isNull,inArray,isNotNull} from "drizzle-orm";
import {db} from "@/db/client";
import {accessAccounts,accessSessions,accountPersonGrants,programs,sites as schoolSites} from "@/db/schema";
import {AuthorizationError,assertCapability} from "@/domain/command-context";
import {assertSingleAccountPerson,resolveAccessContext,authorizedProgramIds,type AccessContext} from "@/domain/access-context";
import {accessSessionCookie,hashAccessSecret,sessionIdleCutoff} from "@/domain/access-tokens";
import {readSessionGrants} from "./session-grants.server";
import { readCookie } from "@/domain/session-cookies";
import { assertRawAccountPerson } from "./unambiguous-adult-account.server";
import { authorizedProgramWhere } from "./authorized-program-query.server";
import { getVerifiedPlatformOwnerSession } from "./platform-owner-delegation.server";

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
export async function getIdentityContext(request: Request): Promise<AccessContext> {
 const value=readCookie(request,accessSessionCookie);
 if(!value) return rejectSession(request,"cookie_missing");
 if(!/^[A-Za-z0-9_-]{40,}$/.test(value)) return rejectSession(request,"cookie_invalid");
 const pepper=process.env.CAN_ACCESS_TOKEN_PEPPER;
 if(!pepper || pepper.length<32) return rejectSession(request,"session_configuration");
 const digest=hashAccessSecret(value,pepper);
 const now=new Date();
 const [session]=await db.select({
  id:accessSessions.id,accountId:accessSessions.accountId,activeGrantId:accessSessions.activeGrantId,
  email:accessAccounts.emailNormalized,accountPersonId:accessAccounts.personId,
  sharedDevice:accessSessions.sharedDevice,lastActivityAt:accessSessions.lastActivityAt,
  delegatedGrantId:accessSessions.delegatedGrantId,
  delegatedMode:accessSessions.delegatedMode,
  delegatedUntil:accessSessions.delegatedUntil,
 }).from(accessSessions)
  .innerJoin(accessAccounts,eq(accessAccounts.id,accessSessions.accountId))
  .where(and(eq(accessSessions.secretHash,digest),isNull(accessSessions.revokedAt),gt(accessSessions.expiresAt,now),
   gt(accessSessions.updatedAt,sessionIdleCutoff(now)),eq(accessAccounts.disabled,false),
   isNotNull(accessAccounts.emailVerifiedAt)))
  .limit(1);
 if(!session) return rejectSession(request,"session_not_current");
 if(session.sharedDevice&&now.getTime()-session.lastActivityAt.getTime()>=5*60_000)
  return rejectSession(request,"session_not_current");
 const {grants,demoAccountSwitching}=await readSessionGrants(session.accountId,session.email);
 // A real login cannot change Person by switching its active grant. This
 // invariant applies across all Site and Organization roles, not just staff.
 if(!demoAccountSwitching){
  // readSessionGrants deliberately filters some memberships (for example
  // unaccepted sandbox invitations). That filtered set is NOT adequate to
  // establish the one-Person account invariant. Check the underlying active
  // grants instead, before selecting a persona or expanding Site authority.
  const activePerson=grants.find(grant=>grant.id===session.activeGrantId)?.personId;
  // The account Person anchor is authoritative and immutable. A valid
  // membership cannot silently point at someone else after a role switch.
  if(!activePerson || !session.accountPersonId ||
     session.accountPersonId!==activePerson)
   return rejectSession(request,"membership_unavailable");
  try{await assertRawAccountPerson(session.accountId, activePerson);}
  catch{return rejectSession(request,"membership_unavailable");}
  try{assertSingleAccountPerson(session.accountId,grants);}
  catch{return rejectSession(request,"membership_unavailable");}
 }
 const activeGrant=grants.find(grant=>grant.id===session.activeGrantId);
 if(!activeGrant)return rejectSession(request,"membership_unavailable");
 // Demo Admin is the only permitted cross-account switcher. The selected
 // Person is authenticated through the privileged owner's current session,
 // but their own account verification, identity and grants remain ordinary.
 // Invalid/revoked target credentials cannot silently become valid via demo.
 if(demoAccountSwitching && activeGrant.accountId!==session.accountId){
  const [target]=await db.select({
   personId:accessAccounts.personId,
  }).from(accessAccounts).where(and(
   eq(accessAccounts.id,activeGrant.accountId),
   eq(accessAccounts.disabled,false),
   isNotNull(accessAccounts.emailVerifiedAt),
  )).limit(1);
  if(!target || target.personId!==activeGrant.personId)
   return rejectSession(request,"membership_unavailable");
  try { await assertRawAccountPerson(activeGrant.accountId,activeGrant.personId); }
  catch { return rejectSession(request,"membership_unavailable"); }
 }
 // A Platform Owner's actual grant remains active on the original session.
 // The impersonated Person is an independently verified, expiring projection,
 // never a browser-provided role or permanent membership transfer.
 let effectiveGrant=activeGrant;
 let effectiveGrants=grants;
 let ownerDelegation: { mode:"view"|"act"; expiresAt:Date }|null=null;
 // Expiration restores the original owner's identity without granting further
 // delegated access. No GET side effect or background session refresh is needed.
 if(session.delegatedGrantId&&session.delegatedUntil&&session.delegatedUntil<=now){
  // The expired grant is ignored. The explicit Return action clears it.
 }else if(session.delegatedGrantId){
  const owner=await getVerifiedPlatformOwnerSession(request);
  if(activeGrant.role!=="platform_owner"||activeGrant.id!==owner.grantId||
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
      eq(accountPersonGrants.active,true),eq(accessAccounts.disabled,false),
      isNotNull(accessAccounts.emailVerifiedAt))).limit(1);
  if(!target||target.role==="platform_owner"||target.accountId===owner.ownerAccountId||
     !target.accountPersonId||target.accountPersonId!==target.personId)
   return rejectSession(request,"membership_unavailable");
  try{await assertRawAccountPerson(target.accountId,target.personId);}
  catch{return rejectSession(request,"membership_unavailable");}
  const eligible=await readSessionGrants(target.accountId,target.email);
  const exact=eligible.grants.find(grant=>grant.id===session.delegatedGrantId&&grant.active);
  if(!exact)return rejectSession(request,"membership_unavailable");
  if(session.delegatedMode==="act" &&
      ["academic_content_reviewer","can_credential_reviewer","can_jurisdiction_reviewer",
       "can_network_steward","app_admin","network_admin",
       "safeguarding_responder","safeguarding_lead"].includes(exact.role))
   throw new AuthorizationError("independent protected reviewer role");
  effectiveGrant=exact;
  effectiveGrants=eligible.grants;
  ownerDelegation={mode:session.delegatedMode,expiresAt:session.delegatedUntil};
 }
 const context=resolveAccessContext({
  accountId:effectiveGrant.accountId,
  sessionId:session.id,activeGrantId:effectiveGrant.id,
 },effectiveGrants);
 if(ownerDelegation){
  context.impersonatedByAccountId=session.accountId;
  context.delegatedByPlatformOwner=true;
  context.delegationMode=ownerDelegation.mode;
  context.delegationExpiresAt=ownerDelegation.expiresAt.toISOString();
 }
 // Delegation is established ONLY by the server-verified Demo Admin login
 // and selected active target grant. Downstream services receive the ordinary
 // effective actor and use identical role, Site, Class and enrollment checks.
 // Keep the session owner separately for audit, not as a domain authorization
 // exclusion that turns demo data into a different application.
 if(!ownerDelegation && demoAccountSwitching && activeGrant.accountId!==session.accountId)
  context.impersonatedByAccountId=session.accountId;
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
