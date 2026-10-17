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

/** Agent runtime consumes academic module capabilities; academic SQL stays in learning. */
export { resolveVisibleStudents, assertStudentAccess } from "@/modules/learning/academic-domain-api";
import { getStudentAcademicSummary as academicSummary } from "@/modules/learning/academic-domain-api";
import { assertStudentAccess } from "@/modules/learning/academic-domain-api";
import type { AcademicReadContext } from "@/modules/learning/academic-domain-api";
export type { VisibleStudent } from "@/modules/learning/academic-domain-api";

export const getStudentAcademicSummary: AgentTool = {
  name: "get_student_academic_summary",
  description: "Retrieve the authorized student academic summary from the Academic Domain API.",
  readOnly: true,
  execute(context, args) {
    return academicSummary(context, String(args.studentProfileId ?? ""));
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
