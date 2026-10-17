import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  attendanceEvents,
  attendanceExcuses,
  guardianRelationships,
  people,
  studentProfiles,
} from "@/db/schema";
import {
  assertCapability,
  assertProgramScope,
  assertSiteScope,
  type CommandContext,
} from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";
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
        .where(eq(guardianRelationships.studentPersonId, student.personId));

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
  if (!context.actorPersonId) throw new Error("Guardian identity is required");
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
    if (attendance.status !== "absent" && attendance.status !== "tardy") {
      throw new Error("Only absent or tardy attendance can be excused");
    }

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
          eq(guardianRelationships.guardianPersonId, actorPersonId),
          eq(guardianRelationships.studentPersonId, student.personId),
          eq(guardianRelationships.canSubmitAttendanceExcuse, true),
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
      .limit(1);

    if (existing) return existing.id;

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
  if (!context.actorPersonId) throw new Error("Reviewer identity is required");
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

    if (
      record.excuseStatus === "approved" ||
      record.excuseStatus === "rejected"
    ) {
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

    const reviewedAt = new Date();

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
          occurrenceKey: (
            await tx
              .select({ occurrenceKey: attendanceEvents.occurrenceKey })
              .from(attendanceEvents)
              .where(eq(attendanceEvents.id, record.attendanceEventId))
              .limit(1)
          )[0]!.occurrenceKey,
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
 }):Promise<string>{
 assertCapability(context,"attendance.write");
 assertProgramScope(context,input.programId);
 assertSiteScope(context,input.siteId);
 if(!context.actorPersonId)throw new Error("Attendance actor required");
 return db.transaction(async tx=>{
  const key="attendance:"+input.studentProfileId+":"+input.occurrenceKey;
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
  const sourceKey="manual-revision:"+input.mutationId;
  const [repeat]=await tx.select({id:attendanceEvents.id}).from(attendanceEvents)
   .where(eq(attendanceEvents.sourceKey,sourceKey)).limit(1);
  if(repeat)return repeat.id;
  const [prior]=await tx.select({id:attendanceEvents.id,status:attendanceEvents.status})
   .from(attendanceEvents).where(and(
    eq(attendanceEvents.studentProfileId,input.studentProfileId),
    eq(attendanceEvents.programId,input.programId),
    eq(attendanceEvents.occurrenceKey,input.occurrenceKey)))
   .orderBy(desc(attendanceEvents.recordedAt),desc(attendanceEvents.createdAt))
   .limit(1);
  if(input.expectedPreviousEventId!==undefined && (prior?.id??null)!==input.expectedPreviousEventId)
   throw new Error("Attendance conflict: the school record changed after this entry was prepared. Refresh and review.");
  if(prior?.status===input.status)return prior.id;
  if(prior?.status==="excused"&&!input.note?.trim())
   throw new Error("Give a reason before changing excused attendance");
  const now=new Date();
  const [record]=await tx.insert(attendanceEvents).values({
   studentProfileId:input.studentProfileId,programId:input.programId,
   siteId:input.siteId,sectionId:input.sectionId,
   occurrenceKey:input.occurrenceKey,status:input.status,
   expectedAt:input.expectedAt,recordedAt:now,recordedByPersonId:context.actorPersonId,
   sourceKey,supersedesAttendanceEventId:prior?.id,
   metadata:{surface:"staff.attendance",reason:input.note??"",mutationId:input.mutationId},
  }).returning({id:attendanceEvents.id});
  if(!record)throw new Error("Unable to record attendance");
  await emitEvent(tx,{eventType:input.status==="absent"?
   EventTypes.StudentMarkedAbsent:"AttendanceCorrected",
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
     .from(guardianRelationships).where(eq(guardianRelationships.studentPersonId,student.personId));
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
