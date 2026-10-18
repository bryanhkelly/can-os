import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
  actions, consentRecords, enrollments, guardianRelationships, people, programs,
  sections, studentProfiles, terms,
} from "@/db/schema";
import { actorSiteIds, requireActor } from "@/modules/identity/actors.server";
import { getSectionRegistrationPolicy } from "./section-registration-policy-service";
import { resolveCourseGuardianConsent } from "./course-guardian-consent";

/** Registrar's canonical Action queue for pending course changes (not a shadow workflow). */
export const listRegistrarCourseRequests = createServerFn({ method: "GET" }).handler(async () => {
  const actor = await requireActor(["registrar"], "registrations:approve");
  const sites = actorSiteIds(actor);
  setResponseHeader("Cache-Control", "private, no-store");
  const rows = await db.select({
    id: actions.id, title: actions.title, metadata: actions.metadata,
    requestSiteId: actions.siteId, requestProgramId: actions.programId,
    requestOrganizationId: actions.organizationId, requestOwner: actions.ownerPersonId,
    studentProfileId: studentProfiles.id,
    studentName: people.legalFirstName, studentLastName: people.legalLastName,
    sectionId: sections.id, sectionTitle: sections.title, sectionCode: sections.code,
    sectionSiteId: sections.siteId, sectionProgramId: sections.programId,
    organizationId: programs.organizationId, schoolYearId: terms.schoolYearId,
    createdAt: actions.createdAt,
  }).from(actions)
    .innerJoin(sections, eq(sections.id, actions.subjectId))
    .innerJoin(programs, eq(programs.id, sections.programId))
    .innerJoin(terms, eq(terms.id, sections.termId))
    .innerJoin(studentProfiles, eq(studentProfiles.personId, actions.ownerPersonId))
    .innerJoin(people, eq(people.id, actions.ownerPersonId))
    .where(and(
      eq(actions.type, "course_registration_request"),
      eq(actions.subjectType, "section"),
      eq(actions.status, "open"),
      inArray(sections.siteId, sites),
      inArray(sections.programId, actor.scope.programIds ?? []),
    ))
    .orderBy(desc(actions.createdAt)).limit(100);
  const scoped = rows.filter(row =>
    row.requestOwner && row.sectionSiteId &&
    actor.scope.organizationIds?.includes(row.organizationId) &&
    row.requestSiteId === row.sectionSiteId &&
    row.requestProgramId === row.sectionProgramId &&
    row.requestOrganizationId === row.organizationId &&
    row.metadata.studentProfileId === row.studentProfileId &&
    row.metadata.schoolYearId === row.schoolYearId &&
    ["add", "drop", "withdraw"].includes(String(row.metadata.operation))
  );
  if (!scoped.length) return [];
  const studentIds = [...new Set(scoped.map(r => r.requestOwner).filter((id): id is string => !!id))];
  const [guardians, consents, activePrograms] = await Promise.all([
    db.select({
      studentPersonId: guardianRelationships.studentPersonId,
      guardianPersonId: guardianRelationships.guardianPersonId,
    }).from(guardianRelationships).where(and(
      inArray(guardianRelationships.studentPersonId, studentIds),
      eq(guardianRelationships.canManageEnrollment, true),
    )),
    db.select({
      subjectId: consentRecords.subjectId, signerPersonId: consentRecords.signerPersonId,
      evidence: consentRecords.signatureEvidence,
    }).from(consentRecords).where(and(
      eq(consentRecords.subjectType, "course_registration_request"),
      eq(consentRecords.consentType, "course_registration_add_decision"),
      eq(consentRecords.version, "course-registration/v1"),
      isNull(consentRecords.revokedAt),
      inArray(consentRecords.subjectId, scoped.map(r => r.id)),
    )).orderBy(desc(consentRecords.signedAt), desc(consentRecords.createdAt)),
    db.select({
      studentProfileId: enrollments.studentProfileId, programId: enrollments.programId,
      schoolYearId: enrollments.schoolYearId,
    }).from(enrollments).where(and(
      eq(enrollments.kind, "program"), eq(enrollments.status, "active"),
      inArray(enrollments.studentProfileId, scoped.map(r => r.studentProfileId)),
    )),
  ]);
  return Promise.all(scoped.map(async row => {
    const policy = await getSectionRegistrationPolicy(row.sectionId);
    const operation = row.metadata.operation as "add" | "drop" | "withdraw";
    const approvalState = operation === "add" && policy.guardianApprovalRequired
      ? resolveCourseGuardianConsent({
          eligibleGuardianPersonIds: guardians
            .filter(g => g.studentPersonId === row.requestOwner)
            .map(g => g.guardianPersonId),
          decisionsNewestFirst: consents.filter(c => c.subjectId === row.id),
          studentProfileId: row.studentProfileId,
          sectionId: row.sectionId,
          schoolYearId: row.schoolYearId,
        })
      : "not_required" as const;
    const programActive = activePrograms.some(e =>
      e.studentProfileId === row.studentProfileId &&
      e.programId === row.sectionProgramId &&
      e.schoolYearId === row.schoolYearId
    );
    const today = new Date().toISOString().slice(0, 10);
    const deadline = operation === "withdraw" ? policy.withdrawalEndsOn : policy.addDropEndsOn;
    return {
      id: row.id, operation, title: row.title,
      studentName: row.studentName + " " + row.studentLastName,
      sectionTitle: row.sectionTitle, sectionCode: row.sectionCode,
      programActive, deadline, deadlinePassed: today > deadline,
      guardianState: approvalState,
      canApprove: programActive && today <= deadline &&
        (approvalState === "not_required" || approvalState === "approved"),
      createdAt: row.createdAt.toISOString(),
    };
  }));
});
