import { and, asc, count, eq, gt, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
  canonicalClasses, canonicalClassEnrollments, canonicalClassSessions,
  canonicalDeliverySessions, facilitatedClassroomPlans, learnerCourseAttempts,
} from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import { selectCourseClass } from "@/domain/course-class-registration";
import { assertNativeClassSeatAvailable } from "@/domain/native-class-lifecycle";
import { currentClassAuthority } from "@/modules/classes/native-class-authority.server";
import { readEligibleSelfEnrollmentReleases } from "./noncredit-self-enrollment-catalog.server";
import { emitCanonicalDomainEvent, writeCanonicalAudit } from "@/platform/canonical-mutation.server";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Release = Awaited<ReturnType<typeof readEligibleSelfEnrollmentReleases>>[number];
export type CourseClassChoice = {id:string;title:string;deliveryMode:string;seatsRemaining:number|null};

/** Advisory Class choices. Admission rechecks source authority and seats under
 * the same Class-row lock as native self-enrollment and facilitator assignment. */
export async function listEligibleCourseClasses(
  tx:Tx,release:Release,now:Date,
):Promise<CourseClassChoice[]>{
  const candidates=await tx.select({
    id:canonicalClasses.id,title:canonicalClasses.title,
    deliveryMode:canonicalClasses.deliveryMode,capacity:canonicalClasses.capacity,
  }).from(canonicalClasses).where(and(
    eq(canonicalClasses.deploymentId,release.deploymentId),
    eq(canonicalClasses.adoptionId,release.adoptionId),
    eq(canonicalClasses.offeringVersionId,release.offeringVersionId),
    eq(canonicalClasses.courseVersionId,release.courseVersionId),
    eq(canonicalClasses.operatingOrganizationId,release.registeringOrganizationId),
    eq(canonicalClasses.siteId,release.siteId),
    eq(canonicalClasses.state,"active"),
    release.deliveryMode==="independent"
      ?eq(canonicalClasses.deliveryMode,"self_paced")
      :inArray(canonicalClasses.deliveryMode,["scheduled","facilitated","hybrid"]),
  )).orderBy(asc(canonicalClasses.title),asc(canonicalClasses.id)).limit(51);
  if(candidates.length>50)throw new AuthorizationError("Class selection exceeds supported range");
  const result:CourseClassChoice[]=[];
  for(const cls of candidates){
    try{await currentClassAuthority(tx,cls.id,now);}
    catch(error){if(error instanceof AuthorizationError)continue;throw error;}
    if(cls.deliveryMode!=="self_paced"){
      const [scheduled]=await tx.select({id:canonicalClassSessions.id})
        .from(canonicalClassSessions)
        .innerJoin(facilitatedClassroomPlans,
          eq(facilitatedClassroomPlans.id,canonicalClassSessions.classroomPlanId))
        .innerJoin(canonicalDeliverySessions,
          eq(canonicalDeliverySessions.id,canonicalClassSessions.deliverySessionId))
        .where(and(eq(canonicalClassSessions.classId,cls.id),
          eq(facilitatedClassroomPlans.state,"scheduled"),
          gt(canonicalDeliverySessions.startsAt,now))).limit(1);
      if(!scheduled)continue;
    }
    const [occupancy]=await tx.select({total:count()}).from(canonicalClassEnrollments)
      .where(and(eq(canonicalClassEnrollments.classId,cls.id),
        inArray(canonicalClassEnrollments.status,["active","pending"])));
    result.push({id:cls.id,title:cls.title,deliveryMode:cls.deliveryMode,
      seatsRemaining:cls.capacity===null?null:Math.max(0,cls.capacity-(occupancy?.total??0))});
  }
  return result;
}

/** The noncredit Registration continues to own consent, capacity and
 * completion. One shared Course Attempt is linked to Class participation,
 * never cloned. Migration 0095 enforces the exact dual reference. */
export async function placeCourseRegistrationInClass(tx:Tx,args:{
  release:Release;personId:string;registrationId:string;attemptId:string;
  selectedClassId?:string;now:Date;
}):Promise<{classId:string;classEnrollmentId:string;created:boolean}>{
  const choices=await listEligibleCourseClasses(tx,args.release,args.now);
  let classId:string;
  try{classId=selectCourseClass(choices,args.selectedClassId);}
  catch(error){throw new AuthorizationError(error instanceof Error?error.message:"available Class");}
  const [cls]=await tx.select().from(canonicalClasses)
    .where(eq(canonicalClasses.id,classId)).for("update").limit(1);
  if(!cls)throw new AuthorizationError("available Class");
  const authority=await currentClassAuthority(tx,classId,new Date());
  if(cls.siteId!==args.release.siteId||
    cls.deploymentId!==args.release.deploymentId||
    cls.adoptionId!==args.release.adoptionId||
    cls.offeringVersionId!==args.release.offeringVersionId||
    cls.courseVersionId!==args.release.courseVersionId||
    cls.operatingOrganizationId!==args.release.registeringOrganizationId)
    throw new AuthorizationError("Class does not belong to the registered Course and Site");
  const [attempt]=await tx.select().from(learnerCourseAttempts).where(and(
    eq(learnerCourseAttempts.id,args.attemptId),
    eq(learnerCourseAttempts.noncreditRegistrationId,args.registrationId),
    eq(learnerCourseAttempts.courseVersionId,args.release.courseVersionId),
    eq(learnerCourseAttempts.status,"active"),
    isNull(learnerCourseAttempts.enrollmentId),
  )).for("update").limit(1);
  if(!attempt)throw new AuthorizationError("current original Course Attempt");
  if(attempt.classEnrollmentId){
    const [existing]=await tx.select().from(canonicalClassEnrollments).where(and(
      eq(canonicalClassEnrollments.id,attempt.classEnrollmentId),
      eq(canonicalClassEnrollments.classId,classId),
      eq(canonicalClassEnrollments.courseAttemptId,attempt.id),
      eq(canonicalClassEnrollments.learnerPersonId,args.personId),
      eq(canonicalClassEnrollments.status,"active"),
    )).limit(1);
    if(!existing)throw new AuthorizationError("Class change needs an authorized transfer");
    return {classId,classEnrollmentId:existing.id,created:false};
  }
  const [previous]=await tx.select({id:canonicalClassEnrollments.id})
    .from(canonicalClassEnrollments).where(and(
      eq(canonicalClassEnrollments.classId,classId),
      eq(canonicalClassEnrollments.learnerPersonId,args.personId),
      inArray(canonicalClassEnrollments.status,["active","pending"]),
    )).limit(1);
  if(previous)throw new AuthorizationError("existing Class participation requires reconciliation");
  const [occupancy]=await tx.select({total:count()}).from(canonicalClassEnrollments)
    .where(and(eq(canonicalClassEnrollments.classId,classId),
      inArray(canonicalClassEnrollments.status,["active","pending"])));
  assertNativeClassSeatAvailable({
    method:"self",activeOrPending:occupancy?.total??0,
    classCapacity:authority.classCapacity,offeringCapacity:null,
  });
  const [placed]=await tx.insert(canonicalClassEnrollments).values({
    classId,learnerPersonId:args.personId,enrolledByPersonId:args.personId,
    enrollmentMethod:"self",creditMode:"not_applicable",status:"active",
    consentVersion:args.release.consentVersion,
    consentSha256:args.release.consentSha256,consentedAt:args.now,
  }).returning({id:canonicalClassEnrollments.id});
  if(!placed)throw new Error("Class Placement creation failed");
  const [linked]=await tx.update(learnerCourseAttempts).set({classEnrollmentId:placed.id})
    .where(and(eq(learnerCourseAttempts.id,args.attemptId),
      eq(learnerCourseAttempts.noncreditRegistrationId,args.registrationId),
      isNull(learnerCourseAttempts.classEnrollmentId)))
    .returning({id:learnerCourseAttempts.id});
  if(!linked)throw new AuthorizationError("Course Attempt placement already changed");
  await tx.update(canonicalClassEnrollments).set({courseAttemptId:args.attemptId})
    .where(eq(canonicalClassEnrollments.id,placed.id));
  await writeCanonicalAudit(tx,{
    actorPersonId:args.personId,
    owningOrganizationId:args.release.registeringOrganizationId,
    eventCode:"course.registration.class_placed",
    entityKind:"class_enrollment",entityId:placed.id,
    payload:{registrationId:args.registrationId,courseAttemptId:args.attemptId,
      classId,releaseId:args.release.id},
  });
  await emitCanonicalDomainEvent(tx,{
    eventType:"ClassEnrollmentCreated",aggregateType:"class_enrollment",
    aggregateId:placed.id,actorPersonId:args.personId,
    payload:{classId,courseAttemptId:args.attemptId,
      courseRegistrationId:args.registrationId,releaseId:args.release.id},
  });
  return {classId,classEnrollmentId:placed.id,created:true};
}
