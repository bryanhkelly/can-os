import { db } from "@/db/client";
import { accessAccounts,accessChallenges,accessSessions,accountPersonGrants,churchOnboardingRequests,people,programs } from "@/db/schema";
import { roleCapabilities } from "@/domain/access-context";
import { AuthorizationError } from "@/domain/command-context";
import { InvalidAccessCredentialError } from "@/domain/access-errors";
import { clearSessionCookieHeader,hashAccessSecret,issueOpaqueSecret,normalizeAccessEmail,sessionCookieHeader,sessionIdleCutoff } from "@/domain/access-tokens";
import {
 isDemoAccountEmail,isApprovedDemoGrant,
 LOCAL_DEMO_ACCESS_CODE,LOCAL_DEMO_ACCOUNTS,LOCAL_DEMO_ADMIN,
} from "@/domain/local-demo-access";
import {readSessionGrants} from "./session-grants.server";
import { recordSessionSecurityEvent } from "./session-security-audit.server";
import { and,desc,eq,gt,inArray,isNull,lt,sql } from "drizzle-orm";
import { sendAccessLinkViaResend,type AccessEmailSender } from "./resend-access-mail.server";
import { acceptStaffInvitations,listPendingStaffInvitations } from "./staff-invitations.server";

const CHALLENGE_LIFETIME_MS=10*60*1000;
const REQUEST_COOLDOWN_MS=60*1000;
const SESSION_LIFETIME_MS=12*60*60*1000;
const genericResult={accepted:true} as const;
function secretPepper():string {
 const value=process.env.CAN_ACCESS_TOKEN_PEPPER;
 if(!value || value.length<32) throw new Error("Access secret pepper not configured");
 return value;
}
function publicOrigin():string {
 const origin=process.env.CAN_ACCESS_PUBLIC_ORIGIN;
 if(!origin || new URL(origin).protocol!=="https:") throw new Error("HTTPS access origin must be configured");
 return new URL(origin).origin;
}
/** Internal server-only dispatch outcome. Never expose eligibility/cooldown
 * distinctions through the public passwordless request endpoint. */
type AccessDispatchOutcome = "dispatched" | "cooldown" | "ineligible";
async function issueOneTimeAccess(rawEmail:string, sender:AccessEmailSender):Promise<AccessDispatchOutcome> {
 const email=normalizeAccessEmail(rawEmail);
 if(isDemoAccountEmail(email))return "ineligible";
 const [account]=await db.select({id:accessAccounts.id}).from(accessAccounts)
  .where(and(eq(accessAccounts.emailNormalized,email),eq(accessAccounts.disabled,false))).limit(1);
 if(!account || email.endsWith(".invalid"))return "ineligible";
 const memberships=await db.select({role:accountPersonGrants.role}).from(accountPersonGrants)
  .innerJoin(people,eq(people.id,accountPersonGrants.personId))
  .where(and(eq(accountPersonGrants.accountId,account.id),eq(accountPersonGrants.active,true),
   eq(people.active,true)));
 const pendingInvitations=memberships.some(g=>Object.hasOwn(roleCapabilities,g.role))
  ?[]:await listPendingStaffInvitations(db,account.id);
 if(!memberships.some(g=>Object.hasOwn(roleCapabilities,g.role))&&!pendingInvitations.length)return "ineligible";
 const accessOrigin=publicOrigin();
 secretPepper(); // Fail before recording a challenge if sign-in is not configured.
 // Serialize concurrent requests for the same account before enforcing cooldown.
 // Without this transaction, simultaneous requests can each see zero recent challenges.
 const issued=await db.transaction(async tx=>{
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${account.id}))`);
  const now=new Date();
  const recent=await tx.select({id:accessChallenges.id}).from(accessChallenges)
   .where(and(eq(accessChallenges.accountId,account.id),gt(accessChallenges.createdAt,new Date(now.getTime()-REQUEST_COOLDOWN_MS)))).limit(1);
  if(recent.length)return null;
  const token=issueOpaqueSecret(),hash=hashAccessSecret(token,secretPepper());
  await tx.insert(accessChallenges).values({
   accountId:account.id,tokenHash:hash,expiresAt:new Date(now.getTime()+CHALLENGE_LIFETIME_MS),
  });
  return token;
 });
 if(!issued)return "cooldown";
 try {
  await sender({to:email,accessUrl:accessOrigin+"/access/verify#token="+encodeURIComponent(issued)});
 }catch(error){
  // Preserve the issued challenge and cooldown on delivery failure; a rapid retry
  // must not turn a mail-provider outage into unbounded request generation.
  // The link remains unusable unless the provider actually delivered it.
  throw error;
 }
 return "dispatched";
}
/** Public API remains deliberately indistinguishable for unknown accounts,
 * ineligible users, throttled retries and successfully dispatched mail. */
export async function requestOneTimeAccess(rawEmail:string, sender:AccessEmailSender=sendAccessLinkViaResend):Promise<typeof genericResult> {
 await issueOneTimeAccess(rawEmail,sender);
 return genericResult;
}
/** This privileged status is for already-authorized onboarding staff only.
 * Dispatched means the configured sender accepted the message, not inbox delivery. */
export async function requestOneTimeAccessWithDeliveryStatus(rawEmail:string):Promise<AccessDispatchOutcome> {
 return issueOneTimeAccess(rawEmail,sendAccessLinkViaResend);
}
/** A token is atomically consumed by its hash, allowing only one successful redemption. */
export async function redeemOneTimeAccess(rawToken:string):Promise<{setCookie:string;accountId:string;role:string;launchSiteId?:string}> {
 if(!/^[A-Za-z0-9_-]{40,}$/.test(rawToken))throw new InvalidAccessCredentialError();
 const hash=hashAccessSecret(rawToken,secretPepper()),now=new Date();
 return db.transaction(async tx=>{
  const [claimed]=await tx.update(accessChallenges).set({consumedAt:now})
   .where(and(eq(accessChallenges.tokenHash,hash),isNull(accessChallenges.consumedAt),
     gt(accessChallenges.expiresAt,now),lt(accessChallenges.attempts,5)))
   .returning({accountId:accessChallenges.accountId});
  if(!claimed)throw new InvalidAccessCredentialError();
  // A redeemed challenge is single-use even under simultaneous POSTs: the UPDATE
  // above atomically requires consumedAt IS NULL and returns at most one row.
  const [account]=await tx.select({id:accessAccounts.id,email:accessAccounts.emailNormalized}).from(accessAccounts)
   .where(and(eq(accessAccounts.id,claimed.accountId),eq(accessAccounts.disabled,false))).limit(1);
  if(!account||isDemoAccountEmail(account.email))throw new InvalidAccessCredentialError("Account unavailable");
  const grants=await tx.select({id:accountPersonGrants.id,role:accountPersonGrants.role}).from(accountPersonGrants)
   .innerJoin(people,eq(people.id,accountPersonGrants.personId))
   .where(and(eq(accountPersonGrants.accountId,account.id),eq(accountPersonGrants.active,true),
    eq(people.active,true)));
  const pending=await listPendingStaffInvitations(tx,account.id);
  const accepted=await acceptStaffInvitations(tx,account.id,pending,now);
  // A newly accepted church-onboarding grant takes priority over an older
  // membership so the first sign-in lands in that church's own setup workspace.
  const onboarding = accepted.length ? await tx.select({
    siteId: churchOnboardingRequests.siteId,
    invitationGrantId: churchOnboardingRequests.invitationGrantId,
  }).from(churchOnboardingRequests).where(and(
    eq(churchOnboardingRequests.status, "approved"),
    inArray(churchOnboardingRequests.invitationGrantId, accepted.map(invitation => invitation.id)),
  )).limit(1) : [];
  const onboardingInvitation = accepted.find(invitation =>
    invitation.id === onboarding[0]?.invitationGrantId);
  // The same leader may sign in again before completing setup. Prefer the
  // existing approved church grant over unrelated memberships, and resume that
  // exact Site rather than dropping them into a generic admissions workspace.
  const activeRegistrarIds = grants.filter(grant=>grant.role==="registrar").map(grant=>grant.id);
  const returningOnboarding = !onboardingInvitation && activeRegistrarIds.length
    ? await tx.select({
        siteId: churchOnboardingRequests.siteId,
        invitationGrantId: churchOnboardingRequests.invitationGrantId,
      }).from(churchOnboardingRequests).where(and(
        eq(churchOnboardingRequests.status, "approved"),
        inArray(churchOnboardingRequests.invitationGrantId, activeRegistrarIds),
      )).orderBy(desc(churchOnboardingRequests.approvedAt)).limit(1)
    : [];
  const returningGrant = grants.find(grant =>
    grant.id === returningOnboarding[0]?.invitationGrantId);
  const activeGrant=onboardingInvitation??returningGrant??
    grants.find(g=>Object.hasOwn(roleCapabilities,g.role))??accepted[0];
  if(!activeGrant)throw new InvalidAccessCredentialError("No supported CAN OS membership");
  const candidateLaunchSiteId=onboarding[0]?.siteId??returningOnboarding[0]?.siteId;
  // After the school becomes active, ordinary sign-in need not keep redirecting
  // the administrator through setup. Opening status is read, never inferred.
  const existingOpenSchool = candidateLaunchSiteId
    ? await tx.select({ id: programs.id }).from(programs)
        .where(and(eq(programs.siteId,candidateLaunchSiteId),eq(programs.status,"active"))).limit(1)
    : [];
  const launchSiteId=existingOpenSchool.length?undefined:candidateLaunchSiteId;
  const secret=issueOpaqueSecret();
  const [session]=await tx.insert(accessSessions).values({
   accountId:account.id,secretHash:hashAccessSecret(secret,secretPepper()),
   activeGrantId:activeGrant.id,expiresAt:new Date(now.getTime()+SESSION_LIFETIME_MS),
  }).returning({id:accessSessions.id});
  if(!session)throw new Error("Unable to establish session");
  await tx.update(accessAccounts).set({emailVerifiedAt:now,updatedAt:now}).where(eq(accessAccounts.id,account.id));
  const [member]=await tx.select({personId:accountPersonGrants.personId}).from(accountPersonGrants).where(eq(accountPersonGrants.id,activeGrant.id)).limit(1);
  if(!member)throw new Error("Membership unavailable");
  await recordSessionSecurityEvent(tx,{
   action:"identity.session.started",actorPersonId:member.personId,
   accountId:account.id,sessionAccountId:account.id,
   sessionId:session.id,grantId:activeGrant.id,
   role:activeGrant.role,method:"email_link",
  });
  return {accountId:account.id,role:activeGrant.role,
   ...(launchSiteId ? {launchSiteId} : {}),
   setCookie:sessionCookieHeader(secret,SESSION_LIFETIME_MS/1000)};
 });
}
/** Shared-code sign-in is limited to the fixed, tenant-scoped demo identities. */
export async function redeemDemoAccess(
 rawEmail:string,
 code:string,
):Promise<{setCookie:string;accountId:string;role:string}> {
 if(code!==LOCAL_DEMO_ACCESS_CODE) {
  throw new InvalidAccessCredentialError("Invalid demo credentials");
 }
 let email:string;
 try{email=normalizeAccessEmail(rawEmail);}catch{
  throw new InvalidAccessCredentialError("Invalid demo credentials");
 }
 if(!LOCAL_DEMO_ACCOUNTS.some(account=>account.email===email)) {
  throw new InvalidAccessCredentialError("Invalid demo credentials");
 }
 const now=new Date();
 return db.transaction(async tx=>{
  const [account]=await tx.select({id:accessAccounts.id,email:accessAccounts.emailNormalized})
   .from(accessAccounts)
   .where(and(eq(accessAccounts.emailNormalized,email),eq(accessAccounts.disabled,false)))
   .limit(1);
  if(!account)throw new InvalidAccessCredentialError("Invalid demo credentials");
  const {grants}=await readSessionGrants(account.id,account.email,tx);
  const accountGrants=grants.filter(candidate=>candidate.accountId===account.id);
  const grant=account.id===LOCAL_DEMO_ADMIN.accountId
   ?accountGrants.find(candidate=>candidate.id===LOCAL_DEMO_ADMIN.grantId)
   :accountGrants.length===1?accountGrants[0]:undefined;
  if(!grant||!isApprovedDemoGrant(grant,email))throw new InvalidAccessCredentialError("Invalid demo credentials");
  const secret=issueOpaqueSecret();
  const [session]=await tx.insert(accessSessions).values({
   accountId:account.id,
   secretHash:hashAccessSecret(secret,secretPepper()),
   activeGrantId:grant.id,
   expiresAt:new Date(now.getTime()+SESSION_LIFETIME_MS),
  }).returning({id:accessSessions.id});
  if(!session)throw new Error("Unable to establish session");
  await recordSessionSecurityEvent(tx,{
   action:"identity.session.started",actorPersonId:grant.personId,
   accountId:grant.accountId,sessionAccountId:account.id,
   sessionId:session.id,grantId:grant.id,
   role:grant.role,method:"local_demo_code",
  });
  return {
   accountId:account.id,
   role:grant.role,
   setCookie:sessionCookieHeader(secret,SESSION_LIFETIME_MS/1000),
  };
 });
}
/** Compatibility entry point used by the existing access-verification route. */
export const redeemLocalDemoAccess=redeemDemoAccess;
export async function revokeAccessSession(sessionId:string,accountId:string):Promise<string> {
 await db.transaction(async tx=>{
  const [row]=await tx.update(accessSessions).set({revokedAt:new Date(),updatedAt:new Date()})
   .where(and(eq(accessSessions.id,sessionId),eq(accessSessions.accountId,accountId),isNull(accessSessions.revokedAt))).returning({activeGrantId:accessSessions.activeGrantId});
  if(row?.activeGrantId){
   const [member]=await tx.select({
    accountId:accountPersonGrants.accountId,personId:accountPersonGrants.personId,
    role:accountPersonGrants.role,
   }).from(accountPersonGrants).where(eq(accountPersonGrants.id,row.activeGrantId)).limit(1);
   await recordSessionSecurityEvent(tx,{
    action:"identity.session.revoked",actorPersonId:member?.personId??null,
    accountId:member?.accountId??accountId,sessionAccountId:accountId,
    sessionId,grantId:row.activeGrantId,role:member?.role??null,
   });
  }
 });
 return clearSessionCookieHeader();
}
/** Selection is restricted to a grant assigned to the authenticated account. */
export async function selectAccessGrant(sessionId:string,accountId:string,grantId:string):Promise<void> {
 await db.transaction(async tx=>{
  const now=new Date();
  const [session]=await tx.select({
   accountId:accessSessions.accountId,email:accessAccounts.emailNormalized,
  }).from(accessSessions)
   .innerJoin(accessAccounts,eq(accessAccounts.id,accessSessions.accountId))
   .where(and(eq(accessSessions.id,sessionId),eq(accessSessions.accountId,accountId),
    eq(accessAccounts.disabled,false),isNull(accessSessions.revokedAt),
    gt(accessSessions.expiresAt,now),gt(accessSessions.updatedAt,sessionIdleCutoff(now))))
   .limit(1).for("update");
  if(!session)throw new AuthorizationError("authenticated session");
  const {grants}=await readSessionGrants(session.accountId,session.email,tx);
  const grant=grants.find(candidate=>candidate.id===grantId);
  if(!grant||!Object.hasOwn(roleCapabilities,grant.role))throw new AuthorizationError("active membership");
  const [changed]=await tx.update(accessSessions).set({activeGrantId:grant.id,updatedAt:new Date()})
   .where(and(eq(accessSessions.id,sessionId),eq(accessSessions.accountId,accountId),
    isNull(accessSessions.revokedAt),gt(accessSessions.expiresAt,now),
    gt(accessSessions.updatedAt,sessionIdleCutoff(now))))
   .returning({id:accessSessions.id});
  if(!changed)throw new Error("Session expired");
  await recordSessionSecurityEvent(tx,{
   action:"identity.membership.selected",actorPersonId:grant.personId,
   accountId:grant.accountId,sessionAccountId:accountId,
   sessionId,grantId,role:grant.role,
  });
 });
}


/**
 * An explicit, same-origin user interaction refreshes ONLY the server's idle
 * deadline, not the 12-hour absolute expiration. Never invoke on GET,
 * background polling, focus or visibility events.
 *
 * Use the existing access_sessions.updated_at for this first incremental bite;
 * login initializes it and membership selection is also a meaningful action.
 * A dedicated session-activity timestamp can follow with device inventory.
 */
export async function recordMeaningfulSessionActivity(sessionId:string,accountId:string):Promise<void> {
 const now=new Date();
 const [updated]=await db.update(accessSessions).set({updatedAt:now})
  .where(and(eq(accessSessions.id,sessionId),eq(accessSessions.accountId,accountId),
    isNull(accessSessions.revokedAt),gt(accessSessions.expiresAt,now),
    gt(accessSessions.updatedAt,sessionIdleCutoff(now))))
  .returning({id:accessSessions.id});
 if(!updated)throw new AuthorizationError("Session expired or revoked");
}
