import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
 accessAccounts, accountPersonGrants, accessSessions, people, publicFamilyStartRequests,
} from "@/db/schema";
import { hashAccessSecret, issueOpaqueSecret, sessionCookieHeader } from "@/domain/access-tokens";
import { AuthorizationError } from "@/domain/command-context";
import { uniqueAccountPersonId } from "@/domain/verified-family-person";
import { resolveRedeemedFamilyStartDestination } from "./private-family-start.server";
import { recordSessionSecurityEvent } from "@/modules/identity/session-security-audit.server";
import { emitEvent, writeAudit } from "@/platform/mutation";

import { EventTypes } from "@/domain/event-types";
const SESSION_LIFETIME_MS=12*60*60*1000;
function pepper():string {
 const value=process.env.CAN_ACCESS_TOKEN_PEPPER;
 if(!value || value.length<32)throw new Error("Family authentication configuration unavailable");
 return value;
}

/**
 * A single-use email link may only create a prospective guardian membership
 * at its originally published Site. It does not verify legal guardianship or
 * create any Student, relationship, Household or Application. The parent then
 * submits the canonical Application from the signed-in guardian workspace.
 */
export async function redeemPublicFamilyStart(rawToken:string):Promise<{
 setCookie:string;programId:string;requestId:string;
}> {
 if(!/^[A-Za-z0-9_-]{40,}$/.test(rawToken))throw new AuthorizationError("valid family verification link");
 const digest=hashAccessSecret(rawToken,pepper());
 const now=new Date();
 return db.transaction(async tx=>{
  const [intent]=await tx.update(publicFamilyStartRequests)
    .set({consumedAt:now})
    .where(and(eq(publicFamilyStartRequests.tokenHash,digest),
      isNull(publicFamilyStartRequests.consumedAt),
      gt(publicFamilyStartRequests.expiresAt,now)))
    .returning({
      id:publicFamilyStartRequests.id,email:publicFamilyStartRequests.emailNormalized,
      firstName:publicFamilyStartRequests.adultFirstName,
      lastName:publicFamilyStartRequests.adultLastName,
      programId:publicFamilyStartRequests.programId,
      siteId:publicFamilyStartRequests.siteId,
    });
  if(!intent)throw new AuthorizationError("valid unexpired single-use family link");
  // Recheck the original server-recorded entry channel and current authority
  // before creating any account, Person, grant or session.
  const school=await resolveRedeemedFamilyStartDestination(tx,intent);
  if(school.siteId!==intent.siteId)
    throw new AuthorizationError("school application opening changed");

  // An email challenge proves email ownership, not custody or authority
  // over an existing Person. Lock the email's account before inspecting grants.
  const [createdAccount]=await tx.insert(accessAccounts).values({
    emailNormalized:intent.email,emailVerifiedAt:now,
  }).onConflictDoNothing().returning({id:accessAccounts.id});
  const [account]=createdAccount?[createdAccount]:await tx.select({
    id:accessAccounts.id,disabled:accessAccounts.disabled,
  }).from(accessAccounts).where(eq(accessAccounts.emailNormalized,intent.email))
    .for("update").limit(1);
  if(!account || ("disabled" in account && account.disabled))
    throw new AuthorizationError("available family access account");
  // The account row is now serialized against concurrent family links.
  const grants=await tx.select({
    id:accountPersonGrants.id,personId:accountPersonGrants.personId,
    role:accountPersonGrants.role,active:accountPersonGrants.active,
    personActive:people.active,
    organizationId:accountPersonGrants.organizationId,siteId:accountPersonGrants.siteId,
  }).from(accountPersonGrants)
    .innerJoin(people,eq(people.id,accountPersonGrants.personId))
    .where(eq(accountPersonGrants.accountId,account.id));
  // Do not let a fresh email verification silently resurrect a revoked
  // guardian membership or replace a disabled person's identity. Staff must
  // independently resolve such account/identity restrictions.
  if(grants.some(grant=>!grant.personActive ||
    (grant.role==="guardian" && grant.organizationId===school.organizationId &&
      (grant.siteId===null||grant.siteId===school.siteId) && !grant.active)))
    throw new AuthorizationError("school family membership requires manual identity review");
  // A staff/teacher account with the same verified email can also be a
  // parent. Reuse the SAME known Person, but never infer one if this account
  // has grants for more than one existing Person.
  let personId=uniqueAccountPersonId(grants);
  if(!personId){
    const [person]=await tx.insert(people).values({
      legalFirstName:intent.firstName,legalLastName:intent.lastName,email:intent.email,
      metadata:{origin:"public_family_verified_email",guardianVerification:"pending"},
    }).returning({id:people.id});
    if(!person)throw new Error("Unable to create prospective family identity");
    personId=person.id;
  }
  const matchingGrant=grants.find(g=>g.active && g.role==="guardian" && g.personId===personId &&
    g.organizationId===school.organizationId &&
    (g.siteId===null||g.siteId===school.siteId));
  const [createdGrant]=matchingGrant?[matchingGrant]:await tx.insert(accountPersonGrants).values({
    accountId:account.id,personId,role:"guardian",organizationId:school.organizationId,
    siteId:school.siteId,active:true,
  }).returning({id:accountPersonGrants.id});
  if(!createdGrant)throw new Error("Unable to establish school-scoped family membership");
  await tx.update(accessAccounts).set({emailVerifiedAt:now,updatedAt:now})
    .where(eq(accessAccounts.id,account.id));
  const sessionSecret=issueOpaqueSecret();
  const [session]=await tx.insert(accessSessions).values({
    accountId:account.id,secretHash:hashAccessSecret(sessionSecret,pepper()),
    activeGrantId:createdGrant.id,
    expiresAt:new Date(now.getTime()+SESSION_LIFETIME_MS),
  }).returning({id:accessSessions.id});
  if(!session)throw new Error("Unable to open verified family session");
  await recordSessionSecurityEvent(tx,{
    action:"identity.session.started",actorPersonId:personId,
    accountId:account.id,sessionId:session.id,grantId:createdGrant.id,
    role:"guardian",method:"email_link",
  });
  await emitEvent(tx,{
    eventType:EventTypes.PublicFamilyStartVerified,aggregateType:"public_family_start_request",
    aggregateId:intent.id,actorPersonId:personId,organizationId:school.organizationId,
    siteId:school.siteId!,programId:intent.programId,
    payload:{status:"verified_email",role:"guardian"},
  });
  await writeAudit(tx,{action:"family.public_start.verify",resourceType:"public_family_start_request",
    resourceId:intent.id,actorPersonId:personId,
    scope:{organizationId:school.organizationId,siteId:school.siteId,
      programId:intent.programId},
    after:{status:"verified_email",guardianGrantId:createdGrant.id},
    context:{accountId:account.id,sessionId:session.id}});
  return {setCookie:sessionCookieHeader(sessionSecret,SESSION_LIFETIME_MS/1000),
    programId:intent.programId,requestId:intent.id};
 });
}
