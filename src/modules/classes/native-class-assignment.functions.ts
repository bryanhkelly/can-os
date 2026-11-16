import { createServerFn } from "@tanstack/react-start";
import { getRequest,setResponseHeader } from "@tanstack/react-start/server";
import { and,count,desc,eq,isNotNull,isNull,lte,inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  auditEvents,domainEvents,canonicalClasses,canonicalClassEnrollments,
  canonicalAccountGrants,canonicalAccounts,canonicalPersons,
  learnerCourseAttempts,
} from "@/db/canonical-v301";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { getCanonicalCommandContext } from "@/modules/identity/canonical-command-context.server";
import { currentClassAuthority } from "./native-class-enrollment.functions";
import { verifiedAdultOn } from "@/domain/native-class-enrollment";

/** The first Class-without-Offering enrollment pathway is deliberately
 * restricted to verified adult learners already affiliated with the Class's
 * authorized operating Organization and exact Site. Guardian/school placement
 * must have a separately verified relationship, never a free-form Person UUID.
 */
const assignSchema=z.object({
  classId:z.string().uuid(),
  learnerPersonId:z.string().uuid(),
  creditMode:z.enum(["audit","not_applicable"]),
}).strict();

export const assignAdultToNativeClass=createServerFn({method:"POST"})
  .validator((raw:unknown)=>assignSchema.parse(raw))
  .handler(async({data})=>{
    if(process.env.CAN_UNIFIED_CLASS_COMMANDS_ENABLED!=="true")
      throw new AuthorizationError("native Class enrollment not activated");
    setResponseHeader("Cache-Control","private, no-store");
    setResponseHeader("Referrer-Policy","no-referrer");
    const actor=await getCanonicalCommandContext(getRequest());
    if(!actor.actorPersonId || !["site_admin","registrar"].includes(actor.role??""))
      throw new AuthorizationError("authorized Class manager");
    assertCapability(actor,"class.manage");

    return db.transaction(async tx=>{
      // All seat-affecting enrollment paths lock the Class row, not an
      // optional or versioned registration publication.
      const [cls]=await tx.select().from(canonicalClasses)
        .where(eq(canonicalClasses.id,data.classId)).for("update").limit(1);
      if(!cls || !actor.scope.organizationIds?.includes(cls.operatingOrganizationId) ||
         (cls.siteId && !actor.scope.siteIds?.includes(cls.siteId)) ||
         (!cls.siteId && cls.createdByPersonId!==actor.actorPersonId))
        throw new AuthorizationError("exact authorized Class and operating Organization");
      const current=await currentClassAuthority(tx,cls.id,new Date());

      const [person]=await tx.select({id:canonicalPersons.id,
        birthDate:canonicalPersons.birthDate})
        .from(canonicalPersons).where(eq(canonicalPersons.id,data.learnerPersonId)).limit(1);
      if(!person || !verifiedAdultOn(person.birthDate,new Date()))
        throw new AuthorizationError("verified adult learning participant");
      const [grant]=await tx.select({id:canonicalAccountGrants.id})
        .from(canonicalAccountGrants)
        .innerJoin(canonicalAccounts,eq(canonicalAccounts.id,canonicalAccountGrants.accountId))
        .where(and(
          eq(canonicalAccountGrants.personId,person.id),
          eq(canonicalAccountGrants.organizationId,cls.operatingOrganizationId),
          cls.siteId
            ?eq(canonicalAccountGrants.siteId,cls.siteId)
            :isNull(canonicalAccountGrants.siteId),
          eq(canonicalAccountGrants.roleCode,"learner"),
          eq(canonicalAccountGrants.active,true),
          isNull(canonicalAccountGrants.revokedAt),
          lte(canonicalAccountGrants.grantedAt,new Date()),
          isNull(canonicalAccounts.disabledAt),
          isNotNull(canonicalAccounts.emailVerifiedAt),
        )).limit(1);
      if(!grant)throw new AuthorizationError("verified current learner membership at this Class Site");

      const previous=await tx.select({
        id:canonicalClassEnrollments.id,status:canonicalClassEnrollments.status,
        creditMode:canonicalClassEnrollments.creditMode,
        courseAttemptId:canonicalClassEnrollments.courseAttemptId,
      }).from(canonicalClassEnrollments).where(and(
        eq(canonicalClassEnrollments.classId,cls.id),
        eq(canonicalClassEnrollments.learnerPersonId,person.id),
      )).orderBy(desc(canonicalClassEnrollments.enrolledAt)).limit(5);
      const existing=previous.find(row=>["pending","active"].includes(row.status));
      if(existing){
        if(existing.creditMode!==data.creditMode||!existing.courseAttemptId)
          throw new AuthorizationError("conflicting Class enrollment; use approved modification workflow");
        return {classEnrollmentId:existing.id,courseAttemptId:existing.courseAttemptId,
          alreadyEnrolled:true};
      }
      if(previous.some(row=>row.status==="completed"))
        throw new AuthorizationError("Class repeat requires separate approval");
      const [occupancy]=await tx.select({total:count()}).from(canonicalClassEnrollments)
        .where(and(eq(canonicalClassEnrollments.classId,cls.id),
          inArray(canonicalClassEnrollments.status,["pending","active"])));
      if(cls.capacity!==null&&(occupancy?.total??0)>=cls.capacity)
        throw new AuthorizationError("Class is at capacity");

      // No Class Offering is required or silently generated by assignment.
      // Audit/no-credit selection never auto-issues a certificate or credit.
      const [enrollment]=await tx.insert(canonicalClassEnrollments).values({
        classId:cls.id,classOfferingVersionId:null,
        learnerPersonId:person.id,enrollmentMethod:"assignment",
        creditMode:data.creditMode,status:"active",
        enrolledByPersonId:actor.actorPersonId,
        consentVersion:null,consentSha256:null,consentedAt:null,
      }).returning({id:canonicalClassEnrollments.id});
      if(!enrollment)throw new Error("Cannot save assigned Class Enrollment");
      const [attempt]=await tx.insert(learnerCourseAttempts).values({
        classEnrollmentId:enrollment.id,enrollmentId:null,
        noncreditRegistrationId:null,sectionId:null,
        deploymentId:current.deploymentId,adoptionId:current.adoptionId,
        offeringVersionId:current.offeringVersionId,
        courseVersionId:current.courseVersionId,
        attemptNo:1,status:"active",
      }).returning({id:learnerCourseAttempts.id});
      if(!attempt)throw new Error("Cannot save Class Course Attempt");
      await tx.update(canonicalClassEnrollments)
        .set({courseAttemptId:attempt.id})
        .where(eq(canonicalClassEnrollments.id,enrollment.id));
      await tx.insert(auditEvents).values({
        actorPersonId:actor.actorPersonId,
        owningOrganizationId:cls.operatingOrganizationId,
        eventCode:"class.enrollment.assigned",
        entityKind:"class_enrollment",entityId:enrollment.id,
        payload:{classId:cls.id,personId:person.id,
          creditMode:data.creditMode,courseAttemptId:attempt.id,
          classOfferingVersionId:null},
      });
      await tx.insert(domainEvents).values({
        actorPersonId:actor.actorPersonId,
        eventType:"ClassEnrollmentAssigned",
        aggregateType:"class_enrollment",aggregateId:enrollment.id,
        payload:{classId:cls.id,courseAttemptId:attempt.id,method:"assignment"},
      });
      return {classEnrollmentId:enrollment.id,
        courseAttemptId:attempt.id,alreadyEnrolled:false};
    });
  });
