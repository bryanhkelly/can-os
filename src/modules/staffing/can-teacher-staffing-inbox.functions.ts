import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { actions, people, programs } from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";
import { recordAudit, requireActor } from "@/modules/identity/actors.server";
import { emitEvent } from "@/platform/mutation";

/**
 * CAN provider-side staffing inbox. Authorization comes from a verified
 * provider-organization registrar grant with capacity.manage, NOT from a
 * church school's administrative access or caller-provided provider ID.
 *
 * A review is not an employment offer, teacher acceptance, credential
 * verification, seat reservation, or authorized Section assignment.
 */
async function requireProviderReviewer() {
  const actor = await requireActor(["registrar"], "capacity.manage");
  const providerIds = actor.scope.organizationIds ?? [];
  if (!providerIds.length) throw new AuthorizationError("CAN academic provider scope");
  return { actor, providerIds };
}

export const listCANTeacherStaffingInbox = createServerFn({ method: "GET" })
  .handler(async () => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { providerIds } = await requireProviderReviewer();
    const rows = await db.select({
      id: actions.id,
      status: actions.status,
      metadata: actions.metadata,
      createdAt: actions.createdAt,
      programId: programs.id,
      programName: programs.name,
      academicProviderId: programs.academicProviderOrganizationId,
      schoolOrgId: programs.organizationId,
    }).from(actions)
      .innerJoin(programs, eq(programs.id, actions.programId))
      .where(and(
        eq(actions.type, "teacher_staffing_request"),
        eq(actions.status, "open"),
        inArray(programs.academicProviderOrganizationId, providerIds),
        eq(actions.subjectType, "program"),
      )).orderBy(desc(actions.createdAt)).limit(100);
    const selected = rows.filter(row =>
      row.metadata.requestOrigin === "can_teacher_marketplace" &&
      row.metadata.staffingAuthorization === "not_granted");
    const personIds = [...new Set(selected
      .map(row => row.metadata.teacherPersonId)
      .filter((id): id is string => typeof id === "string" && z.string().uuid().safeParse(id).success))];
    const candidates = personIds.length ? await db.select({
      id: people.id, first: people.legalFirstName, last: people.legalLastName,
    }).from(people).where(inArray(people.id, personIds)) : [];
    const names = new Map(candidates.map(person => [person.id, person.first + " " + person.last]));
    return { requests: selected.map(row => ({
      requestId: row.id,
      programId: row.programId,
      programName: row.programName,
      courseVersionId: String(row.metadata.courseVersionId ?? ""),
      teacherPersonId: String(row.metadata.teacherPersonId ?? ""),
      teacherName: names.get(String(row.metadata.teacherPersonId ?? "")) ?? "CAN teacher",
      sectionId: typeof row.metadata.sectionId === "string" ? row.metadata.sectionId : null,
      isSynthetic: row.metadata.isSynthetic === true,
      reviewState: row.metadata.canStaffingReviewState === "in_review" ? "in_review" as const : "requested" as const,
      requestedAt: row.createdAt.toISOString(),
    })) };
  });

const reviewInput = z.object({
  requestId: z.string().uuid(),
  decision: z.enum(["begin_review", "decline"]),
  reason: z.string().trim().max(1000).default(""),
}).strict().superRefine((value, context) => {
  if (value.decision === "decline" && value.reason.length < 8)
    context.addIssue({ code: "custom", path: ["reason"], message: "A decline requires a reason of at least eight characters" });
});

export const reviewCANTeacherStaffingRequest = createServerFn({ method: "POST" })
  .validator((value: unknown) => reviewInput.parse(value))
  .handler(async ({ data }) => {
    const { actor, providerIds } = await requireProviderReviewer();
    return db.transaction(async tx => {
      const [request] = await tx.select({
        id: actions.id, status: actions.status, metadata: actions.metadata,
        programId: actions.programId, organizationId: actions.organizationId,
        siteId: actions.siteId, subjectType: actions.subjectType,
        type: actions.type,
        resolvedAt: actions.resolvedAt,
      }).from(actions).where(eq(actions.id, data.requestId)).for("update").limit(1);
      if (!request || request.type !== "teacher_staffing_request" ||
          request.subjectType !== "program" ||
          request.metadata.requestOrigin !== "can_teacher_marketplace" ||
          !request.programId || !request.organizationId || !request.siteId)
        throw new AuthorizationError("CAN staffing request not found");
      const [school] = await tx.select({
        id: programs.id, academicProviderId: programs.academicProviderOrganizationId,
        organizationId: programs.organizationId, siteId: programs.siteId,
      }).from(programs).where(eq(programs.id, request.programId)).limit(1);
      if (!school || !providerIds.includes(school.academicProviderId) ||
          request.organizationId !== school.organizationId || request.siteId !== school.siteId)
        throw new AuthorizationError("CAN provider cannot review this school's request");

      if (request.status !== "open") {
        // Idempotent replay of a previous recorded decline by this reviewer.
        if (data.decision === "decline" && request.status === "cancelled" &&
            request.metadata.canStaffingReviewedBy === actor.actorPersonId &&
            request.metadata.canStaffingDeclineReason === data.reason)
          return { requestId: request.id, status: "declined" as const, replayed: true };
        throw new Error("This staffing request is no longer open");
      }

      if (data.decision === "begin_review" && request.metadata.canStaffingReviewState === "in_review")
        return { requestId: request.id, status: "in_review" as const, replayed: true };

      const now = new Date();
      const metadata = {
        ...request.metadata,
        canStaffingReviewState: data.decision === "decline" ? "declined" : "in_review",
        canStaffingReviewedBy: actor.actorPersonId,
        canStaffingReviewedAt: now.toISOString(),
        ...(data.decision === "decline" ? { canStaffingDeclineReason: data.reason } : {}),
      };
      await tx.update(actions).set({
        metadata, updatedAt: now,
        ...(data.decision === "decline" ? {
          status: "cancelled" as const, resolvedAt: now, resolutionNote: data.reason,
        } : {}),
      }).where(eq(actions.id, request.id));
      await recordAudit(tx, actor, {
        action: data.decision === "decline" ? "can_teacher_marketplace.decline" : "can_teacher_marketplace.review",
        resourceType: "action", resourceId: request.id,
        scope: {
          organizationId: school.organizationId, siteId: school.siteId,
          programId: school.id, academicProviderOrganizationId: school.academicProviderId,
        },
        before: { status: request.status, reviewState: request.metadata.canStaffingReviewState ?? "requested" },
        after: {
          status: data.decision === "decline" ? "cancelled" : "open",
          reviewState: metadata.canStaffingReviewState,
          ...(data.decision === "decline" ? { reason: data.reason } : {}),
        },
      });
      await emitEvent(tx, {
        eventType: data.decision === "decline"
          ? EventTypes.TeacherStaffingRequestDeclined : EventTypes.TeacherStaffingRequestReviewed,
        aggregateType: "action", aggregateId: request.id,
        actorPersonId: actor.actorPersonId,
        organizationId: school.organizationId, siteId: school.siteId, programId: school.id,
        payload: { academicProviderOrganizationId: school.academicProviderId, reviewState: metadata.canStaffingReviewState },
      });
      return { requestId: request.id,
        status: data.decision === "decline" ? "declined" as const : "in_review" as const,
        replayed: false };
    });
  });
