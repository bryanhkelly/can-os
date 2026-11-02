import { db } from "@/db/client";
import {
accessAccounts,accountPersonGrants,actions,consentRecords,
enrollments,guardianRelationships,
people,programs,sections,studentProfiles,terms
} from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import { guardianRelationshipPredicate } from "@/domain/guardian-relationship";
import { actorSiteIds,recordAudit,requireActor,type Actor } from "@/modules/identity/actors.server";
import { emitEvent,notify,notifyMany } from "@/platform/mutation";
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and,desc,eq,inArray,isNull,or } from "drizzle-orm";
import { z } from "zod";
import { getSectionRegistrationPolicy } from "./section-registration-policy-service";

import { EventTypes } from "@/domain/event-types";
const CONSENT_TYPE = "course_registration_add_decision";
const CONSENT_SUBJECT = "course_registration_request";
const CONSENT_VERSION = "course-registration/v1";

/**
 * Guardian approval is tied to the canonical student-owned Action, not a
 * fixture, browser-selected child, or mutable relationship supplied in input.
 * This keeps request/decision history with existing governance records.
 */
export const listGuardianCourseApprovals = createServerFn({ method: "GET" }).handler(async () => {
  const actor = await requireActor(["guardian"]);
  const sites = actorSiteIds(actor);
  setResponseHeader("Cache-Control", "private, no-store");
  const rows = await db.select({
    id: actions.id, status: actions.status, metadata: actions.metadata,
    ownerPersonId: actions.ownerPersonId, studentProfileId: studentProfiles.id,
    sectionId: sections.id, sectionTitle: sections.title, sectionCode: sections.code,
    siteId: sections.siteId, programId: sections.programId,
    requestSiteId: actions.siteId, requestProgramId: actions.programId,
    requestOrganizationId: actions.organizationId,
    organizationId: programs.organizationId, schoolYearId: terms.schoolYearId,
    studentName: people.legalFirstName, studentLastName: people.legalLastName,
  }).from(actions)
    .innerJoin(sections, eq(sections.id, actions.subjectId))
    .innerJoin(programs, eq(programs.id, sections.programId))
    .innerJoin(terms, eq(terms.id, sections.termId))
    .innerJoin(studentProfiles, eq(studentProfiles.personId, actions.ownerPersonId))
    .innerJoin(people, eq(people.id, actions.ownerPersonId))
    .innerJoin(guardianRelationships, guardianRelationshipPredicate({
      studentPersonId: actions.ownerPersonId,
      guardianPersonId: actor.actorPersonId,
      access: "enrollment",
    }))
    .where(and(
      eq(actions.type, "course_registration_request"),
      eq(actions.subjectType, "section"),
      eq(actions.status, "open"),
      inArray(sections.siteId, sites),
      inArray(sections.programId, actor.scope.programIds ?? []),
    ))
    .orderBy(desc(actions.createdAt)).limit(100);
  const scoped = rows.filter(row =>
    row.siteId && actor.scope.organizationIds?.includes(row.organizationId) &&
    row.siteId === row.requestSiteId && row.programId === row.requestProgramId &&
    row.organizationId === row.requestOrganizationId
  );
  // Revalidate the Action's original scope and student/year identifiers.
  const valid = scoped.filter(row =>
    row.metadata.operation === "add" &&
    row.metadata.studentProfileId === row.studentProfileId &&
    row.metadata.schoolYearId === row.schoolYearId &&
    row.ownerPersonId &&
    row.programId && row.siteId &&
    actor.scope.programIds?.includes(row.programId)
  );
  if (!valid.length) return [];
  const currentEnrollments = await db.select({
    studentProfileId: enrollments.studentProfileId, programId: enrollments.programId,
    schoolYearId: enrollments.schoolYearId,
  }).from(enrollments).where(and(
    eq(enrollments.kind, "program"), eq(enrollments.status, "active"),
    inArray(enrollments.studentProfileId, valid.map(row => row.studentProfileId)),
  ));
  const decisions = await db.select({
    subjectId: consentRecords.subjectId,
    signerPersonId: consentRecords.signerPersonId,
    evidence: consentRecords.signatureEvidence,
  }).from(consentRecords).where(and(
    eq(consentRecords.subjectType, CONSENT_SUBJECT),
    eq(consentRecords.consentType, CONSENT_TYPE),
    eq(consentRecords.version, CONSENT_VERSION),
    isNull(consentRecords.revokedAt),
    inArray(consentRecords.subjectId, valid.map(row => row.id)),
  )).orderBy(desc(consentRecords.signedAt), desc(consentRecords.createdAt));
  const latest = new Map<string, "approve" | "decline">();
  const byRequest = new Map(valid.map(row => [row.id, row] as const));
  for (const decision of decisions) {
    const request = byRequest.get(decision.subjectId);
    if (!request || decision.evidence.studentProfileId !== request.studentProfileId ||
        decision.evidence.sectionId !== request.sectionId ||
        decision.evidence.schoolYearId !== request.schoolYearId) continue;
    const key = decision.subjectId + ":" + decision.signerPersonId;
    if (latest.has(key)) continue;
    if (decision.evidence.decision === "decline") latest.set(key, "decline");
    if (decision.evidence.decision === "approve" &&
        decision.evidence.acknowledgedByGuardian === true) latest.set(key, "approve");
  }
  const result = await Promise.all(valid.map(async row => {
    if (!currentEnrollments.some(e =>
      e.studentProfileId === row.studentProfileId &&
      e.programId === row.programId && e.schoolYearId === row.schoolYearId
    )) return null;
    const policy = await getSectionRegistrationPolicy(row.sectionId);
    if (!policy.guardianApprovalRequired) return null;
    const today = new Date().toISOString().slice(0, 10);
    if (today > policy.addDropEndsOn) return null;
    return {
      id: row.id,
      studentPersonId: row.ownerPersonId,
      sectionTitle: row.sectionTitle,
      sectionCode: row.sectionCode,
      studentName: row.studentName + " " + row.studentLastName,
      status: row.status,
      myDecision: (latest.get(row.id + ":" + actor.actorPersonId) as string | undefined) ?? null,
      deadline: policy.addDropEndsOn,
    };
  }));
  return result.filter((item): item is NonNullable<typeof item> => item !== null);
});

export const decideGuardianCourseApproval = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({
    requestId: z.string().uuid(),
    approve: z.boolean(),
    acknowledge: z.boolean().default(false),
  }).parse(input))
  .handler(async ({ data }) => {
    const actor: Actor = await requireActor(["guardian"]);
    if (data.approve && !data.acknowledge) throw new Error("Confirm that you approve this class addition.");
    const sites = actorSiteIds(actor);
    return db.transaction(async tx => {
      // Serialize all guardian decisions and registrar approval on one Action.
      const [request] = await tx.select().from(actions)
        .where(and(eq(actions.id, data.requestId),
          eq(actions.type, "course_registration_request"),
          eq(actions.subjectType, "section"),
          eq(actions.status, "open")))
        .for("update").limit(1);
      if (!request || request.metadata.operation !== "add" ||
          !request.subjectId || !request.ownerPersonId || !request.organizationId ||
          !request.siteId || !request.programId)
        throw new AuthorizationError("pending course add request");
      if (!sites.includes(request.siteId) ||
          !actor.scope.organizationIds?.includes(request.organizationId) ||
          !actor.scope.programIds?.includes(request.programId))
        throw new AuthorizationError("guardian school and program scope");
      const [relationship] = await tx.select({ id: guardianRelationships.id })
        .from(guardianRelationships).where(guardianRelationshipPredicate({
          guardianPersonId: actor.actorPersonId,
          studentPersonId: request.ownerPersonId,
          access: "enrollment",
        })).limit(1);
      if (!relationship) throw new AuthorizationError("guardian enrollment authority");
      const [student] = await tx.select({ id: studentProfiles.id })
        .from(studentProfiles).where(eq(studentProfiles.personId, request.ownerPersonId)).limit(1);
      const studentProfileId = request.metadata.studentProfileId;
      const schoolYearId = request.metadata.schoolYearId;
      if (!student || student.id !== studentProfileId || typeof schoolYearId !== "string")
        throw new AuthorizationError("course request student identity");
      const [section] = await tx.select({
        id: sections.id, siteId: sections.siteId,
        programId: sections.programId, organizationId: programs.organizationId,
        schoolYearId: terms.schoolYearId,
      }).from(sections)
        .innerJoin(programs, eq(programs.id, sections.programId))
        .innerJoin(terms, eq(terms.id, sections.termId))
        .where(and(eq(sections.id, request.subjectId), eq(sections.active, true)))
        .limit(1);
      if (!section || section.siteId !== request.siteId ||
          section.programId !== request.programId ||
          section.organizationId !== request.organizationId ||
          section.schoolYearId !== schoolYearId)
        throw new AuthorizationError("course request academic scope");
      const [membership] = await tx.select({ id: enrollments.id })
        .from(enrollments).where(and(
          eq(enrollments.studentProfileId, student.id),
          eq(enrollments.programId, request.programId),
          eq(enrollments.schoolYearId, schoolYearId),
          eq(enrollments.kind, "program"), eq(enrollments.status, "active"),
        )).limit(1);
      if (!membership) throw new AuthorizationError("active student program enrollment");
      const policy = await getSectionRegistrationPolicy(section.id, tx);
      if (!policy.guardianApprovalRequired) throw new Error("This section does not require guardian approval.");
      if (new Date().toISOString().slice(0, 10) > policy.addDropEndsOn)
        throw new Error("The add/drop window has closed.");
      const [decision] = await tx.insert(consentRecords).values({
        subjectType: CONSENT_SUBJECT, subjectId: request.id,
        consentType: CONSENT_TYPE, signerPersonId: actor.actorPersonId,
        version: CONSENT_VERSION,
        signatureEvidence: {
          decision: data.approve ? "approve" : "decline",
          studentProfileId: student.id, sectionId: section.id,
          schoolYearId, accountId: actor.accountId, sessionId: actor.sessionId,
          acknowledgedByGuardian: data.approve && data.acknowledge,
        },
      }).returning({ id: consentRecords.id });
      if (!decision) throw new Error("Unable to record guardian decision");
      await recordAudit(tx, actor, {
        action: data.approve ? "course_registration.guardian.approve" : "course_registration.guardian.decline",
        resourceType: "course_registration_request", resourceId: request.id,
        scope: { siteId: request.siteId, programId: request.programId },
        after: { decision: data.approve ? "approve" : "decline", consentRecordId: decision.id },
      });
      await emitEvent(tx, {
        eventType: EventTypes.CourseRegistrationGuardianDecision, aggregateType: "action",
        aggregateId: request.id, actorPersonId: actor.actorPersonId,
        payload: { sectionId: section.id, studentProfileId: student.id, approved: data.approve },
      });
      const registrars=await tx.selectDistinct({personId:accountPersonGrants.personId})
        .from(accountPersonGrants)
        .innerJoin(accessAccounts,and(
          eq(accessAccounts.id,accountPersonGrants.accountId),
          eq(accessAccounts.disabled,false),
        ))
        .where(and(
          eq(accountPersonGrants.role,"registrar"),
          eq(accountPersonGrants.active,true),eq(accountPersonGrants.organizationId,request.organizationId),
          or(isNull(accountPersonGrants.siteId),eq(accountPersonGrants.siteId,request.siteId)),
        )).limit(20);
      await notifyMany(tx,registrars.map(registrar=>({
        recipientPersonId:registrar.personId,status:"unread" as const,
        type:"course_registration_guardian_decision_for_registrar",
        title:data.approve?"Guardian approved a pending class request":"Guardian declined a pending class request",
        body:"Review the existing course-registration Action and complete the school's schedule decision.",
        resourceType:"action",resourceId:request.id,
      })));
      await notify(tx, {
        recipientPersonId: request.ownerPersonId, status: "unread",
        type: "course_registration_guardian_decision",
        title: data.approve ? "Your guardian approved your course request" : "Your guardian declined your course request",
        body: "A guardian decision was recorded for your pending course change.",
        resourceType: "action", resourceId: request.id,
      });
      return { saved: true };
    });
  });
