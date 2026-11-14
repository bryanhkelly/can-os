import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  assessmentAccess, assessmentFormAdministrations, auditEvents, domainEvents,
  learnerCourseAttempts, learnerProfiles, noncreditRegistrations,
  noncreditTrainingVersions,
} from "@/db/canonical-v301";
import { AuthorizationError, assertCapability, type CommandContext } from "@/domain/command-context";

/**
 * Register an already-authorized noncredit participant for an already-published
 * knowledge check. This is NOT school admission and creates no enrollment,
 * Section, transcript, official grade or academic credential.
 *
 * The existing canonical Person gets a global learner profile only when the
 * shared assessment engine needs one. A provider-issued access grant is
 * pinned to exactly one active Course attempt and assessment administration.
 */
export async function provisionNoncreditAssessmentAccess(
  context:CommandContext,courseAttemptId:string,
) {
  if(!context.actorPersonId||!["registrar","site_admin"].includes(context.role??""))
    throw new AuthorizationError("authorized noncredit registrar");
  assertCapability(context,"noncredit.assessment.provision");
  return db.transaction(async tx=>{
    const [attempt]=await tx.select().from(learnerCourseAttempts)
      .where(eq(learnerCourseAttempts.id,courseAttemptId)).limit(1);
    if(!attempt||attempt.enrollmentId!==null||attempt.sectionId!==null||
      !attempt.noncreditRegistrationId||attempt.status!=="active")
      throw new AuthorizationError("active noncredit course participation");
    const [registration]=await tx.select().from(noncreditRegistrations)
      .where(and(eq(noncreditRegistrations.id,attempt.noncreditRegistrationId),
        eq(noncreditRegistrations.deploymentId,attempt.deploymentId)))
      .for("update").limit(1);
    if(!registration||!["registered","active"].includes(registration.status)||
      registration.adoptionId!==attempt.adoptionId||
      registration.offeringVersionId!==attempt.offeringVersionId)
      throw new AuthorizationError("matching noncredit registration");
    const [training]=await tx.select().from(noncreditTrainingVersions)
      .where(eq(noncreditTrainingVersions.id,registration.trainingVersionId)).limit(1);
    if(!training||training.state!=="published"||!training.assessmentVersionId||
      !context.scope.organizationIds?.includes(training.providerOrganizationId))
      throw new AuthorizationError("published provider-owned training");
    const administrations=await tx.select().from(assessmentFormAdministrations)
      .where(and(
        eq(assessmentFormAdministrations.assessmentVersionId,training.assessmentVersionId),
        eq(assessmentFormAdministrations.deploymentId,attempt.deploymentId),
        eq(assessmentFormAdministrations.courseVersionId,attempt.courseVersionId),
        eq(assessmentFormAdministrations.administeringOrganizationId,training.providerOrganizationId),
        eq(assessmentFormAdministrations.status,"open"),
      ));
    if(administrations.length!==1||!administrations[0]||
       administrations[0].proctorPolicy!=="none")
      throw new AuthorizationError("unique authorized noncredit assessment administration");
    const administration=administrations[0];
    const now=new Date();
    if((administration.opensAt&&administration.opensAt>now)||
      (administration.closesAt&&administration.closesAt<=now))
      throw new AuthorizationError("current knowledge check availability");
    // The global Person -> Learner association is independent of any school.
    await tx.insert(learnerProfiles).values({
      personId:registration.participantPersonId,
    }).onConflictDoNothing({target:learnerProfiles.personId});
    const [learner]=await tx.select().from(learnerProfiles)
      .where(eq(learnerProfiles.personId,registration.participantPersonId)).limit(1);
    if(!learner||(registration.learnerId&&registration.learnerId!==learner.id))
      throw new AuthorizationError("participant learner identity");
    if(!registration.learnerId) {
      await tx.update(noncreditRegistrations).set({learnerId:learner.id})
        .where(eq(noncreditRegistrations.id,registration.id));
    }
    const [existing]=await tx.select().from(assessmentAccess)
      .where(and(eq(assessmentAccess.administrationId,administration.id),
        eq(assessmentAccess.learnerId,learner.id),
        eq(assessmentAccess.courseAttemptId,attempt.id))).limit(1);
    if(existing){
      if(existing.accessStatus!=="approved"||existing.validFrom>now||
        (existing.validThrough!==null&&existing.validThrough<=now))
        throw new AuthorizationError("existing revoked or expired assessment access");
      return {accessGrantId:existing.id,courseAttemptId:attempt.id,created:false};
    }
    const [granted]=await tx.insert(assessmentAccess).values({
      administrationId:administration.id,learnerId:learner.id,
      courseAttemptId:attempt.id,grantedByPersonId:context.actorPersonId,
    }).returning({id:assessmentAccess.id});
    if(!granted)throw new Error("Could not provision assessment access");
    const payload={courseAttemptId:attempt.id,registrationId:registration.id,
      administrationId:administration.id,accessGrantId:granted.id};
    await tx.insert(auditEvents).values({
      actorPersonId:context.actorPersonId,
      owningOrganizationId:training.providerOrganizationId,
      eventCode:"noncredit.assessment.access_granted",
      entityKind:"assessment_access_grant",entityId:granted.id,payload,
    });
    await tx.insert(domainEvents).values({
      eventType:"NoncreditAssessmentAccessGranted",
      aggregateType:"assessment_access_grant",aggregateId:granted.id,
      actorPersonId:context.actorPersonId,payload,
    });
    return {accessGrantId:granted.id,courseAttemptId:attempt.id,created:true};
  });
}
