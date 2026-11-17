import {and,eq,gt,isNull,inArray} from "drizzle-orm";
import {db} from "@/db/client";
import {accessAccounts,accessSessions,programs,sites as schoolSites} from "@/db/schema";
import {AuthorizationError,assertCapability} from "@/domain/command-context";
import {assertSingleAccountPerson,resolveAccessContext,authorizedProgramIds,type AccessContext} from "@/domain/access-context";
import {accessSessionCookie,hashAccessSecret,sessionIdleCutoff} from "@/domain/access-tokens";
import {readSessionGrants} from "./session-grants.server";
import { readCookie } from "@/domain/session-cookies";
import { assertRawAccountPerson } from "./unambiguous-adult-account.server";

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
 }).from(accessSessions)
  .innerJoin(accessAccounts,eq(accessAccounts.id,accessSessions.accountId))
  .where(and(eq(accessSessions.secretHash,digest),isNull(accessSessions.revokedAt),gt(accessSessions.expiresAt,now),
   gt(accessSessions.updatedAt,sessionIdleCutoff(now)),eq(accessAccounts.disabled,false)))
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
 const context=resolveAccessContext({
  accountId:activeGrant.accountId,
  sessionId:session.id,activeGrantId:session.activeGrantId,
 },grants);
 if(demoAccountSwitching)context.sessionAccountId=session.accountId;
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
