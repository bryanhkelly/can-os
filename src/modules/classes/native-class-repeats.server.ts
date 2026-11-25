import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {and,desc,eq,gt,isNotNull,isNull} from "drizzle-orm";
import type {z} from "zod";
import type {authorizeNativeClassRepeatInput,listNativeClassRepeatCandidatesInput} from "./native-class-repeats.inputs";
import {db} from "@/db/client";
import {
  canonicalClasses,canonicalClassEnrollments,
  canonicalClassOutcomes,canonicalClassEnrollmentRepeatAuthorizations,
} from "@/db/canonical-v301";
import { writeCanonicalAudit, emitCanonicalDomainEvent } from "@/platform/canonical-mutation.server";
import {AuthorizationError,assertCapability} from "@/domain/command-context";
import {getCanonicalCommandContext} from "@/modules/identity/canonical-command-context.server";
import {assertCurrentCanonicalStaffForMutation} from
  "@/modules/identity/canonical-transaction-authorization.server";
import {assertNativeClassOperatorExitScope} from "@/domain/native-class-lifecycle";
import {currentClassAuthority} from "./native-class-authority.server";
import {readOpenNativeClassEnrollment} from "./native-class-enrollment-history.server";

function noCache(){
 setResponseHeader("Cache-Control","private, no-store");
 setResponseHeader("Referrer-Policy","no-referrer");
}

/**
 * Explicit one-time repeat of an adjudicated completed Class.
 * The earlier Enrollment/Attempt/outcome are immutable evidence.
 * Approval is not itself admission or a seat reservation.
 */
export const authorizeNativeClassRepeat=async(data:z.output<typeof authorizeNativeClassRepeatInput>)=>{
  noCache();
  const request=getRequest();
  const actor=await getCanonicalCommandContext(request);
  if(!actor.actorPersonId||!["site_admin","registrar"].includes(actor.role??""))
   throw new AuthorizationError("current Class repeat reviewer");
  assertCapability(actor,"class.manage");
  const approvingPersonId=actor.actorPersonId;
   return db.transaction(async tx=>{
   const [source]=await tx.select({
    classId:canonicalClassEnrollments.classId,
   }).from(canonicalClassEnrollments)
    .where(eq(canonicalClassEnrollments.id,data.priorEnrollmentId)).limit(1);
   if(!source)throw new AuthorizationError("existing completed Class participation");
   const [cls]=await tx.select().from(canonicalClasses)
    .where(eq(canonicalClasses.id,source.classId)).for("update").limit(1);
   if(!cls)throw new AuthorizationError("existing Class");
   assertNativeClassOperatorExitScope(actor,cls);
   await assertCurrentCanonicalStaffForMutation(tx,request,actor);
   const now=new Date();
   const authority=await currentClassAuthority(tx,cls.id,now);
   if(authority.classState!=="active"||authority.siteId!==cls.siteId)
    throw new AuthorizationError("currently operating Class and Site");
   const [prior]=await tx.select().from(canonicalClassEnrollments)
    .where(eq(canonicalClassEnrollments.id,data.priorEnrollmentId))
    .for("update").limit(1);
   if(!prior||prior.classId!==cls.id||prior.status!=="completed"||
      prior.learnerPersonId===actor.actorPersonId||!prior.courseAttemptId)
    throw new AuthorizationError("independently completed Class learner");
   const [completion]=await tx.select().from(canonicalClassOutcomes)
    .where(and(eq(canonicalClassOutcomes.id,data.completionOutcomeId),
      eq(canonicalClassOutcomes.classEnrollmentId,prior.id),
      eq(canonicalClassOutcomes.outcomeKind,"completion"),
      eq(canonicalClassOutcomes.resultCode,"completed"),
      eq(canonicalClassOutcomes.completionEvidenceVersionId,data.evidenceVersionId)))
    .limit(1);
   if(!completion||!completion.completionDecidedByPersonId||
      !completion.completionPolicyVersionId||
      completion.completionDecidedByPersonId===actor.actorPersonId)
    throw new AuthorizationError("independently adjudicated completion and evidence");
   const [existing]=await tx.select().from(canonicalClassEnrollmentRepeatAuthorizations)
    .where(and(
      eq(canonicalClassEnrollmentRepeatAuthorizations.classId,cls.id),
      eq(canonicalClassEnrollmentRepeatAuthorizations.learnerPersonId,prior.learnerPersonId),
      eq(canonicalClassEnrollmentRepeatAuthorizations.priorEnrollmentId,prior.id),
      eq(canonicalClassEnrollmentRepeatAuthorizations.completionOutcomeId,completion.id),
    )).limit(1);
   if(existing){
    if(existing.evidenceVersionId!==data.evidenceVersionId)
      throw new AuthorizationError("conflicting Class repeat evidence");
    if(existing.consumedByEnrollmentId||existing.expiresAt<=now)
      throw new AuthorizationError("previous repeat authorization consumed or expired");
    return {repeatAuthorizationId:existing.id,duplicate:true,expiresAt:existing.expiresAt};
   }
   const active=await readOpenNativeClassEnrollment(tx,cls.id,prior.learnerPersonId);
   if(active)throw new AuthorizationError("learner already has active Class participation");
   const expiresAt=new Date(now.getTime()+30*24*60*60*1000);
   const [saved]=await tx.insert(canonicalClassEnrollmentRepeatAuthorizations).values({
    classId:cls.id,learnerPersonId:prior.learnerPersonId,priorEnrollmentId:prior.id,
    completionOutcomeId:completion.id,evidenceVersionId:data.evidenceVersionId,
    approvedByPersonId:approvingPersonId,approvedAt:now,expiresAt,
   }).returning({id:canonicalClassEnrollmentRepeatAuthorizations.id});
   if(!saved)throw new Error("repeat authorization was not saved");
   await writeCanonicalAudit(tx,{
    actorPersonId:actor.actorPersonId,owningOrganizationId:cls.operatingOrganizationId,
    eventCode:"class.repeat.authorized",entityKind:"class_repeat_authorization",
    entityId:saved.id,
    payload:{classId:cls.id,priorEnrollmentId:prior.id,completionOutcomeId:completion.id,
     learnerPersonId:prior.learnerPersonId,evidenceVersionId:data.evidenceVersionId,
     reason:data.reason,seatReserved:false},
   });
   await emitCanonicalDomainEvent(tx,{
    eventType:"ClassRepeatAuthorized",aggregateType:"class_repeat_authorization",
    aggregateId:saved.id,actorPersonId:actor.actorPersonId,
    payload:{classId:cls.id,priorEnrollmentId:prior.id,learnerPersonId:prior.learnerPersonId},
   });
   return {repeatAuthorizationId:saved.id,duplicate:false,expiresAt};
  });
 };

/** Called under a canonical Class FOR UPDATE lock by an admission command.
 * Never permit a completed record to be reused without current one-time
 * authorization for the exact previously completed Enrollment and Person.
 */
export async function requireNativeRepeatAuthorization(
 tx:Parameters<Parameters<typeof db.transaction>[0]>[0],
 classId:string,
 learnerPersonId:string,
 priorCompletedEnrollmentId:string,
 now:Date,
){
 const [authorization]=await tx.select().from(canonicalClassEnrollmentRepeatAuthorizations)
  .where(and(
   eq(canonicalClassEnrollmentRepeatAuthorizations.classId,classId),
   eq(canonicalClassEnrollmentRepeatAuthorizations.learnerPersonId,learnerPersonId),
   eq(canonicalClassEnrollmentRepeatAuthorizations.priorEnrollmentId,priorCompletedEnrollmentId),
   isNull(canonicalClassEnrollmentRepeatAuthorizations.consumedByEnrollmentId),
   gt(canonicalClassEnrollmentRepeatAuthorizations.expiresAt,now),
  )).for("update").limit(1);
 if(!authorization)
  throw new AuthorizationError("independently authorized unconsumed completed Class repeat");
 return authorization;
}

/** Current exact-Site manager's completed Class candidates. These are
 * not student-wide history or permission to issue a repeat by themselves.
 */
export const listNativeClassRepeatCandidates=async(data:z.output<typeof listNativeClassRepeatCandidatesInput>)=>{
  noCache();
  const request=getRequest();
  const actor=await getCanonicalCommandContext(request);
  if(!actor.actorPersonId||!["site_admin","registrar"].includes(actor.role??""))
   throw new AuthorizationError("current repeat reviewer");
  assertCapability(actor,"class.manage");
  return db.transaction(async tx=>{
   const [cls]=await tx.select().from(canonicalClasses)
    .where(eq(canonicalClasses.id,data.classId)).limit(1);
   if(!cls)throw new AuthorizationError("existing exact-Site Class");
   assertNativeClassOperatorExitScope(actor,cls);
   await assertCurrentCanonicalStaffForMutation(tx,request,actor);
   const rows=await tx.select({
    priorEnrollmentId:canonicalClassEnrollments.id,
    learnerPersonId:canonicalClassEnrollments.learnerPersonId,
    completionOutcomeId:canonicalClassOutcomes.id,
    evidenceVersionId:canonicalClassOutcomes.completionEvidenceVersionId,
    completedAt:canonicalClassOutcomes.recordedAt,
    decidedByPersonId:canonicalClassOutcomes.completionDecidedByPersonId,
   }).from(canonicalClassEnrollments)
    .innerJoin(canonicalClassOutcomes,
      eq(canonicalClassOutcomes.classEnrollmentId,canonicalClassEnrollments.id))
    .where(and(
      eq(canonicalClassEnrollments.classId,cls.id),
      eq(canonicalClassEnrollments.status,"completed"),
      eq(canonicalClassOutcomes.outcomeKind,"completion"),
      eq(canonicalClassOutcomes.resultCode,"completed"),
      isNotNull(canonicalClassOutcomes.completionEvidenceVersionId),
      isNotNull(canonicalClassOutcomes.completionPolicyVersionId),
      isNotNull(canonicalClassOutcomes.completionDecidedByPersonId),
    )).orderBy(desc(canonicalClassOutcomes.recordedAt)).limit(100);
   return rows.filter(row=>row.decidedByPersonId!==actor.actorPersonId);
  });
 };
