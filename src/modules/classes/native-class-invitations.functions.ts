import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {and,desc,eq,inArray,isNotNull,isNull,lte} from "drizzle-orm";
import {z} from "zod";
import {db} from "@/db/client";
import {
  canonicalClasses,canonicalClassOfferingVersions,
  canonicalClassEnrollments,canonicalPersons,canonicalAccountGrants,canonicalAccounts,
  canonicalClassEnrollmentInvitations,
} from "@/db/canonical-v301";
import { writeCanonicalAudit, emitCanonicalDomainEvent } from "@/platform/canonical-mutation.server";
import {AuthorizationError,assertCapability} from "@/domain/command-context";
import {assertNativeClassOperatorExitScope} from "@/domain/native-class-lifecycle";
import {verifiedAdultOn} from "@/domain/native-class-enrollment";
import {getCanonicalCommandContext} from "@/modules/identity/canonical-command-context.server";
import {assertCurrentCanonicalStaffForMutation} from
  "@/modules/identity/canonical-transaction-authorization.server";
import {assertCurrentNativeClassLearnerForMutation} from "./native-class-learner-session.server";
import {currentClassAuthority} from "./native-class-authority.server";

const uuid=z.string().uuid();
const issueInput=z.object({
  classOfferingVersionId:uuid,learnerPersonId:uuid,requestId:uuid,
  creditMode:z.enum(["audit","not_applicable"]),
}).strict();
const respondInput=z.object({invitationId:uuid}).strict();
function privateResponse(){
  setResponseHeader("Cache-Control","private, no-store");
  setResponseHeader("Referrer-Policy","no-referrer");
}
const life=48*60*60*1000;

/**
 * An invitation is a specific, 48-hour intent, not a Class Enrollment or a
 * seat hold. Only an exact-Site manager may invite a verified adult Person.
 * The learner must independently accept currently published consent and
 * pass destination eligibility/capacity before an Enrollment is created.
 */
export const issueNativeClassInvitation=createServerFn({method:"POST"})
 .validator((raw:unknown)=>issueInput.parse(raw))
 .handler(async({data})=>{
  privateResponse();
  const request=getRequest();
  const actor=await getCanonicalCommandContext(request);
  if(!actor.actorPersonId||!["site_admin","registrar"].includes(actor.role??""))
    throw new AuthorizationError("current Class manager");
  assertCapability(actor,"class.manage");
  const inviterPersonId=actor.actorPersonId;
  return db.transaction(async tx=>{
    const [locator]=await tx.select({classId:canonicalClassOfferingVersions.classId})
      .from(canonicalClassOfferingVersions)
      .where(eq(canonicalClassOfferingVersions.id,data.classOfferingVersionId)).limit(1);
    if(!locator)throw new AuthorizationError("Class Offering version");
    const [cls]=await tx.select().from(canonicalClasses)
      .where(eq(canonicalClasses.id,locator.classId)).for("update").limit(1);
    if(!cls||!cls.siteId)throw new AuthorizationError("exact-Site Class");
    assertNativeClassOperatorExitScope(actor,cls);
    await assertCurrentCanonicalStaffForMutation(tx,request,actor);
    const now=new Date();
    const current=await currentClassAuthority(tx,cls.id,now);
    if(current.classState!=="active"||current.siteId!==cls.siteId)
      throw new AuthorizationError("currently active Class and Site");
    const [version]=await tx.select().from(canonicalClassOfferingVersions)
      .where(and(eq(canonicalClassOfferingVersions.id,data.classOfferingVersionId),
        eq(canonicalClassOfferingVersions.classId,cls.id))).for("update").limit(1);
    if(!version||version.state!=="published"||
       !version.enrollmentMethods.includes("invitation")||
       !version.allowedCreditModes.includes(data.creditMode)||
       (version.opensAt&&version.opensAt>now)||
       (version.closesAt&&version.closesAt<=now))
      throw new AuthorizationError("published invitation enrollment terms");
    if(!version.consentText||!version.consentVersion)
      throw new AuthorizationError("published consent for invitation");
    const [person]=await tx.select({birthDate:canonicalPersons.birthDate})
      .from(canonicalPersons)
      .where(eq(canonicalPersons.id,data.learnerPersonId)).limit(1);
    if(!verifiedAdultOn(person?.birthDate,now))
      throw new AuthorizationError("verified adult invitation recipient");
    const [grant]=await tx.select({id:canonicalAccountGrants.id})
      .from(canonicalAccountGrants)
      .innerJoin(canonicalAccounts,eq(canonicalAccounts.id,canonicalAccountGrants.accountId))
      .where(and(
        eq(canonicalAccountGrants.personId,data.learnerPersonId),
        eq(canonicalAccountGrants.roleCode,"learner"),
        eq(canonicalAccountGrants.active,true),
        isNull(canonicalAccountGrants.siteId),
        isNull(canonicalAccountGrants.revokedAt),
        lte(canonicalAccountGrants.grantedAt,now),
        isNull(canonicalAccounts.disabledAt),
        isNotNull(canonicalAccounts.emailVerifiedAt),
      )).limit(1);
    if(!grant)throw new AuthorizationError("current verified native learner recipient");
    const [alreadyEnrolled]=await tx.select({id:canonicalClassEnrollments.id})
      .from(canonicalClassEnrollments)
      .where(and(eq(canonicalClassEnrollments.classId,cls.id),
        eq(canonicalClassEnrollments.learnerPersonId,data.learnerPersonId),
        inArray(canonicalClassEnrollments.status,["pending","active"]))).limit(1);
    if(alreadyEnrolled)throw new AuthorizationError("learner is already participating");
    const [retry]=await tx.select().from(canonicalClassEnrollmentInvitations)
      .where(and(eq(canonicalClassEnrollmentInvitations.classId,cls.id),
        eq(canonicalClassEnrollmentInvitations.invitedByPersonId,inviterPersonId),
        eq(canonicalClassEnrollmentInvitations.requestId,data.requestId))).limit(1);
    if(retry){
      if(retry.classOfferingVersionId!==version.id||
        retry.learnerPersonId!==data.learnerPersonId||
        retry.creditMode!==data.creditMode||
        retry.siteId!==cls.siteId||retry.operatingOrganizationId!==cls.operatingOrganizationId)
        throw new AuthorizationError("conflicting invitation request replay");
      return {invitationId:retry.id,expiresAt:retry.expiresAt.toISOString(),duplicate:true};
    }
    // Expiry is enforced on every acceptance and lazily materialized when
    // issuing a replacement. No background job or environment flag is needed.
    const expired=await tx.update(canonicalClassEnrollmentInvitations)
      .set({state:"expired",respondedAt:now})
      .where(and(
        eq(canonicalClassEnrollmentInvitations.classId,cls.id),
        eq(canonicalClassEnrollmentInvitations.learnerPersonId,data.learnerPersonId),
        eq(canonicalClassEnrollmentInvitations.state,"pending"),
        lte(canonicalClassEnrollmentInvitations.expiresAt,now),
      )).returning({id:canonicalClassEnrollmentInvitations.id});
    for(const item of expired){
      await writeCanonicalAudit(tx,{
        actorPersonId:inviterPersonId,
        owningOrganizationId:cls.operatingOrganizationId,
        eventCode:"class.invitation.expired",entityKind:"class_invitation",
        entityId:item.id,payload:{classId:cls.id,siteId:cls.siteId,
          recipientPersonId:data.learnerPersonId,reason:"expired_before_reissue"},
      });
      await emitCanonicalDomainEvent(tx,{
        actorPersonId:inviterPersonId,eventType:"ClassInvitationExpired",
        aggregateType:"class_invitation",aggregateId:item.id,
        payload:{classId:cls.id,siteId:cls.siteId,
          recipientPersonId:data.learnerPersonId},
      });
    }
    const [pending]=await tx.select({id:canonicalClassEnrollmentInvitations.id})
      .from(canonicalClassEnrollmentInvitations)
      .where(and(eq(canonicalClassEnrollmentInvitations.classId,cls.id),
        eq(canonicalClassEnrollmentInvitations.learnerPersonId,data.learnerPersonId),
        eq(canonicalClassEnrollmentInvitations.state,"pending"))).limit(1);
    if(pending)throw new AuthorizationError("pending Class invitation already exists");
    const expiresAt=new Date(now.getTime()+life);
    const [saved]=await tx.insert(canonicalClassEnrollmentInvitations).values({
      classId:cls.id,classOfferingVersionId:version.id,
      operatingOrganizationId:cls.operatingOrganizationId,siteId:cls.siteId,
      learnerPersonId:data.learnerPersonId,invitedByPersonId:inviterPersonId,
      requestId:data.requestId,creditMode:data.creditMode,
      invitedAt:now,expiresAt,
    }).returning({id:canonicalClassEnrollmentInvitations.id});
    if(!saved)throw new Error("Invitation intent not persisted");
    const payload={classId:cls.id,classOfferingVersionId:version.id,
      invitationId:saved.id,learnerPersonId:data.learnerPersonId,
      siteId:cls.siteId,expiresAt:expiresAt.toISOString(),seatReserved:false};
    await writeCanonicalAudit(tx,{
      actorPersonId:inviterPersonId,
      owningOrganizationId:cls.operatingOrganizationId,
      eventCode:"class.invitation.issued",entityKind:"class_invitation",
      entityId:saved.id,payload,
    });
    await emitCanonicalDomainEvent(tx,{
      actorPersonId:inviterPersonId,eventType:"ClassInvitationIssued",
      aggregateType:"class_invitation",aggregateId:saved.id,payload,
    });
    return {invitationId:saved.id,expiresAt:expiresAt.toISOString(),duplicate:false};
  });
 });

/** A native learner can see only invitations to their verified Person. */
export const getMyNativeClassInvitations=createServerFn({method:"GET"}).handler(async()=>{
  privateResponse();
  const actor=await getCanonicalCommandContext(getRequest());
  if(actor.role!=="learner"||!actor.actorPersonId)
    throw new AuthorizationError("verified Class learner");
  assertCapability(actor,"learning.participate");
  const items=await db.select({
    invitationId:canonicalClassEnrollmentInvitations.id,
    classId:canonicalClassEnrollmentInvitations.classId,
    classOfferingVersionId:canonicalClassEnrollmentInvitations.classOfferingVersionId,
    title:canonicalClasses.title,
    creditMode:canonicalClassEnrollmentInvitations.creditMode,
    consentText:canonicalClassOfferingVersions.consentText,
    consentVersion:canonicalClassOfferingVersions.consentVersion,
    state:canonicalClassEnrollmentInvitations.state,
    expiresAt:canonicalClassEnrollmentInvitations.expiresAt,
    acceptedEnrollmentId:canonicalClassEnrollmentInvitations.acceptedEnrollmentId,
  }).from(canonicalClassEnrollmentInvitations)
    .innerJoin(canonicalClasses,eq(canonicalClasses.id,canonicalClassEnrollmentInvitations.classId))
    .innerJoin(canonicalClassOfferingVersions,eq(canonicalClassOfferingVersions.id,canonicalClassEnrollmentInvitations.classOfferingVersionId))
    .where(eq(canonicalClassEnrollmentInvitations.learnerPersonId,actor.actorPersonId))
    .orderBy(desc(canonicalClassEnrollmentInvitations.invitedAt)).limit(100);
  const now=new Date();
  return items.map(item=>({...item,
    state:item.state==="pending"&&item.expiresAt<=now?"expired" as const:item.state}));
});

/** Decline / expire is not cancellation of a Class Enrollment and never
 * withdraws an authorized Course Attempt. */
export const declineNativeClassInvitation=createServerFn({method:"POST"})
 .validator((raw:unknown)=>respondInput.parse(raw))
 .handler(async({data})=>{
  privateResponse();
  const request=getRequest();
  const actor=await getCanonicalCommandContext(request);
  if(actor.role!=="learner"||!actor.actorPersonId)
    throw new AuthorizationError("verified Class learner");
  assertCapability(actor,"learning.participate");
  return db.transaction(async tx=>{
    const [source]=await tx.select({classId:canonicalClassEnrollmentInvitations.classId})
      .from(canonicalClassEnrollmentInvitations)
      .where(eq(canonicalClassEnrollmentInvitations.id,data.invitationId)).limit(1);
    if(!source)throw new AuthorizationError("existing invitation");
    const [cls]=await tx.select({id:canonicalClasses.id})
      .from(canonicalClasses).where(eq(canonicalClasses.id,source.classId))
      .for("update").limit(1);
    if(!cls)throw new AuthorizationError("existing invitation Class");
    const [invitation]=await tx.select().from(canonicalClassEnrollmentInvitations)
      .where(eq(canonicalClassEnrollmentInvitations.id,data.invitationId)).for("update").limit(1);
    if(!invitation||invitation.learnerPersonId!==actor.actorPersonId)
      throw new AuthorizationError("own native Class invitation");
    await assertCurrentNativeClassLearnerForMutation(tx,request,actor);
    if(invitation.state==="declined")return {invitationId:invitation.id,alreadyDeclined:true};
    if(invitation.state!=="pending")
      throw new AuthorizationError("open native Class invitation");
    const now=new Date(),state=invitation.expiresAt<=now?"expired" as const:"declined" as const;
    await tx.update(canonicalClassEnrollmentInvitations)
      .set({state,respondedAt:now})
      .where(eq(canonicalClassEnrollmentInvitations.id,invitation.id));
    await writeCanonicalAudit(tx,{
      actorPersonId:actor.actorPersonId,owningOrganizationId:invitation.operatingOrganizationId,
      eventCode:"class.invitation."+state,entityKind:"class_invitation",entityId:invitation.id,
      payload:{classId:cls.id,siteId:invitation.siteId,reason:"learner_response"},
    });
    return {invitationId:invitation.id,alreadyDeclined:false};
  });
 });
