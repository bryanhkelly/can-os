import { createServerFn } from "@tanstack/react-start";
import { getRequest,setResponseHeader } from "@tanstack/react-start/server";
import { and,eq,isNotNull,isNull,lte } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  canonicalClasses,canonicalClassEnrollments,
  canonicalClassEnrollmentRepeatAuthorizations,
  canonicalAccountGrants,canonicalAccounts,canonicalPersons,
  participationAttributions,
} from "@/db/canonical-v301";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { writeCanonicalAudit, emitCanonicalDomainEvent } from "@/platform/canonical-mutation.server";
import { getCanonicalCommandContext } from "@/modules/identity/canonical-command-context.server";
import { assertCurrentCanonicalStaffForMutation } from "@/modules/identity/canonical-transaction-authorization.server";
import { currentClassAuthority } from "./native-class-authority.server";
import {readOpenNativeClassEnrollment,readLatestCompletedNativeClassEnrollment} from "./native-class-enrollment-history.server";
import { readNativeClassOccupancy } from "./native-class-capacity.server";
import { createInitialNativeClassAttempt } from "./native-class-attempt.server";
import { requireNativeRepeatAuthorization } from "./native-class-repeats.functions";
import { verifiedAdultOn } from "@/domain/native-class-enrollment";
import {
  assertNativeClassOperatorExitScope,
  assertNativeClassSeatAvailable,
} from "@/domain/native-class-lifecycle";

/** The first Class-without-Offering enrollment pathway is deliberately
 * restricted to verified adult learners already affiliated with the Class's
 * authorized operating Organization. A learner's grant is organization-scoped
 * (site_id NULL); Site hosting authority is verified on the Class itself.
 * Guardian/school placement
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
      if(!cls)throw new AuthorizationError("existing Class");
      // All native Class operator mutations require the same unambiguous
      // Organization and Site authority. Broad network grants cannot mutate
      // one Site's roster by selecting its ID in a request body.
      assertNativeClassOperatorExitScope(actor,cls);
      await assertCurrentCanonicalStaffForMutation(tx,getRequest(),actor);
      const current=await currentClassAuthority(tx,cls.id,new Date());
      if(!current.siteId)throw new AuthorizationError("assigned Class enrollment requires a Site");

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
          isNull(canonicalAccountGrants.siteId),
          eq(canonicalAccountGrants.roleCode,"learner"),
          eq(canonicalAccountGrants.active,true),
          isNull(canonicalAccountGrants.revokedAt),
          lte(canonicalAccountGrants.grantedAt,new Date()),
          isNull(canonicalAccounts.disabledAt),
          isNotNull(canonicalAccounts.emailVerifiedAt),
        )).limit(1);
      if(!grant)throw new AuthorizationError("verified current organization-scoped learner grant");

      const existing=await readOpenNativeClassEnrollment(tx,cls.id,person.id);
      if(existing){
        if(existing.creditMode!==data.creditMode||!existing.courseAttemptId)
          throw new AuthorizationError("conflicting Class enrollment; use approved modification workflow");
        return {classEnrollmentId:existing.id,courseAttemptId:existing.courseAttemptId,
          alreadyEnrolled:true};
      }
      // A last-five history window is not proof that no earlier completion
      // exists. A prior completion requires an independently approved repeat.
      const completed=await readLatestCompletedNativeClassEnrollment(tx,cls.id,person.id);
      const repeatAuthorization=completed
        ?await requireNativeRepeatAuthorization(tx,cls.id,person.id,completed.id,new Date())
        :null;
      const occupancy=await readNativeClassOccupancy(tx,cls.id);
      // Assignment and self-registration share the Class's single pool.
      // A publisher's Offering cap may restrict self-service, but does not
      // create additional or separate reserved assignment capacity.
      assertNativeClassSeatAvailable({method:"assignment",
        activeOrPending:occupancy,classCapacity:cls.capacity});

      // No Class Offering is required or silently generated by assignment.
      // Audit/no-credit selection never auto-issues a certificate or credit.
      const [enrollment]=await tx.insert(canonicalClassEnrollments).values({
        classId:cls.id,classOfferingVersionId:null,
        learnerPersonId:person.id,enrollmentMethod:"assignment",
        creditMode:data.creditMode,status:"active",
        enrolledByPersonId:actor.actorPersonId!,
        consentVersion:null,consentSha256:null,consentedAt:null,
      }).returning({id:canonicalClassEnrollments.id});
      if(!enrollment)throw new Error("Cannot save assigned Class Enrollment");
      await tx.insert(participationAttributions).values({
        classEnrollmentId:enrollment.id,
        deliverySiteId:current.siteId,reportingSiteId:current.siteId,
        creditedOrganizationId:current.operatingOrganizationId,
        attributionBasis:"provider_default",
        relationshipSnapshot:{kind:"provider_default",classId:cls.id,
          organizationId:current.operatingOrganizationId,siteId:current.siteId},
      });
      const attempt=await createInitialNativeClassAttempt(tx,enrollment.id,current);
      if(repeatAuthorization){
        await tx.update(canonicalClassEnrollmentRepeatAuthorizations)
          .set({consumedByEnrollmentId:enrollment.id})
          .where(and(
            eq(canonicalClassEnrollmentRepeatAuthorizations.id,repeatAuthorization.id),
            isNull(canonicalClassEnrollmentRepeatAuthorizations.consumedByEnrollmentId),
          ));
        await emitCanonicalDomainEvent(tx,{
          eventType:"ClassRepeatAuthorizationConsumed",
          aggregateType:"class_repeat_authorization",aggregateId:repeatAuthorization.id,
          actorPersonId:actor.actorPersonId!,
          payload:{classId:cls.id,priorEnrollmentId:completed!.id,
            classEnrollmentId:enrollment.id,courseAttemptId:attempt.id},
        });
      }
      await writeCanonicalAudit(tx,{
        actorPersonId:actor.actorPersonId!,
        owningOrganizationId:cls.operatingOrganizationId,
        eventCode:"class.enrollment.assigned",
        entityKind:"class_enrollment",entityId:enrollment.id,
        payload:{classId:cls.id,personId:person.id,
          creditMode:data.creditMode,courseAttemptId:attempt.id,
          classOfferingVersionId:null},
      });
      await emitCanonicalDomainEvent(tx,{
        actorPersonId:actor.actorPersonId!,
        eventType:"ClassEnrollmentAssigned",
        aggregateType:"class_enrollment",aggregateId:enrollment.id,
        payload:{classId:cls.id,courseAttemptId:attempt.id,method:"assignment"},
      });
      return {classEnrollmentId:enrollment.id,
        courseAttemptId:attempt.id,alreadyEnrolled:false};
    });
  });
