import {and,eq,gt,isNull,lt,sql} from "drizzle-orm";
import {db} from "@/db/client";
import {accessAccounts,accessChallenges,accessSessions,accountPersonGrants} from "@/db/schema";
import {issueOpaqueSecret,hashAccessSecret,normalizeAccessEmail,sessionCookieHeader,clearSessionCookieHeader} from "@/domain/access-tokens";
import {sendAccessLinkViaResend,type AccessEmailSender} from "./resend-access-mail.server";

const CHALLENGE_LIFETIME_MS=10*60*1000;
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
 if(!account)return genericResult;
 const now=new Date();
 const recent=await db.select({id:accessChallenges.id}).from(accessChallenges)
  .where(and(eq(accessChallenges.accountId,account.id),gt(accessChallenges.createdAt,new Date(now.getTime()-60_000)))).limit(1);
 if(recent.length)return genericResult;
 const token=issueOpaqueSecret(),hash=hashAccessSecret(token,secretPepper());
 const challenge=await db.insert(accessChallenges).values({
  accountId:account.id,tokenHash:hash,expiresAt:new Date(now.getTime()+CHALLENGE_LIFETIME_MS),
 }).returning({id:accessChallenges.id});
 try {
  await sender({to:email,accessUrl:publicOrigin()+"/access/verify?token="+encodeURIComponent(token)});
 }catch(error){
  await db.delete(accessChallenges).where(eq(accessChallenges.id,challenge[0].id));
  throw error;
 }
 return genericResult;
}
/** A token is atomically consumed by its hash, allowing only one successful redemption. */
export async function redeemOneTimeAccess(rawToken:string):Promise<{setCookie:string;accountId:string}> {
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
  const grants=await tx.select({id:accountPersonGrants.id}).from(accountPersonGrants)
   .where(and(eq(accountPersonGrants.accountId,account.id),eq(accountPersonGrants.active,true))).limit(1);
  if(!grants.length)throw new Error("No active CAN OS membership");
  const secret=issueOpaqueSecret();
  await tx.insert(accessSessions).values({
   accountId:account.id,secretHash:hashAccessSecret(secret,secretPepper()),
   activeGrantId:grants[0].id,expiresAt:new Date(now.getTime()+SESSION_LIFETIME_MS),
  });
  await tx.update(accessAccounts).set({emailVerifiedAt:now,updatedAt:now}).where(eq(accessAccounts.id,account.id));
  return {accountId:account.id,setCookie:sessionCookieHeader(secret,SESSION_LIFETIME_MS/1000)};
 });
}
export async function revokeAccessSession(sessionId:string,accountId:string):Promise<string> {
 await db.update(accessSessions).set({revokedAt:new Date(),updatedAt:new Date()})
  .where(and(eq(accessSessions.id,sessionId),eq(accessSessions.accountId,accountId)));
 return clearSessionCookieHeader();
}
/** Selection is restricted to a grant assigned to the authenticated account. */
export async function selectAccessGrant(sessionId:string,accountId:string,grantId:string):Promise<void> {
 const [grant]=await db.select({id:accountPersonGrants.id}).from(accountPersonGrants)
  .where(and(eq(accountPersonGrants.id,grantId),eq(accountPersonGrants.accountId,accountId),eq(accountPersonGrants.active,true))).limit(1);
 if(!grant)throw new Error("Membership unavailable");
 const changed=await db.update(accessSessions).set({activeGrantId:grant.id,updatedAt:new Date()})
  .where(and(eq(accessSessions.id,sessionId),eq(accessSessions.accountId,accountId),
   isNull(accessSessions.revokedAt),gt(accessSessions.expiresAt,new Date()))).returning({id:accessSessions.id});
 if(!changed.length)throw new Error("Session expired");
}
