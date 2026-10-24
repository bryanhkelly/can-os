import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  attendanceEvents,
  attendanceExcuses,
  auditEvents,
  guardianRelationships,
  people,
  programs,
  sectionTeachers,
  studentProfiles,
} from "@/db/schema";
import {
  assertCapability,
  assertProgramScope,
  assertSiteScope,
  AuthorizationError,
  type CommandContext,
} from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";
import { assertOnsiteAttendanceScope, isOnsiteAttendanceRole } from "@/domain/onsite-attendance-access";
import { guardianRelationshipPredicate } from "@/domain/guardian-relationship";
import type { AccessContext } from "@/domain/access-context";
import { emitEvent, notify, writeAudit } from "@/platform/mutation";
import {
  emailNotificationRecipients,
  sendNotificationEmail,
} from "@/modules/communication/notification-email.server";

export async function recordAttendance(
  context: CommandContext,
  input: {
    studentProfileId: string;
    programId: string;
    siteId?: string;
    sectionId?: string;
    occurrenceKey: string;
    status: "expected" | "present" | "absent" | "tardy" | "excused";
    expectedAt: Date;
    sourceKey: string;
    metadata?: Record<string, unknown>;
  },
): Promise<string> {
  assertCapability(context, "attendance.write");
  assertProgramScope(context, input.programId);
  assertSiteScope(context, input.siteId);
  if (!context.actorPersonId) throw new Error("Attendance actor is required");
  const actorPersonId = context.actorPersonId;

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: attendanceEvents.id })
      .from(attendanceEvents)
      .where(eq(attendanceEvents.sourceKey, input.sourceKey))
      .limit(1);

    if (existing) return existing.id;

    const [event] = await tx
      .insert(attendanceEvents)
      .values({
        studentProfileId: input.studentProfileId,
        programId: input.programId,
        siteId: input.siteId,
        sectionId: input.sectionId,
        occurrenceKey: input.occurrenceKey,
        status: input.status,
        expectedAt: input.expectedAt,
        recordedByPersonId: actorPersonId,
        sourceKey: input.sourceKey,
        metadata: input.metadata ?? {},
      })
      .returning({ id: attendanceEvents.id });

    if (!event) throw new Error("Failed to create AttendanceEvent");

    if (input.status === "absent") {
      const [student] = await tx
        .select({ personId: studentProfiles.personId })
        .from(studentProfiles)
        .where(eq(studentProfiles.id, input.studentProfileId))
        .limit(1);

      if (!student) throw new Error("StudentProfile not found");

      const guardians = await tx
        .select({ personId: guardianRelationships.guardianPersonId })
        .from(guardianRelationships)
        .where(guardianRelationshipPredicate({
          studentPersonId:student.personId,access:"attendance-excuse",
        }));

      await emitEvent(tx, {
        eventType: EventTypes.StudentMarkedAbsent,
        aggregateType: "attendance_event",
        aggregateId: event.id,
        actorPersonId: actorPersonId,
        payload: {
          studentProfileId: input.studentProfileId,
          programId: input.programId,
          siteId: input.siteId ?? null,
          sectionId: input.sectionId ?? null,
          expectedAt: input.expectedAt.toISOString(),
        },
      });

      if (guardians.length > 0) {
        for (const { personId } of guardians) {
          await notify(tx, {
            recipientPersonId: personId,
            type: "student_absent",
            title: "Attendance needs your attention",
            body: "Your student was marked absent. Submit an excuse if appropriate.",
            resourceType: "attendance_event",
            resourceId: event.id,
          });
        }
      }
    }

    await writeAudit(tx, context, {
      action: "attendance.record",
      entityType: "attendance_event",
      entityId: event.id,
      scope: {
        programId: input.programId,
        siteId: input.siteId ?? null,
        sectionId: input.sectionId ?? null,
      },
      after: {
        status: input.status,
        studentProfileId: input.studentProfileId,
        expectedAt: input.expectedAt.toISOString(),
      },
      contextExtras: {
        sourceKey: input.sourceKey,
      },
    });

    return event.id;
  });
}

export async function submitAttendanceExcuse(
  context: CommandContext,
  input: {
    attendanceEventId: string;
    reason: string;
    documentIds?: string[];
  },
): Promise<string> {
  assertCapability(context, "attendance.excuse.submit");
  if ((context as CommandContext & { role?: string }).role !== "guardian" || !context.actorPersonId)
    throw new Error("Verified guardian identity is required");
  const actorPersonId = context.actorPersonId;

  return db.transaction(async (tx) => {
    const [attendance] = await tx
      .select({
        id: attendanceEvents.id,
        studentProfileId: attendanceEvents.studentProfileId,
        programId: attendanceEvents.programId,
        siteId: attendanceEvents.siteId,
        status: attendanceEvents.status,
      })
      .from(attendanceEvents)
      .where(eq(attendanceEvents.id, input.attendanceEventId))
      .limit(1);

    if (!attendance) throw new Error("AttendanceEvent not found");
    assertProgramScope(context, attendance.programId);
    assertSiteScope(context, attendance.siteId);
    // This is the same student/occurrence lock used by staff revisions and
    // excuse review. Freshness and the insert must share one transaction.
    const [source] = await tx.select({ occurrenceKey: attendanceEvents.occurrenceKey })
      .from(attendanceEvents).where(eq(attendanceEvents.id, attendance.id)).limit(1);
    if (!source) throw new Error("AttendanceEvent not found");
    const lockKey = "attendance:" + attendance.studentProfileId + ":" + source.occurrenceKey;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);
    const [student] = await tx
      .select({ personId: studentProfiles.personId })
      .from(studentProfiles)
      .where(eq(studentProfiles.id, attendance.studentProfileId))
      .limit(1);

    if (!student) throw new Error("StudentProfile not found");

    const [guardian] = await tx
      .select({ id: guardianRelationships.id })
      .from(guardianRelationships)
      .where(
        and(
          guardianRelationshipPredicate({
            guardianPersonId:actorPersonId,
            studentPersonId:student.personId,
            access:"attendance-excuse",
          }),
        ),
      )
      .limit(1);

    if (!guardian) {
      throw new Error("Actor is not authorized to submit this attendance excuse");
    }

    const [existing] = await tx
      .select({ id: attendanceExcuses.id })
      .from(attendanceExcuses)
      .where(eq(attendanceExcuses.attendanceEventId, input.attendanceEventId))
      .orderBy(desc(attendanceExcuses.createdAt))
      .limit(1);
    if (existing) return existing.id; // Idempotent retry after a later correction.
    const [latest] = await tx.select({ id: attendanceEvents.id, status: attendanceEvents.status })
      .from(attendanceEvents).where(and(
        eq(attendanceEvents.studentProfileId, attendance.studentProfileId),
        eq(attendanceEvents.programId, attendance.programId),
        eq(attendanceEvents.occurrenceKey, source.occurrenceKey),
      )).orderBy(desc(attendanceEvents.recordedAt), desc(attendanceEvents.id)).limit(1);
    if (!latest || latest.id !== attendance.id ||
        !["absent", "tardy"].includes(latest.status)) {
      throw new Error("Attendance conflict: the record was corrected. Refresh before submitting an excuse.");
    }

    const [excuse] = await tx
      .insert(attendanceExcuses)
      .values({
        attendanceEventId: input.attendanceEventId,
        submittedByPersonId: actorPersonId,
        reason: input.reason,
        documentIds: input.documentIds ?? [],
      })
      .returning({ id: attendanceExcuses.id });

    if (!excuse) throw new Error("Failed to create AttendanceExcuse");

    await emitEvent(tx, {
      eventType: EventTypes.AttendanceExcuseSubmitted,
      aggregateType: "attendance_excuse",
      aggregateId: excuse.id,
      actorPersonId: actorPersonId,
      payload: { attendanceEventId: input.attendanceEventId },
    });

    await writeAudit(tx, context, {
      action: "attendance.excuse.submit",
      entityType: "attendance_excuse",
      entityId: excuse.id,
      scope: {},
      after: {
        status: "submitted",
        attendanceEventId: input.attendanceEventId,
      },
    });

    return excuse.id;
  });
}

export async function reviewAttendanceExcuse(
  context: CommandContext,
  input: {
    excuseId: string;
    decision: "approved" | "rejected";
    reviewNote?: string;
  },
): Promise<{ excuseId: string; correctionAttendanceEventId?: string }> {
  assertCapability(context, "attendance.excuse.review");
  const reviewerRole = (context as CommandContext & { role?: string }).role;
  if (!context.actorPersonId || !["registrar", "teacher"].includes(reviewerRole ?? ""))
    throw new Error("Verified staff reviewer identity is required");
  const actorPersonId = context.actorPersonId;
  let submitterEmailNotice: { submittedByPersonId: string } | undefined;

  return db.transaction(async (tx) => {
    const [record] = await tx
      .select({
        excuseId: attendanceExcuses.id,
        excuseStatus: attendanceExcuses.status,
        submittedByPersonId: attendanceExcuses.submittedByPersonId,
        attendanceEventId: attendanceExcuses.attendanceEventId,
        studentProfileId: attendanceEvents.studentProfileId,
        programId: attendanceEvents.programId,
        siteId: attendanceEvents.siteId,
        sectionId: attendanceEvents.sectionId,
        expectedAt: attendanceEvents.expectedAt,
      })
      .from(attendanceExcuses)
      .innerJoin(
        attendanceEvents,
        eq(attendanceEvents.id, attendanceExcuses.attendanceEventId),
      )
      .where(eq(attendanceExcuses.id, input.excuseId))
      .limit(1);

    if (!record) throw new Error("AttendanceExcuse not found");
    assertProgramScope(context, record.programId);
    assertSiteScope(context, record.siteId);
    const [host] = await tx.select({
      organizationId: programs.organizationId, siteId: programs.siteId,
    }).from(programs).where(eq(programs.id, record.programId)).limit(1);
    if (!host || !context.scope.organizationIds?.includes(host.organizationId) ||
        !record.siteId || host.siteId !== record.siteId)
      throw new Error("Excuse school and organization scope is not authorized");
    if (reviewerRole === "teacher") {
      if (!record.sectionId) throw new Error("Excuse has no teaching section");
      const [assignment] = await tx.select({ id: sectionTeachers.id })
        .from(sectionTeachers).where(and(
          eq(sectionTeachers.sectionId, record.sectionId),
          eq(sectionTeachers.personId, actorPersonId),
        )).limit(1);
      if (!assignment) throw new Error("Reviewer is not assigned to the attendance section");
    }
    const [source] = await tx.select({ occurrenceKey: attendanceEvents.occurrenceKey })
      .from(attendanceEvents).where(eq(attendanceEvents.id, record.attendanceEventId)).limit(1);
    if (!source) throw new Error("AttendanceEvent not found");
    const lockKey = "attendance:" + record.studentProfileId + ":" + source.occurrenceKey;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);
    const [lockedExcuse] = await tx.select({ status: attendanceExcuses.status })
      .from(attendanceExcuses).where(eq(attendanceExcuses.id, record.excuseId))
      .for("update").limit(1);
    if (!lockedExcuse) throw new Error("AttendanceExcuse not found");
    if (lockedExcuse.status === "approved" || lockedExcuse.status === "rejected") {
      if (lockedExcuse.status !== input.decision)
        throw new Error("Excuse has already been reviewed with a different decision");
      const [existingCorrection] = await tx
        .select({ id: attendanceEvents.id })
        .from(attendanceEvents)
        .where(
          eq(
            attendanceEvents.supersedesAttendanceEventId,
            record.attendanceEventId,
          ),
        )
        .limit(1);

      return existingCorrection
        ? {
            excuseId: record.excuseId,
            correctionAttendanceEventId: existingCorrection.id,
          }
        : { excuseId: record.excuseId };
    }
    if (lockedExcuse.status !== "submitted")
      throw new Error("Attendance excuse is no longer awaiting review");
    const [latest] = await tx.select({
      id: attendanceEvents.id, status: attendanceEvents.status,
      recordedAt: attendanceEvents.recordedAt,
    })
      .from(attendanceEvents).where(and(
        eq(attendanceEvents.studentProfileId, record.studentProfileId),
        eq(attendanceEvents.programId, record.programId),
        eq(attendanceEvents.occurrenceKey, source.occurrenceKey),
      )).orderBy(desc(attendanceEvents.recordedAt), desc(attendanceEvents.id)).limit(1);
    if (!latest || latest.id !== record.attendanceEventId ||
        !["absent", "tardy"].includes(latest.status))
      throw new Error("Attendance conflict: school record changed after this excuse was submitted. Refresh and reconcile.");

    // Preserve event order even when two corrections share one millisecond.
    const reviewedAt = new Date(Math.max(Date.now(), latest.recordedAt.getTime() + 1));

    await tx
      .update(attendanceExcuses)
      .set({
        status: input.decision,
        reviewedByPersonId: actorPersonId,
        reviewedAt,
        reviewNote: input.reviewNote,
        updatedAt: reviewedAt,
      })
      .where(eq(attendanceExcuses.id, input.excuseId));

    let correctionAttendanceEventId: string | undefined;

    if (input.decision === "approved") {
      const [correction] = await tx
        .insert(attendanceEvents)
        .values({
          studentProfileId: record.studentProfileId,
          programId: record.programId,
          siteId: record.siteId,
          sectionId: record.sectionId,
          occurrenceKey: source.occurrenceKey,
          status: "excused",
          expectedAt: record.expectedAt,
          recordedAt: reviewedAt,
          recordedByPersonId: actorPersonId,
          sourceKey: `attendance-excuse:${record.excuseId}`,
          supersedesAttendanceEventId: record.attendanceEventId,
          metadata: {
            attendanceExcuseId: record.excuseId,
            correctionReason: "approved_excuse",
          },
        })
        .returning({ id: attendanceEvents.id });

      if (!correction) throw new Error("Failed to create attendance correction");
      correctionAttendanceEventId = correction.id;
    }

    await emitEvent(tx, {
      eventType:
        input.decision === "approved"
          ? EventTypes.AttendanceExcuseApproved
          : EventTypes.AttendanceExcuseRejected,
      aggregateType: "attendance_excuse",
      aggregateId: record.excuseId,
      actorPersonId: actorPersonId,
      payload: {
        attendanceEventId: record.attendanceEventId,
        correctionAttendanceEventId: correctionAttendanceEventId ?? null,
      },
    });

    await writeAudit(tx, context, {
      action: `attendance.excuse.${input.decision}`,
      entityType: "attendance_excuse",
      entityId: record.excuseId,
      scope: {
        programId: record.programId,
        siteId: record.siteId,
        sectionId: record.sectionId,
      },
      before: { status: record.excuseStatus },
      after: {
        status: input.decision,
        correctionAttendanceEventId: correctionAttendanceEventId ?? null,
      },
      contextExtras: {
        reviewNote: input.reviewNote ?? null,
      },
    });

    submitterEmailNotice = {
      submittedByPersonId: record.submittedByPersonId,
    };

    return correctionAttendanceEventId
      ? { excuseId: record.excuseId, correctionAttendanceEventId }
      : { excuseId: record.excuseId };
  }).then(async (result) => {
    if (submitterEmailNotice) {
      const emails = await emailNotificationRecipients([
        submitterEmailNotice.submittedByPersonId,
      ]);
      const to = emails.get(submitterEmailNotice.submittedByPersonId);
      if (to) {
        await sendNotificationEmail({
          to,
          subject: `Attendance excuse ${input.decision}`,
          text: `Your attendance excuse was ${input.decision}.${
            input.reviewNote ? ` Review note: ${input.reviewNote}` : ""
          }`,
        });
      }
    }
    return result;
  });
}

export async function closeObsoleteAttendanceExcuse(
  context: CommandContext,
  input: { excuseId: string; reason: string; expectedCurrentEventId: string },
): Promise<{ excuseId: string }> {
  assertCapability(context, "attendance.excuse.review");
  if ((context as CommandContext & { role?: string }).role !== "registrar" || !context.actorPersonId)
    throw new Error("A verified registrar must close an obsolete excuse");
  const reason = input.reason.trim();
  if (reason.length < 10 || reason.length > 2000)
    throw new Error("Closure reason must be 10 to 2000 characters");
  return db.transaction(async tx => {
    const [record] = await tx.select({
      attendanceEventId: attendanceEvents.id,
      studentProfileId: attendanceEvents.studentProfileId,
      programId: attendanceEvents.programId, siteId: attendanceEvents.siteId,
      occurrenceKey: attendanceEvents.occurrenceKey,
      submittedByPersonId: attendanceExcuses.submittedByPersonId,
    }).from(attendanceExcuses)
      .innerJoin(attendanceEvents, eq(attendanceEvents.id, attendanceExcuses.attendanceEventId))
      .where(eq(attendanceExcuses.id, input.excuseId)).limit(1);
    if (!record) throw new Error("AttendanceExcuse not found");
    if (!context.scope.programIds?.includes(record.programId) || !record.siteId ||
        !context.scope.siteIds?.includes(record.siteId))
      throw new Error("Excuse site/program scope is not authorized");
    const [host] = await tx.select({ organizationId: programs.organizationId, siteId: programs.siteId })
      .from(programs).where(eq(programs.id, record.programId)).limit(1);
    if (!host || host.siteId !== record.siteId ||
        !context.scope.organizationIds?.includes(host.organizationId))
      throw new Error("Excuse school and organization scope is not authorized");
    const lockKey = "attendance:" + record.studentProfileId + ":" + record.occurrenceKey;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);
    const [excuse] = await tx.select({
      status: attendanceExcuses.status, reviewNote: attendanceExcuses.reviewNote,
    }).from(attendanceExcuses).where(eq(attendanceExcuses.id, input.excuseId)).for("update").limit(1);
    if (!excuse) throw new Error("AttendanceExcuse not found");
    if (excuse.status === "withdrawn") {
      const [evidence] = await tx.select({ after: auditEvents.after }).from(auditEvents)
        .where(and(eq(auditEvents.resourceId, input.excuseId),
          eq(auditEvents.action, "attendance.excuse.withdraw"))).limit(1);
      if (excuse.reviewNote !== reason || evidence?.after?.currentAttendanceEventId !== input.expectedCurrentEventId)
        throw new Error("Excuse was already closed with different input. Refresh its history.");
      return { excuseId: input.excuseId };
    }
    if (excuse.status !== "submitted")
      throw new Error("Only a submitted obsolete excuse can be closed");
    const [current] = await tx.select({ id: attendanceEvents.id, status: attendanceEvents.status })
      .from(attendanceEvents).where(and(
        eq(attendanceEvents.studentProfileId, record.studentProfileId),
        eq(attendanceEvents.programId, record.programId),
        eq(attendanceEvents.occurrenceKey, record.occurrenceKey),
      )).orderBy(desc(attendanceEvents.recordedAt), desc(attendanceEvents.id)).limit(1);
    if (!current || current.id === record.attendanceEventId)
      throw new Error("This excuse still belongs to the current attendance record; review it instead");
    if (current.id !== input.expectedCurrentEventId)
      throw new Error("Attendance conflict: the school record changed. Refresh before closing this excuse.");
    const now = new Date();
    await tx.update(attendanceExcuses).set({
      status: "withdrawn", reviewedByPersonId: context.actorPersonId,
      reviewedAt: now, updatedAt: now, reviewNote: reason,
    }).where(eq(attendanceExcuses.id, input.excuseId));
    await writeAudit(tx, context, {
      action: "attendance.excuse.withdraw", entityType: "attendance_excuse", entityId: input.excuseId,
      scope: { programId: record.programId, siteId: record.siteId },
      before: { status: "submitted", attendanceEventId: record.attendanceEventId },
      after: { status: "withdrawn", currentAttendanceEventId: current.id, currentStatus: current.status, reason },
    });
    const eventId = await emitEvent(tx, {
      eventType: EventTypes.AttendanceExcuseWithdrawn, aggregateType: "attendance_excuse",
      aggregateId: input.excuseId, actorPersonId: context.actorPersonId,
      programId: record.programId, siteId: record.siteId,
      payload: { attendanceEventId: record.attendanceEventId, currentAttendanceEventId: current.id },
    });
    await notify(tx, {
      recipientPersonId: record.submittedByPersonId, type: "attendance_excuse_withdrawn",
      title: "Attendance excuse closed after a correction",
      body: "The school closed your earlier excuse because attendance was corrected. The current attendance record was not changed.",
      resourceType: "attendance_event", resourceId: record.attendanceEventId, eventId,
    });
    return { excuseId: input.excuseId };
  });
}

/**
 * Staff marking/reconciliation with an append-only correction chain.
 * The caller supplies a stable UUID for one user action so offline retries
 * cannot create duplicate attendance entries or duplicate guardian notices.
 */
export async function recordAttendanceRevision(
 context:CommandContext,
 input:{
  studentProfileId:string;programId:string;siteId?:string;sectionId?:string;
  occurrenceKey:string;status:"present"|"absent"|"tardy";
  expectedAt:Date;mutationId:string;note?:string;expectedPreviousEventId?:string|null;
  /** Validated inside the same locked transaction as the canonical revision. */
  requireExpectedOnsiteDate?:string;
 }):Promise<string>{
 // Staff observers receive ONLY a scheduled site-day write path, scoped to
 // their verified single-site membership even inside the shared data layer.
 const onsite=isOnsiteAttendanceRole((context as AccessContext).role??"");
 if(onsite){
  assertOnsiteAttendanceScope(context as AccessContext,input.siteId);
  if(!input.requireExpectedOnsiteDate ||
     input.occurrenceKey!==input.requireExpectedOnsiteDate+":site-day")
   throw new AuthorizationError("onsite staff may only record scheduled site-day attendance");
 }else{
  assertCapability(context,"attendance.write");
 }
 assertProgramScope(context,input.programId);
 assertSiteScope(context,input.siteId);
 if(!context.actorPersonId)throw new Error("Attendance actor required");
 const recordedByPersonId=context.actorPersonId;
 return db.transaction(async tx=>{
  const key="attendance:"+input.studentProfileId+":"+input.occurrenceKey;
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
  // Site/role grants are not operational delegation. Recheck the named,
  // time-bounded Program responsibility INSIDE this write transaction, even
  // for replayed mutation IDs. The same lock serializes appointment/revocation.
  const siteActor = context as AccessContext;
  // Defense in depth: prohibit a generic site_staff grant at independently
  // church-hosted CAN schools. A staff member needs the named site director
  // or Section facilitator role. Check BEFORE idempotent mutation replay.
  if(onsite && siteActor.role==="site_staff"){
    const {requiresIndependentChurchLocalDelegation}=await import(
      "@/modules/operations/site-local-delegation.server");
    if(await requiresIndependentChurchLocalDelegation(tx,input.programId))
      throw new AuthorizationError("independent church attendance requires named local delegation");
  }
  if (onsite && (siteActor.role === "site_leader" || siteActor.role === "room_facilitator")) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"local-site-delegation:" + input.programId}))`);
    const { requireCurrentSiteLocalDelegate,
      requiresIndependentChurchLocalDelegation } = await import(
      "@/modules/operations/site-local-delegation.server");
    if (siteActor.role === "site_leader") {
      await requireCurrentSiteLocalDelegate(tx, siteActor, input.programId, "site_director");
    } else if (await requiresIndependentChurchLocalDelegation(tx, input.programId)) {
      if (!input.sectionId) throw new AuthorizationError("named Section for facilitator attendance");
      const { requireCurrentSectionFacilitator } = await import(
        "@/modules/operations/site-section-facilitators.server");
      await requireCurrentSectionFacilitator(tx, siteActor, input.programId, input.sectionId);
    }
  }
  const sourceKey="manual-revision:"+input.mutationId;
  const [repeat]=await tx.select({
   id:attendanceEvents.id,studentProfileId:attendanceEvents.studentProfileId,
   programId:attendanceEvents.programId,occurrenceKey:attendanceEvents.occurrenceKey,
   status:attendanceEvents.status,
  }).from(attendanceEvents).where(eq(attendanceEvents.sourceKey,sourceKey)).limit(1);
  if(repeat){
   if(repeat.studentProfileId!==input.studentProfileId ||
      repeat.programId!==input.programId ||
      repeat.occurrenceKey!==input.occurrenceKey ||
      repeat.status!==input.status)
    throw new Error("Attendance mutation ID has already been used for a different attendance fact");
   return repeat.id;
  }
  // Even legacy callers must pass the same calendar/section entitlement
  // check for site-day events: no alternate server function may bypass it.
  const inferredSiteDay=/^(\d{4}-\d{2}-\d{2}):site-day$/.exec(input.occurrenceKey)?.[1];
  const onsiteDate=input.requireExpectedOnsiteDate??inferredSiteDay;
  if(onsiteDate){
   const {assertExpectedOnsiteMarkInTransaction}=await import("./attendance-transaction-guards");
   await assertExpectedOnsiteMarkInTransaction(tx,context,{
    studentProfileId:input.studentProfileId,programId:input.programId,
    siteId:input.siteId??null,sectionId:input.sectionId??null,
    date:onsiteDate,occurrenceKey:input.occurrenceKey,
    expectedAt:input.expectedAt,
   });
  }
  const [prior]=await tx.select({id:attendanceEvents.id,status:attendanceEvents.status,
   recordedAt:attendanceEvents.recordedAt})
   .from(attendanceEvents).where(and(
    eq(attendanceEvents.studentProfileId,input.studentProfileId),
    eq(attendanceEvents.programId,input.programId),
    eq(attendanceEvents.occurrenceKey,input.occurrenceKey)))
   .orderBy(desc(attendanceEvents.recordedAt),desc(attendanceEvents.id))
   .limit(1);
  if(input.expectedPreviousEventId!==undefined && (prior?.id??null)!==input.expectedPreviousEventId)
   throw new Error("Attendance conflict: the school record changed after this entry was prepared. Refresh and review.");
  if(prior?.status===input.status)return prior.id;
  if(prior?.status==="excused"&&!input.note?.trim())
   throw new Error("Give a reason before changing excused attendance");
  const now=new Date(Math.max(Date.now(),(prior?.recordedAt.getTime()??0)+1));
  const [record]=await tx.insert(attendanceEvents).values({
   studentProfileId:input.studentProfileId,programId:input.programId,
   siteId:input.siteId,sectionId:input.sectionId,
   occurrenceKey:input.occurrenceKey,status:input.status,
   expectedAt:input.expectedAt,recordedAt:now,recordedByPersonId,
   sourceKey,supersedesAttendanceEventId:prior?.id,
   metadata:{surface:"staff.attendance",reason:input.note??"",mutationId:input.mutationId},
  }).returning({id:attendanceEvents.id});
  if(!record)throw new Error("Unable to record attendance");
  await emitEvent(tx,{eventType:input.status==="absent"?
   EventTypes.StudentMarkedAbsent:EventTypes.AttendanceCorrected,
   aggregateType:"attendance_event",aggregateId:record.id,
   actorPersonId:context.actorPersonId,payload:{
    studentProfileId:input.studentProfileId,programId:input.programId,
    siteId:input.siteId??null,previousEventId:prior?.id??null,
    priorStatus:prior?.status??null,newStatus:input.status,
   }});
  if(input.status==="absent"){
   const [student]=await tx.select({personId:studentProfiles.personId})
    .from(studentProfiles).where(eq(studentProfiles.id,input.studentProfileId)).limit(1);
   if(student){
    const guardians=await tx.select({personId:guardianRelationships.guardianPersonId})
     .from(guardianRelationships).where(guardianRelationshipPredicate({
      studentPersonId:student.personId,access:"attendance-excuse",
    }));
    for(const guardian of guardians){
     await notify(tx,{recipientPersonId:guardian.personId,type:"student_absent",
      title:"Attendance needs your attention",
      body:"Your student was marked absent. Submit an excuse if appropriate.",
      resourceType:"attendance_event",resourceId:record.id});
    }
   }
  }
  await writeAudit(tx,context,{action:prior?"attendance.correct":"attendance.record",
   entityType:"attendance_event",entityId:record.id,
   scope:{siteId:input.siteId??null,programId:input.programId},
   before:prior?{status:prior.status,attendanceEventId:prior.id}:undefined,
   after:{status:input.status,studentProfileId:input.studentProfileId},
   contextExtras:{mutationId:input.mutationId,reason:input.note??null}});
  return record.id;
 });
}
