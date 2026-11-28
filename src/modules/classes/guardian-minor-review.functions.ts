import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {and,eq,gt,isNull,lte,or} from "drizzle-orm";
import {z} from "zod";
import {db} from "@/db/client";
import {accessAccounts,accountPersonGrants,accessSessions,guardianRelationships,people} from "@/db/schema";
import {guardianAuthorities,learnerProfiles} from "@/db/canonical-v301";
import {AuthorizationError,assertCapability} from "@/domain/command-context";
import {getCommandContext} from "@/modules/identity/command-context.server";
import {guardianRelationshipPredicate} from "@/domain/guardian-relationship";
import {reviewedMinorExpiry} from "@/domain/guardian-minor-review";
import {requireMinorReviewEvidence,minorReviewRecord} from "./guardian-minor-review-evidence.server";
import {emitEvent,writeAudit} from "@/platform/mutation";
import {EventTypes} from "@/domain/event-types";
import {sessionIdleCutoff} from "@/domain/access-tokens";

const uuid=z.string().uuid();
type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
async function reviewer(){
 setResponseHeader("Cache-Control","private, no-store");
 const actor=await getCommandContext(getRequest());
 assertCapability(actor,"platform.admin");
 if(actor.role!=="app_admin"||!actor.actorPersonId||actor.sessionAccountId||
    actor.impersonatedByAccountId||actor.grantSiteId!==null||
    actor.scope.organizationIds?.length||actor.scope.siteIds?.length)
  throw new AuthorizationError("independent platform guardian reviewer");
 return actor;
}
async function lockReviewer(tx:Tx,actor:Awaited<ReturnType<typeof reviewer>>,now:Date){
 const [session]=await tx.select({id:accessSessions.id}).from(accessSessions)
  .where(and(eq(accessSessions.id,actor.sessionId),eq(accessSessions.accountId,actor.accountId),
   eq(accessSessions.activeGrantId,actor.grantId),isNull(accessSessions.revokedAt),
   isNull(accessSessions.delegatedGrantId),gt(accessSessions.expiresAt,now),
   gt(accessSessions.updatedAt,sessionIdleCutoff(now)))).for("share").limit(1);
 const [grant]=await tx.select({id:accountPersonGrants.id}).from(accountPersonGrants)
  .innerJoin(accessAccounts,eq(accessAccounts.id,accountPersonGrants.accountId))
  .where(and(eq(accountPersonGrants.id,actor.grantId),eq(accountPersonGrants.accountId,actor.accountId),
   eq(accountPersonGrants.personId,actor.actorPersonId!),eq(accountPersonGrants.role,"app_admin"),
   eq(accountPersonGrants.active,true),isNull(accountPersonGrants.organizationId),
   isNull(accountPersonGrants.siteId),eq(accessAccounts.personId,actor.actorPersonId!),
   eq(accessAccounts.disabled,false),lte(accessAccounts.emailVerifiedAt,now))).for("share").limit(1);
 if(!session||!grant)throw new AuthorizationError("current independent platform reviewer");
}

/** Explicit independent review of an existing verified school relationship
 * and accepted private document. Creates only a Learner Profile and bounded
 * enrollment authority against existing Person UUIDs; never creates a Person,
 * account, login, registration, enrollment, or academic/pickup permission. */
export const approveGuardianMinorEnrollmentEligibility=createServerFn({method:"POST"})
 .validator((raw:unknown)=>z.object({relationshipId:uuid,applicationId:uuid,documentId:uuid,
  verifiedBirthDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  evidenceIndependentlyChecked:z.literal(true)}).strict().parse(raw))
 .handler(async({data})=>{
  const actor=await reviewer();
  return db.transaction(async tx=>{
   const now=new Date();await lockReviewer(tx,actor,now);
   const [relationship]=await tx.select().from(guardianRelationships)
    .where(and(eq(guardianRelationships.id,data.relationshipId),
     guardianRelationshipPredicate({guardianPersonId:guardianRelationships.guardianPersonId,access:"enrollment"})))
    .for("update").limit(1);
   if(!relationship||[relationship.guardianPersonId,relationship.studentPersonId].includes(actor.actorPersonId!))
    throw new AuthorizationError("independently verified guardian relationship");
   const expiry=reviewedMinorExpiry(data.verifiedBirthDate,now);
   if(!expiry)throw new AuthorizationError("independently reviewed minor age");
   const proof=await requireMinorReviewEvidence(tx,{applicationId:data.applicationId,documentId:data.documentId,
    guardianPersonId:relationship.guardianPersonId,learnerPersonId:relationship.studentPersonId},now);
   if(proof.verifiedByPersonId===actor.actorPersonId)
    throw new AuthorizationError("independent enrollment evidence review");
   const endsAt=proof.expiresAt&&proof.expiresAt<expiry?proof.expiresAt:expiry;
   const [child]=await tx.select({id:people.id}).from(people)
    .where(and(eq(people.id,relationship.studentPersonId),eq(people.active,true))).for("share").limit(1);
   if(!child)throw new AuthorizationError("existing active learner");
   const [guardian]=await tx.select({id:people.id}).from(people)
    .where(and(eq(people.id,relationship.guardianPersonId),eq(people.active,true))).for("share").limit(1);
   if(!guardian)throw new AuthorizationError("existing active guardian");
   await tx.insert(learnerProfiles).values({personId:child.id}).onConflictDoNothing();
   const [profile]=await tx.select({id:learnerProfiles.id}).from(learnerProfiles)
    .where(eq(learnerProfiles.personId,child.id)).for("update").limit(1);
   if(!profile)throw new Error("Learner profile unavailable");
   const current=await tx.select().from(guardianAuthorities).where(and(
    eq(guardianAuthorities.guardianPersonId,guardian.id),eq(guardianAuthorities.learnerId,profile.id),
    or(isNull(guardianAuthorities.endsAt),gt(guardianAuthorities.endsAt,now)))).for("update").limit(2);
   const prior=minorReviewRecord.safeParse(relationship.metadata.nativeMinorReview);
   if(current.length===1&&prior.success&&current[0]!.id===prior.data.authorityId&&
      current[0]!.authorityKind==="enrollment"&&current[0]!.verifiedAt&&current[0]!.verifiedAt<=now&&
      current[0]!.startsAt<=now&&current[0]!.endsAt?.getTime()===endsAt.getTime()&&
      prior.data.applicationId===data.applicationId&&prior.data.documentId===data.documentId)
    return {ready:true,learnerProfileId:profile.id,duplicate:true};
   if(current.length)throw new AuthorizationError("existing guardian authority requires reconciliation");
   const [authority]=await tx.insert(guardianAuthorities).values({
    guardianPersonId:guardian.id,learnerId:profile.id,authorityKind:"enrollment",
    startsAt:now,endsAt,verifiedAt:now,
   }).returning({id:guardianAuthorities.id});
   if(!authority)throw new Error("Guardian authority unavailable");
   await tx.update(guardianRelationships).set({updatedAt:now,metadata:{...relationship.metadata,
    nativeMinorReview:{applicationId:data.applicationId,documentId:data.documentId,
     authorityId:authority.id,reviewerPersonId:actor.actorPersonId,
     verifiedAt:now.toISOString(),expiresAt:endsAt.toISOString()}}})
    .where(eq(guardianRelationships.id,relationship.id));
   await writeAudit(tx,actor,{action:"guardian.minor_enrollment.reviewed",entityType:"guardian_relationship",
    entityId:relationship.id,after:{authorityId:authority.id,learnerProfileId:profile.id,documentId:data.documentId}});
   await emitEvent(tx,{eventType:EventTypes.GuardianMinorEnrollmentReviewed,aggregateType:"guardian_relationship",
    aggregateId:relationship.id,actorPersonId:actor.actorPersonId,payload:{authorityId:authority.id}});
   return {ready:true,learnerProfileId:profile.id,duplicate:false};
  });
 });

/** Global child-specific revocation is platform-governed; a school grant
 * revocation remains a distinct, local account-access operation. */
export const revokeGuardianRelationship=createServerFn({method:"POST"})
 .validator((raw:unknown)=>z.object({relationshipId:uuid,reason:z.string().trim().min(10).max(500)}).strict().parse(raw))
 .handler(async({data})=>{
  const actor=await reviewer();
  return db.transaction(async tx=>{
   const now=new Date();await lockReviewer(tx,actor,now);
   const [row]=await tx.select().from(guardianRelationships).where(eq(guardianRelationships.id,data.relationshipId)).for("update").limit(1);
   if(!row||[row.guardianPersonId,row.studentPersonId].includes(actor.actorPersonId!))
    throw new AuthorizationError("independent guardian relationship revocation");
   const [profile]=await tx.select({id:learnerProfiles.id}).from(learnerProfiles)
    .where(eq(learnerProfiles.personId,row.studentPersonId)).limit(1);
   if(profile)await tx.update(guardianAuthorities).set({endsAt:now}).where(and(
    eq(guardianAuthorities.guardianPersonId,row.guardianPersonId),eq(guardianAuthorities.learnerId,profile.id),
    lte(guardianAuthorities.startsAt,now),or(isNull(guardianAuthorities.endsAt),gt(guardianAuthorities.endsAt,now))));
   if(row.metadata.verification==="revoked"&&!row.canViewAcademics&&!row.canManageEnrollment&&
      !row.canSubmitAttendanceExcuse&&!row.canManagePickup)return {revoked:false};
   await tx.update(guardianRelationships).set({canViewAcademics:false,canManageEnrollment:false,
    canSubmitAttendanceExcuse:false,canManagePickup:false,updatedAt:now,
    metadata:{...row.metadata,verification:"revoked",revokedBy:actor.actorPersonId,revokedAt:now.toISOString()}})
    .where(eq(guardianRelationships.id,row.id));
   await writeAudit(tx,actor,{action:"guardian.relationship.revoked",entityType:"guardian_relationship",
    entityId:row.id,before:{verification:row.metadata.verification??null},
    after:{verification:"revoked",reason:data.reason}});
   await emitEvent(tx,{eventType:EventTypes.GuardianRelationshipRevoked,aggregateType:"guardian_relationship",
    aggregateId:row.id,actorPersonId:actor.actorPersonId});
   return {revoked:true};
  });
 });
