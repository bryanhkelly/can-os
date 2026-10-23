import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { applications, guardianRelationships, programs, studentProfiles } from "@/db/schema";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import type { AccessContext } from "@/domain/access-context";
import { isVerifiedEnrollmentGuardian } from "@/domain/guardian-offer-visibility";

export async function authorizeEnrollmentApplication(
  actor: AccessContext, applicationId: string, executor: Pick<typeof db, "select"> = db,
) {
  if (!actor.actorPersonId || !["registrar", "guardian"].includes(actor.role))
    throw new AuthorizationError("registrar or managing guardian enrollment access");
  assertCapability(actor, actor.role === "guardian" ? "enrollment.apply" : "enrollment.decide");
  const [application] = await executor.select({
    id: applications.id, programId: applications.programId, metadata: applications.metadata,
    stage: applications.stage, siteId: programs.siteId, organizationId: programs.organizationId,
    studentPersonId: studentProfiles.personId,
  }).from(applications)
    .innerJoin(programs, eq(programs.id, applications.programId))
    .innerJoin(studentProfiles, eq(studentProfiles.id, applications.studentProfileId))
    .where(eq(applications.id, applicationId)).limit(1);
  if (!application || !application.siteId ||
      !actor.scope.programIds?.includes(application.programId) ||
      !actor.scope.siteIds?.includes(application.siteId) ||
      !actor.scope.organizationIds?.includes(application.organizationId))
    throw new AuthorizationError("enrollment application school and program scope");
  if (actor.role === "guardian") {
    const [relationship] = await executor.select({
      id: guardianRelationships.id,
      canManageEnrollment: guardianRelationships.canManageEnrollment,
      metadata: guardianRelationships.metadata,
    }).from(guardianRelationships)
      .where(and(eq(guardianRelationships.guardianPersonId, actor.actorPersonId),
        eq(guardianRelationships.studentPersonId, application.studentPersonId),
        eq(guardianRelationships.canManageEnrollment, true))).for("share").limit(1);
    // A default capability bit on an unverified prospective relationship is
    // not lawful permission to view or sign a child's enrollment documents.
    if (!isVerifiedEnrollmentGuardian(relationship))
      throw new AuthorizationError("independently verified managing guardian relationship");
  }
  return application;
}
