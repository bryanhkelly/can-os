import {and,eq,gt,isNull,lt} from "drizzle-orm";
import {db} from "@/db/client";
import {accessAccounts,accessChallenges,accessSessions,accountPersonGrants,auditEvents} from "@/db/schema";
import {issueOpaqueSecret,hashAccessSecret,normalizeAccessEmail,sessionCookieHeader,clearSessionCookieHeader} from "@/domain/access-tokens";
import {sendAccessLinkViaResend,type AccessEmailSender} from "./resend-access-mail.server";
import {roleCapabilities} from "@/domain/access-context";

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
/** Deliberately never provisions arbitrary accounts from an unverified email. */
export async function requestOneTimeAccess(rawEmail:string, sender:AccessEmailSender=sendAccessLinkViaResend):Promise<typeof genericResult> {
 const email=normalizeAccessEmail(rawEmail);
 const [account]=await db.select({id:accessAccounts.id}).from(accessAccounts)
  .where(and(eq(accessAccounts.emailNormalized,email),eq(accessAccounts.disabled,false))).limit(1);
 if(!account || email.endsWith(".invalid"))return genericResult;
 const memberships=await db.select({role:accountPersonGrants.role}).from(accountPersonGrants)
  .where(and(eq(accountPersonGrants.accountId,account.id),eq(accountPersonGrants.active,true)));
 if(!memberships.some(g=>Object.hasOwn(roleCapabilities,g.role)))return genericResult;
 const accessOrigin=publicOrigin();
 secretPepper(); // Fail before recording a challenge if sign-in is not configured.
 const now=new Date();
 const recent=await db.select({id:accessChallenges.id}).from(accessChallenges)
  .where(and(eq(accessChallenges.accountId,account.id),gt(accessChallenges.createdAt,new Date(now.getTime()-REQUEST_COOLDOWN_MS)))).limit(1);
 if(recent.length)return genericResult;
 const token=issueOpaqueSecret(),hash=hashAccessSecret(token,secretPepper());
 const challenge=await db.insert(accessChallenges).values({
  accountId:account.id,tokenHash:hash,expiresAt:new Date(now.getTime()+CHALLENGE_LIFETIME_MS),
 }).returning({id:accessChallenges.id});
 try {
  await sender({to:email,accessUrl:accessOrigin+"/access/verify?token="+encodeURIComponent(token)});
 }catch(error){
  // Preserve the issued challenge and cooldown on delivery failure; a rapid retry
  // must not turn a mail-provider outage into unbounded request generation.
  // The link remains unusable unless the provider actually delivered it.
  throw error;
 }
 return genericResult;
}
/** A token is atomically consumed by its hash, allowing only one successful redemption. */
export async function redeemOneTimeAccess(rawToken:string):Promise<{setCookie:string;accountId:string;role:string}> {
 if(!/^[A-Za-z0-9_-]{40,}$/.test(rawToken))throw new Error("Invalid or expired access link");
 const hash=hashAccessSecret(rawToken,secretPepper()),now=new Date();
 return db.transaction(async tx=>{
  const [claimed]=await tx.update(accessChallenges).set({consumedAt:now})
   .where(and(eq(accessChallenges.tokenHash,hash),isNull(accessChallenges.consumedAt),
     gt(accessChallenges.expiresAt,now),lt(accessChallenges.attempts,5)))
   .returning({accountId:accessChallenges.accountId});
  if(!claimed)throw new Error("Invalid or expired access link");
  const [account]=await tx.select({id:accessAccounts.id}).from(accessAccounts)
   .where(and(eq(accessAccounts.id,claimed.accountId),eq(accessAccounts.disabled,false))).limit(1);
  if(!account)throw new Error("Account unavailable");
  const grants=await tx.select({id:accountPersonGrants.id,role:accountPersonGrants.role}).from(accountPersonGrants)
   .where(and(eq(accountPersonGrants.accountId,account.id),eq(accountPersonGrants.active,true)));
  const activeGrant=grants.find(g=>Object.hasOwn(roleCapabilities,g.role));
  if(!activeGrant)throw new Error("No supported CAN OS membership");
  const secret=issueOpaqueSecret();
  await tx.insert(accessSessions).values({
   accountId:account.id,secretHash:hashAccessSecret(secret,secretPepper()),
   activeGrantId:activeGrant.id,expiresAt:new Date(now.getTime()+SESSION_LIFETIME_MS),
  });
  await tx.update(accessAccounts).set({emailVerifiedAt:now,updatedAt:now}).where(eq(accessAccounts.id,account.id));
  const [member]=await tx.select({personId:accountPersonGrants.personId}).from(accountPersonGrants).where(eq(accountPersonGrants.id,activeGrant.id)).limit(1);
  if(!member)throw new Error("Membership unavailable");
  await tx.insert(auditEvents).values({actorPersonId:member.personId,action:"identity.session.started",resourceType:"account",resourceId:account.id,context:{synthetic:true,method:"email_link"}});
  return {accountId:account.id,role:activeGrant.role,setCookie:sessionCookieHeader(secret,SESSION_LIFETIME_MS/1000)};
 });
}
export async function revokeAccessSession(sessionId:string,accountId:string):Promise<string> {
 await db.transaction(async tx=>{
  const [row]=await tx.update(accessSessions).set({revokedAt:new Date(),updatedAt:new Date()})
   .where(and(eq(accessSessions.id,sessionId),eq(accessSessions.accountId,accountId),isNull(accessSessions.revokedAt))).returning({activeGrantId:accessSessions.activeGrantId});
  if(row?.activeGrantId){
   const [member]=await tx.select({personId:accountPersonGrants.personId}).from(accountPersonGrants).where(eq(accountPersonGrants.id,row.activeGrantId)).limit(1);
   if(member)await tx.insert(auditEvents).values({actorPersonId:member.personId,action:"identity.session.revoked",resourceType:"account",resourceId:accountId,context:{synthetic:true,sessionId}});
  }
 });
 return clearSessionCookieHeader();
}
/** Selection is restricted to a grant assigned to the authenticated account. */
export async function selectAccessGrant(sessionId:string,accountId:string,grantId:string):Promise<void> {
 await db.transaction(async tx=>{
  const [grant]=await tx.select({id:accountPersonGrants.id,personId:accountPersonGrants.personId,role:accountPersonGrants.role})
   .from(accountPersonGrants)
   .where(and(eq(accountPersonGrants.id,grantId),eq(accountPersonGrants.accountId,accountId),eq(accountPersonGrants.active,true))).limit(1);
  if(!grant || !Object.hasOwn(roleCapabilities,grant.role))throw new Error("Membership unavailable");
  const [changed]=await tx.update(accessSessions).set({activeGrantId:grant.id,updatedAt:new Date()})
   .where(and(eq(accessSessions.id,sessionId),eq(accessSessions.accountId,accountId),
    isNull(accessSessions.revokedAt),gt(accessSessions.expiresAt,new Date())))
   .returning({id:accessSessions.id});
  if(!changed)throw new Error("Session expired");
  await tx.insert(auditEvents).values({actorPersonId:grant.personId,action:"identity.membership.selected",
   resourceType:"account",resourceId:accountId,context:{synthetic:true,sessionId,grantId}});
 });
}
