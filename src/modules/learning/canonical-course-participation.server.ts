import { and, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db/client";
import {
  learnerCourseAttempts, enrollments, learnerProfiles, noncreditRegistrations,
  noncreditTrainingVersions, programDeployments, deploymentOfferingAdoptions,
  courseVersions, offeringVersions, canonicalClassEnrollments, canonicalClasses,
  catalogSites, educationOperationSites, siteOrganizationRoles, classroomDeploymentSites,
} from "@/db/canonical-v301";
import { AuthorizationError, assertCapability, type CommandContext } from "@/domain/command-context";
import { resolveCanonicalCourseParticipation, type CanonicalParticipationAccess } from "@/domain/canonical-course-participation";
import { authorizeNativeClassAttempt } from "@/domain/native-class-enrollment";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Server-only resource authorization. Every lookup is bound to the logged-in
 * Person and the canonical Course attempt; no Site/Section shortcut for adults.
 * Database RLS must ALSO permit only this principal before deployment.
 */
export async function authorizeCanonicalCourseAttempt(
  tx: Tx, context: CommandContext, courseAttemptId: string, allowCompletedHistory = false,
): Promise<CanonicalParticipationAccess> {
  if (!context.actorPersonId ||
      !["learner", "student"].includes(context.role ?? "")) {
    throw new AuthorizationError("authenticated learner");
  }
  assertCapability(context, context.role === "learner" ? "learning.participate" : "student:read");
  const [attempt] = await tx.select().from(learnerCourseAttempts)
    .where(eq(learnerCourseAttempts.id,courseAttemptId)).limit(1);
  if (!attempt) throw new AuthorizationError("course participation");
  const [deployment] = await tx.select().from(programDeployments)
    .where(eq(programDeployments.id,attempt.deploymentId)).limit(1);
  const [adoption] = await tx.select().from(deploymentOfferingAdoptions)
    .where(and(eq(deploymentOfferingAdoptions.id,attempt.adoptionId),
      eq(deploymentOfferingAdoptions.deploymentId,attempt.deploymentId),
      eq(deploymentOfferingAdoptions.offeringVersionId,attempt.offeringVersionId))).limit(1);
  const [course] = await tx.select().from(courseVersions)
    .where(eq(courseVersions.id,attempt.courseVersionId)).limit(1);
  const [offering] = await tx.select().from(offeringVersions)
    .where(eq(offeringVersions.id,attempt.offeringVersionId)).limit(1);
  // Native Class enrollments are the authoritative learner source, never
  // inferred from an academic Section, noncredit registration or marketing Site.
  if (attempt.classEnrollmentId) {
    const [classEnrollment] = await tx.select().from(canonicalClassEnrollments)
      .where(eq(canonicalClassEnrollments.id,attempt.classEnrollmentId)).limit(1);
    const [classInstance] = classEnrollment
      ? await tx.select().from(canonicalClasses)
          .where(eq(canonicalClasses.id,classEnrollment.classId)).limit(1)
      : [];
    if (!classInstance || !classEnrollment) {
      throw new AuthorizationError("current native Class Enrollment");
    }
    // Revoked Site authority must close native instructional access, even
    // when the learner has a previously issued Course Attempt.
    if (classInstance.siteId) {
      const now = new Date();
      const [site] = await tx.select({id:catalogSites.id}).from(catalogSites)
        .innerJoin(educationOperationSites,and(
          eq(educationOperationSites.siteId,catalogSites.id),
          eq(educationOperationSites.operationId,deployment?.operationId ?? ""),
          lte(educationOperationSites.validFrom,now),
          or(isNull(educationOperationSites.validThrough),
            gt(educationOperationSites.validThrough,now)),
        ))
        .innerJoin(siteOrganizationRoles,and(
          eq(siteOrganizationRoles.siteId,catalogSites.id),
          eq(siteOrganizationRoles.organizationId,classInstance.operatingOrganizationId),
          inArray(siteOrganizationRoles.roleCode,["operator","host"]),
          lte(siteOrganizationRoles.validFrom,now),
          or(isNull(siteOrganizationRoles.validThrough),gt(siteOrganizationRoles.validThrough,now)),
        ))
        .where(and(eq(catalogSites.id,classInstance.siteId),eq(catalogSites.status,"active")))
        .limit(1);
      if(!site)throw new AuthorizationError("currently authorized Class Site");
      if(classInstance.deliveryMode!=="self_paced"){
        const [placement]=await tx.select({id:classroomDeploymentSites.id})
          .from(classroomDeploymentSites)
          .where(and(
            eq(classroomDeploymentSites.deploymentId,classInstance.deploymentId),
            eq(classroomDeploymentSites.siteId,classInstance.siteId),
          )).limit(1);
        if(!placement)throw new AuthorizationError("current Class Site placement");
      }
    }
    const accepted=authorizeNativeClassAttempt({
      actorPersonId:context.actorPersonId,attempt,classInstance,
      enrollment:classEnrollment,
      authority:deployment&&adoption&&course&&offering?{
        deploymentState:deployment.status,
        adoptionState:adoption.approvalStatus,
        adoptionValidFrom:adoption.validFrom,
        adoptionValidThrough:adoption.validThrough,
        coursePublished:course.lifecycle==="published"&&course.publishedAt!==null,
        offeringPublished:offering.lifecycle==="published"&&offering.publishedAt!==null,
      }:null,
      now:new Date(),historicalRead:allowCompletedHistory,
    });
    return {
      courseAttemptId:accepted.courseAttemptId,
      courseVersionId:accepted.courseVersionId,
      deploymentId:attempt.deploymentId,sectionId:null,
      source:"class",participantPersonId:context.actorPersonId!,
      noncreditRegistrationId:null,
    };
  }
  let enrollment: {id:string;deploymentId:string;learnerPersonId:string;status:"pending"|"active"|"completed"|"withdrawn"|"cancelled"} | null=null;
  let registration: typeof noncreditRegistrations.$inferSelect | null=null;
  let training: typeof noncreditTrainingVersions.$inferSelect | null=null;
  if (attempt.enrollmentId) {
    const [source] = await tx.select().from(enrollments)
      .where(and(eq(enrollments.id,attempt.enrollmentId),
        eq(enrollments.deploymentId,attempt.deploymentId))).limit(1);
    if (source) {
      const [learner] = await tx.select().from(learnerProfiles)
        .where(eq(learnerProfiles.id,source.learnerId)).limit(1);
      if (learner) enrollment={id:source.id,deploymentId:source.deploymentId,
        learnerPersonId:learner.personId,status:source.status};
    }
  }
  if (attempt.noncreditRegistrationId) {
    [registration] = await tx.select().from(noncreditRegistrations)
      .where(and(eq(noncreditRegistrations.id,attempt.noncreditRegistrationId),
        eq(noncreditRegistrations.deploymentId,attempt.deploymentId))).limit(1);
    if (registration) {
      [training] = await tx.select().from(noncreditTrainingVersions)
        .where(eq(noncreditTrainingVersions.id,registration.trainingVersionId)).limit(1);
    }
  }
  return resolveCanonicalCourseParticipation({
    actorPersonId:context.actorPersonId,attempt,enrollment,registration,training,
    authority:deployment&&adoption&&course&&offering?{
      deploymentId:deployment.id,deploymentStatus:deployment.status,
      adoptionId:adoption.id,adoptionStatus:adoption.approvalStatus,
      adoptionValidFrom:adoption.validFrom,adoptionValidThrough:adoption.validThrough,
      coursePublished:course.lifecycle==="published",offeringPublished:offering.lifecycle==="published",
    }:null,
    now:new Date(),allowCompletedHistory,
  });
}
