import { and, eq, inArray, isNull, gt, lte, or } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { db } from "@/db/client";
import {
  canonicalClasses, canonicalClassEnrollments, learnerCourseAttempts,
  learnerProfiles, assessmentAccess, assessmentFormAdministrations,
  assessmentVersions, assessmentDefinitions, assessmentFormVersions,
  auditEvents, domainEvents,
} from "@/db/canonical-v301";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import { getCanonicalCommandContext } from "@/modules/identity/canonical-command-context.server";
import { assertCurrentCanonicalStaffForMutation } from "@/modules/identity/canonical-transaction-authorization.server";
import { validateClassAuthority } from "@/modules/classes/unified-class.functions";
import { assertPublisherObjectiveAttemptLimit } from "@/domain/canonical-objective-draft";
import { getCanonicalClassPublisher } from "./native-class-publisher.server";

/** Provider-administered canonical assessment ACCESS for a native Class.
 * This never creates an alternative quiz, assessment result, score or
 * noncredit registration. No learner can grant themselves exam access.
 */
const input=z.object({classEnrollmentId:z.string().uuid()}).strict();
export const provisionNativeClassKnowledgeCheckAccess=createServerFn({method:"POST"})
  .validator((raw:unknown)=>input.parse(raw))
  .handler(async({data})=>{
    if(process.env.CAN_UNIFIED_CLASS_COMMANDS_ENABLED!=="true")
      throw new AuthorizationError("native Class release not activated");
    setResponseHeader("Cache-Control","private, no-store");
    const actor=await getCanonicalCommandContext(getRequest());
    if(!actor.actorPersonId||!["site_admin","registrar"].includes(actor.role??""))
      throw new AuthorizationError("authorized Class assessment registrar");
    assertCapability(actor,"class.manage");
    assertCapability(actor,"noncredit.assessment.provision");
    const organizationId=actor.scope.organizationIds?.[0];
    if(!organizationId||actor.scope.organizationIds?.length!==1)
      throw new AuthorizationError("one current operating organization");
    return db.transaction(async tx=>{
      const [enrollment]=await tx.select().from(canonicalClassEnrollments)
        .where(eq(canonicalClassEnrollments.id,data.classEnrollmentId))
        .for("update").limit(1);
      if(!enrollment?.courseAttemptId||enrollment.status!=="active")
        throw new AuthorizationError("active enrolled Class learner");
      const [cls]=await tx.select().from(canonicalClasses)
        .where(eq(canonicalClasses.id,enrollment.classId)).limit(1);
      if(!cls||cls.operatingOrganizationId!==organizationId||cls.state!=="active"||
          (cls.siteId&&!actor.scope.siteIds?.includes(cls.siteId))||
          (!cls.siteId&&cls.createdByPersonId!==actor.actorPersonId))
        throw new AuthorizationError("operated Class and exact authorized Site");
      await validateClassAuthority(tx,{
        actor,organizationId,siteIds:actor.scope.siteIds??[],
      },{
        deploymentId:cls.deploymentId,adoptionId:cls.adoptionId,
        offeringVersionId:cls.offeringVersionId,
        courseVersionId:cls.courseVersionId,
        operatingOrganizationId:cls.operatingOrganizationId,
        siteId:cls.siteId,title:cls.title,deliveryMode:cls.deliveryMode,
      });
      const [attempt]=await tx.select().from(learnerCourseAttempts)
        .where(and(eq(learnerCourseAttempts.id,enrollment.courseAttemptId),
          eq(learnerCourseAttempts.classEnrollmentId,enrollment.id),
          eq(learnerCourseAttempts.deploymentId,cls.deploymentId),
          eq(learnerCourseAttempts.courseVersionId,cls.courseVersionId),
          isNull(learnerCourseAttempts.sectionId),
          isNull(learnerCourseAttempts.noncreditRegistrationId),
          isNull(learnerCourseAttempts.enrollmentId),
          eq(learnerCourseAttempts.status,"active"))).limit(1);
      if(!attempt)throw new AuthorizationError("exact native Course Attempt provenance");
      const publisherOrganizationId=await getCanonicalClassPublisher(tx,{
        offeringVersionId:cls.offeringVersionId,
        courseVersionId:cls.courseVersionId,
      });
      const now=new Date();
      const candidates=await tx.select({
        administration:assessmentFormAdministrations,
        purpose:assessmentDefinitions.purpose,
        ownerOrganizationId:assessmentDefinitions.ownerOrganizationId,
        versionLifecycle:assessmentVersions.lifecycle,
        versionBlueprint:assessmentVersions.blueprint,
        versionCourseId:assessmentVersions.courseVersionId,
        formLifecycle:assessmentFormVersions.lifecycle,
        formShuffle:assessmentFormVersions.shuffleQuestions,
      }).from(assessmentFormAdministrations)
        .innerJoin(assessmentVersions,eq(
          assessmentVersions.id,assessmentFormAdministrations.assessmentVersionId))
        .innerJoin(assessmentDefinitions,eq(
          assessmentDefinitions.id,assessmentVersions.assessmentId))
        .innerJoin(assessmentFormVersions,eq(
          assessmentFormVersions.id,assessmentFormAdministrations.formVersionId))
        .where(and(
          eq(assessmentFormAdministrations.courseVersionId,cls.courseVersionId),
          eq(assessmentFormAdministrations.deploymentId,cls.deploymentId),
          eq(assessmentFormAdministrations.administeringOrganizationId,organizationId),
          eq(assessmentFormAdministrations.proctorPolicy,"none"),
          eq(assessmentFormAdministrations.status,"open"),
          or(isNull(assessmentFormAdministrations.opensAt),lte(assessmentFormAdministrations.opensAt,now)),
          or(isNull(assessmentFormAdministrations.closesAt),gt(assessmentFormAdministrations.closesAt,now)),
        )).limit(51);
      if(candidates.length>50)throw new AuthorizationError("assessment configuration requires review");
      const available=candidates.filter(c=>
        c.ownerOrganizationId===publisherOrganizationId&&
        c.versionLifecycle==="published"&&c.formLifecycle==="published"&&
        c.versionCourseId===cls.courseVersionId&&!c.formShuffle&&
        ["formative","practice","readiness","mastery"].includes(c.purpose));
      if(available.length!==1)
        throw new AuthorizationError("one approved published objective knowledge check for this Class");
      const administration=available[0]!.administration;
      assertPublisherObjectiveAttemptLimit(
        available[0]!.versionBlueprint,administration.attemptLimit);
      // Requesting staff must remain authorized at mutation time. No account
      // or role assertion from the untrusted browser is accepted.
      await assertCurrentCanonicalStaffForMutation(tx,getRequest(),actor);
      await tx.insert(learnerProfiles).values({
        personId:enrollment.learnerPersonId,
      }).onConflictDoNothing({target:learnerProfiles.personId});
      const [learner]=await tx.select({id:learnerProfiles.id})
        .from(learnerProfiles)
        .where(eq(learnerProfiles.personId,enrollment.learnerPersonId)).limit(1);
      if(!learner)throw new AuthorizationError("matching canonical Person learner profile");
      const [previous]=await tx.select().from(assessmentAccess)
        .where(and(eq(assessmentAccess.administrationId,administration.id),
          eq(assessmentAccess.courseAttemptId,attempt.id),
          eq(assessmentAccess.learnerId,learner.id))).limit(1);
      if(previous){
        if(previous.accessStatus!=="approved"||previous.validFrom>now||
          (previous.validThrough&&previous.validThrough<=now))
          throw new AuthorizationError("assessment grant revoked or expired; requires provider review");
        return {accessGrantId:previous.id,courseAttemptId:attempt.id,alreadyGranted:true};
      }
      const [created]=await tx.insert(assessmentAccess).values({
        administrationId:administration.id,learnerId:learner.id,
        courseAttemptId:attempt.id,grantedByPersonId:actor.actorPersonId,
      }).returning({id:assessmentAccess.id});
      if(!created)throw new Error("Canonical Class assessment grant could not be recorded");
      const payload={
        classId:cls.id,classEnrollmentId:enrollment.id,
        courseAttemptId:attempt.id,assessmentAdministrationId:administration.id,
      };
      await tx.insert(auditEvents).values({
        actorPersonId:actor.actorPersonId,owningOrganizationId:organizationId,
        eventCode:"class.assessment.access_granted",
        entityKind:"assessment_access_grant",entityId:created.id,payload,
      });
      await tx.insert(domainEvents).values({
        eventType:"ClassAssessmentAccessGranted",
        aggregateType:"assessment_access_grant",aggregateId:created.id,
        actorPersonId:actor.actorPersonId,payload,
      });
      return {accessGrantId:created.id,courseAttemptId:attempt.id,alreadyGranted:false};
    });
  });
