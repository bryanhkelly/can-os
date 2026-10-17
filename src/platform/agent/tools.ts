import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  assessments,
  enrollments,
  guardianRelationships,
  people,
  sections,
  sectionTeachers,
  studentProfiles,
  submissions,
  subscriptions,
  type EvidenceRef,
} from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import type { CommandContext } from "@/domain/command-context";
import { getNotificationPreferences } from "@/platform/subscriptions/preferences";

/**
 * Agent tools are typed, server-side functions over domain modules. The
 * planner (deterministic today, LLM-pluggable later) proposes; the runtime
 * executes deterministically. A tool never receives more privilege than the
 * person it acts for: each checks capability AND relationship itself.
 */
export type AgentContext = CommandContext & { actorPersonId: string };

export type ToolResult = {
  summary: string;
  evidence: EvidenceRef[];
  data?: Record<string, unknown>;
};

export type AgentTool = {
  readonly name: string;
  readonly description: string;
  /** Read-only tools execute immediately; others require human approval. */
  readonly readOnly: boolean;
  execute(context: AgentContext, args: Record<string, unknown>): Promise<ToolResult>;
};

const READ_CAPABILITIES = ["student:related-read", "student:read", "teacher:read"];

function assertAnyCapability(context: CommandContext, capabilities: string[]): void {
  if (!capabilities.some((capability) => context.capabilities.has(capability))) {
    throw new AuthorizationError(capabilities[0]!);
  }
}

export type VisibleStudent = {
  studentProfileId: string;
  personId: string;
  displayName: string;
};

/**
 * Students the actor may see: themselves, children with academic visibility,
 * or students in sections they teach. Name matching is applied after the
 * authorization filter, so an unauthorized name resolves to nothing.
 */
export async function resolveVisibleStudents(
  context: AgentContext,
  nameQuery?: string,
): Promise<VisibleStudent[]> {
  const actorId = context.actorPersonId;

  const asGuardian = await db
    .select({
      studentProfileId: studentProfiles.id,
      personId: people.id,
      preferredName: people.preferredName,
      legalFirstName: people.legalFirstName,
      legalLastName: people.legalLastName,
    })
    .from(guardianRelationships)
    .innerJoin(people, eq(people.id, guardianRelationships.studentPersonId))
    .innerJoin(studentProfiles, eq(studentProfiles.personId, people.id))
    .where(
      and(
        eq(guardianRelationships.guardianPersonId, actorId),
        eq(guardianRelationships.canViewAcademics, true),
      ),
    );

  const asSelf = await db
    .select({
      studentProfileId: studentProfiles.id,
      personId: people.id,
      preferredName: people.preferredName,
      legalFirstName: people.legalFirstName,
      legalLastName: people.legalLastName,
    })
    .from(studentProfiles)
    .innerJoin(people, eq(people.id, studentProfiles.personId))
    .where(eq(studentProfiles.personId, actorId));

  const asTeacher = await db
    .select({
      studentProfileId: studentProfiles.id,
      personId: people.id,
      preferredName: people.preferredName,
      legalFirstName: people.legalFirstName,
      legalLastName: people.legalLastName,
    })
    .from(sectionTeachers)
    .innerJoin(enrollments, eq(enrollments.sectionId, sectionTeachers.sectionId))
    .innerJoin(studentProfiles, eq(studentProfiles.id, enrollments.studentProfileId))
    .innerJoin(people, eq(people.id, studentProfiles.personId))
    .where(
      and(
        eq(sectionTeachers.personId, actorId),
        eq(enrollments.status, "active"),
      ),
    );

  const byProfile = new Map<string, VisibleStudent>();
  for (const row of [...asGuardian, ...asSelf, ...asTeacher]) {
    byProfile.set(row.studentProfileId, {
      studentProfileId: row.studentProfileId,
      personId: row.personId,
      displayName: `${row.preferredName ?? row.legalFirstName} ${row.legalLastName}`,
    });
  }

  const students = [...byProfile.values()];
  if (!nameQuery) return students;
  const needle = nameQuery.trim().toLowerCase();
  return students.filter((student) =>
    student.displayName.toLowerCase().includes(needle),
  );
}

/** Verify the actor may watch/review the given student right now. */
export async function assertStudentAccess(
  context: AgentContext,
  studentProfileId: string,
): Promise<VisibleStudent> {
  assertAnyCapability(context, READ_CAPABILITIES);
  const visible = await resolveVisibleStudents(context);
  const student = visible.find((entry) => entry.studentProfileId === studentProfileId);
  if (!student) throw new AuthorizationError(`student access: ${studentProfileId}`);
  return student;
}

export const getStudentAcademicSummary: AgentTool = {
  name: "get_student_academic_summary",
  description:
    "Summarize a student's current academic standing from canonical records: active sections, missing and late work, recent grades.",
  readOnly: true,

  async execute(context, args) {
    const studentProfileId = String(args.studentProfileId ?? "");
    const student = await assertStudentAccess(context, studentProfileId);

    const missing = await db
      .select({
        submissionId: submissions.id,
        title: assessments.title,
        dueAt: assessments.dueAt,
        sectionTitle: sections.title,
      })
      .from(submissions)
      .innerJoin(assessments, eq(assessments.id, submissions.assessmentId))
      .innerJoin(sections, eq(sections.id, assessments.sectionId))
      .where(
        and(
          eq(submissions.studentProfileId, studentProfileId),
          eq(submissions.timeliness, "missing"),
        ),
      )
      .orderBy(desc(assessments.dueAt))
      .limit(10);

    const recentGrades = await db
      .select({
        submissionId: submissions.id,
        title: assessments.title,
        score: submissions.score,
        pointsPossible: assessments.pointsPossible,
        sectionTitle: sections.title,
      })
      .from(submissions)
      .innerJoin(assessments, eq(assessments.id, submissions.assessmentId))
      .innerJoin(sections, eq(sections.id, assessments.sectionId))
      .where(
        and(
          eq(submissions.studentProfileId, studentProfileId),
          eq(submissions.status, "graded"),
        ),
      )
      .orderBy(desc(submissions.gradedAt))
      .limit(5);

    const gradeParts = recentGrades.map((grade) => {
      const pct =
        grade.pointsPossible && Number(grade.pointsPossible) > 0
          ? ` (${Math.round((Number(grade.score) / Number(grade.pointsPossible)) * 100)}%)`
          : "";
      return `${grade.title}: ${grade.score}${pct} in ${grade.sectionTitle}`;
    });

    const lines: string[] = [];
    if (missing.length === 0) {
      lines.push(`${student.displayName} has no missing assignments right now.`);
    } else {
      lines.push(
        `${student.displayName} has ${missing.length} missing ${missing.length === 1 ? "assignment" : "assignments"}:`,
        ...missing.map(
          (row) =>
            `- ${row.title} (${row.sectionTitle}), due ${row.dueAt ? new Date(row.dueAt).toLocaleDateString() : "no due date"}`,
        ),
      );
    }
    if (gradeParts.length) {
      lines.push(`Recent grades: ${gradeParts.join("; ")}.`);
    }

    return {
      summary: lines.join("\n"),
      evidence: [
        ...missing.map((row) => ({
          type: "submission",
          id: row.submissionId,
          label: row.title,
        })),
        ...recentGrades.map((row) => ({
          type: "submission",
          id: row.submissionId,
          label: row.title,
        })),
      ],
      data: { missingCount: missing.length },
    };
  },
};

export const createWatch: AgentTool = {
  name: "create_watch",
  description:
    "Create a durable subscription that notifies the subscriber when watched events occur for a student (e.g. AssignmentBecameMissing).",
  readOnly: false,

  async execute(context, args) {
    const studentProfileId = String(args.studentProfileId ?? "");
    const student = await assertStudentAccess(context, studentProfileId);

    const eventTypes = Array.isArray(args.eventTypes)
      ? args.eventTypes.map(String)
      : ["AssignmentBecameMissing"];
    const reminderHours =
      typeof args.remindAfterHours === "number" && args.remindAfterHours > 0
        ? Math.min(Math.round(args.remindAfterHours), 24 * 30)
        : undefined;
    const sourceConversationId =
      typeof args.sourceConversationId === "string"
        ? args.sourceConversationId
        : null;

    const [subscription] = await db
      .insert(subscriptions)
      .values({
        subscriberPersonId: context.actorPersonId,
        eventTypes,
        subjectType: "student_profile",
        subjectId: studentProfileId,
        reminderPolicy: reminderHours ? { remindAfterHours: reminderHours } : {},
        channel: "in_app",
        createdVia: "conversation",
        sourceConversationId,
      })
      .returning({ id: subscriptions.id });

    return {
      summary: `I'll watch ${student.displayName} for missing assignments${
        reminderHours ? ` and remind you after ${reminderHours} hours if one stays missing` : ""
      }. You can manage this anytime under Things CAN Is Watching.`,
      evidence: [
        { type: "subscription", id: subscription!.id, label: "Assignment monitoring" },
      ],
      data: { subscriptionId: subscription!.id },
    };
  },
};

export const listWatches: AgentTool = {
  name: "list_watches",
  description: "List the subscriber's active standing instructions.",
  readOnly: true,

  async execute(context) {
    const rows = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.subscriberPersonId, context.actorPersonId));

    const active = rows.filter((row) => row.status === "active");
    if (!active.length) {
      return {
        summary:
          "I'm not watching anything for you yet. Ask me to watch something, like “tell me when my child misses an assignment.”",
        evidence: [],
      };
    }

    const studentIds = [
      ...new Set(
        active
          .filter((row) => row.subjectType === "student_profile")
          .map((row) => row.subjectId),
      ),
    ];
    const names = new Map<string, string>();
    if (studentIds.length) {
      const students = await db
        .select({
          studentProfileId: studentProfiles.id,
          preferredName: people.preferredName,
          legalFirstName: people.legalFirstName,
          legalLastName: people.legalLastName,
        })
        .from(studentProfiles)
        .innerJoin(people, eq(people.id, studentProfiles.personId))
        .where(inArray(studentProfiles.id, studentIds));
      for (const student of students) {
        names.set(
          student.studentProfileId,
          `${student.preferredName ?? student.legalFirstName} ${student.legalLastName}`,
        );
      }
    }

    return {
      summary: [
        `I'm watching ${active.length} ${active.length === 1 ? "thing" : "things"} for you:`,
        ...active.map((row) => {
          const who = names.get(row.subjectId) ?? row.subjectType;
          const reminder = row.reminderPolicy.remindAfterHours
            ? `, reminder after ${row.reminderPolicy.remindAfterHours}h`
            : "";
          return `- ${who}: ${row.eventTypes.join(", ")}${reminder}`;
        }),
      ].join("\n"),
      evidence: active.map((row) => ({
        type: "subscription",
        id: row.id,
        label: names.get(row.subjectId) ?? row.subjectType,
      })),
      data: { count: active.length },
    };
  },
};

export const setWatchStatus: AgentTool = {
  name: "set_watch_status",
  description: "Pause, resume, or revoke one of the subscriber's watches.",
  readOnly: false,

  async execute(context, args) {
    const subscriptionId = String(args.subscriptionId ?? "");
    const status = String(args.status ?? "");
    if (!["active", "paused", "revoked"].includes(status)) {
      throw new Error(`Invalid watch status: ${status}`);
    }

    const rows = await db
      .update(subscriptions)
      .set({ status: status as "active" | "paused" | "revoked", updatedAt: new Date() })
      .where(
        and(
          eq(subscriptions.id, subscriptionId),
          eq(subscriptions.subscriberPersonId, context.actorPersonId),
        ),
      )
      .returning({ id: subscriptions.id });

    if (!rows.length) throw new AuthorizationError(`watch: ${subscriptionId}`);

    return {
      summary:
        status === "revoked"
          ? "Done — I've turned that watch off for good."
          : status === "paused"
            ? "Paused. Say the word and I'll resume it."
            : "Resumed — I'm watching again.",
      evidence: [{ type: "subscription", id: subscriptionId, label: `Watch ${status}` }],
    };
  },
};

/** A durable weekly family digest runs independently from the chat session. */
export const createWeeklyDigest: AgentTool = {
  name: "create_weekly_digest",
  description: "Create a weekly academic summary schedule for an authorized guardian.",
  readOnly: false,
  async execute(context, args) {
    const studentProfileId = String(args.studentProfileId ?? "");
    const student = await assertStudentAccess(context, studentProfileId);
    const [guardian] = await db.select({ id: guardianRelationships.id })
      .from(guardianRelationships).where(and(
        eq(guardianRelationships.guardianPersonId, context.actorPersonId),
        eq(guardianRelationships.studentPersonId, student.personId),
        eq(guardianRelationships.canViewAcademics, true),
      )).limit(1);
    if (!guardian) throw new AuthorizationError("guardian academic relationship");
    const weekday = Number(args.weekday ?? 5);
    const hour = Number(args.hour ?? 19);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6 ||
        !Number.isInteger(hour) || hour < 0 || hour > 23) throw new Error("Invalid schedule");
    const prefs = await getNotificationPreferences(context.actorPersonId);
    const [subscription] = await db.insert(subscriptions).values({
      subscriberPersonId: context.actorPersonId,
      eventTypes: ["WeeklyStudentDigest"],
      subjectType: "student_profile",
      subjectId: studentProfileId,
      filter: { kind: "weekly_digest", weekday, hour, timezone: prefs?.timezone ?? "UTC" },
      channel: "in_app",
      createdVia: "conversation",
      sourceConversationId: typeof args.sourceConversationId === "string" ? args.sourceConversationId : null,
    }).returning({ id: subscriptions.id });
    return {
      summary: `I'll send a weekly academic digest for ${student.displayName}. You can pause or revoke it in Things CAN Is Watching.`,
      evidence: [{ type: "subscription", id: subscription!.id, label: "Weekly academic digest" }],
      data: { subscriptionId: subscription!.id },
    };
  },
};

const toolRegistry = new Map<string, AgentTool>(
  [getStudentAcademicSummary, createWatch, createWeeklyDigest, listWatches, setWatchStatus].map((tool) => [
    tool.name,
    tool,
  ]),
);

export function getAgentTool(name: string): AgentTool | undefined {
  return toolRegistry.get(name);
}

export function listAgentTools(): AgentTool[] {
  return [...toolRegistry.values()];
}
