import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  subscriptions,
  type EvidenceRef,
} from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import type { CommandContext } from "@/domain/command-context";
import "@/platform/subscriptions/policies";
import { getSubscriptionPolicy } from "@/platform/subscriptions/policy";
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

export type AgentToolTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

type ToolDescription = {
  readonly name: string;
  readonly description: string;
};
export type AgentTool = ToolDescription & (
  | { readonly readOnly: true; execute(context: AgentContext, args: Record<string, unknown>): Promise<ToolResult> }
  | { readonly readOnly: false; execute(context: AgentContext, args: Record<string, unknown>, tx: AgentToolTransaction): Promise<ToolResult> }
);

/** Agent runtime consumes academic module capabilities; academic SQL stays in learning. */
export { resolveVisibleStudents, assertStudentAccess } from "@/modules/learning/academic-domain-api";
import { resolveVisibleStudents } from "@/modules/learning/academic-domain-api";
import { getStudentAcademicSummary as academicSummary } from "@/modules/learning/academic-domain-api";
import { assertStudentAccess, assertGuardianAcademicAccess } from "@/modules/learning/academic-domain-api";
export type { VisibleStudent } from "@/modules/learning/academic-domain-api";

export const getStudentAcademicSummary: Extract<AgentTool, { readOnly: true }> = {
  name: "get_student_academic_summary",
  description: "Retrieve the authorized student academic summary from the Academic Domain API.",
  readOnly: true,
  execute(context, args) {
    return academicSummary(context, String(args.studentProfileId ?? ""));
  },
};

export const createWatch: Extract<AgentTool, { readOnly: false }> = {
  name: "create_watch",
  description:
    "Create a durable subscription that notifies the subscriber when watched events occur for a student (e.g. AssignmentBecameMissing).",
  readOnly: false,

  async execute(context, args, tx) {
    const studentProfileId = String(args.studentProfileId ?? "");

    const eventTypes = Array.isArray(args.eventTypes)
      ? args.eventTypes.map(String)
      : ["AssignmentBecameMissing"];
    if (!eventTypes.length) throw new Error("A watch needs at least one event type");
    const unsupported = eventTypes.filter((eventType) => !getSubscriptionPolicy(eventType));
    if (unsupported.length) {
      throw new Error(`Unsupported watch event type(s): ${unsupported.join(", ")}`);
    }

    const student = await assertStudentAccess(context, studentProfileId);

    const reminderHours =
      typeof args.remindAfterHours === "number" && args.remindAfterHours > 0
        ? Math.min(Math.round(args.remindAfterHours), 24 * 30)
        : undefined;
    const sourceConversationId =
      typeof args.sourceConversationId === "string"
        ? args.sourceConversationId
        : null;

    const [subscription] = await tx
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
    if (!subscription) throw new Error("Unable to create watch");

    return {
      summary: `I'll watch ${student.displayName} for missing assignments${
        reminderHours ? ` and remind you after ${reminderHours} hours if one stays missing` : ""
      }. You can manage this anytime under Things CAN Is Watching.`,
      evidence: [
        { type: "subscription", id: subscription.id, label: "Assignment monitoring" },
      ],
      data: { subscriptionId: subscription.id },
    };
  },
};

export const listWatches: Extract<AgentTool, { readOnly: true }> = {
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

    const visible = await resolveVisibleStudents(context);
    const names = new Map(visible.map(student => [student.studentProfileId, student.displayName]));

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

export const setWatchStatus: Extract<AgentTool, { readOnly: false }> = {
  name: "set_watch_status",
  description: "Pause, resume, or revoke one of the subscriber's watches.",
  readOnly: false,

  async execute(context, args, tx) {
    const subscriptionId = String(args.subscriptionId ?? "");
    const status = String(args.status ?? "");
    if (status !== "active" && status !== "paused" && status !== "revoked") {
      throw new Error(`Invalid watch status: ${status}`);
    }

    const rows = await tx
      .update(subscriptions)
      .set({ status, updatedAt: new Date() })
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
export const createWeeklyDigest: Extract<AgentTool, { readOnly: false }> = {
  name: "create_weekly_digest",
  description: "Create a weekly academic summary schedule for an authorized guardian.",
  readOnly: false,
  async execute(context, args, tx) {
    const studentProfileId = String(args.studentProfileId ?? "");
    const student = await assertStudentAccess(context, studentProfileId);
    await assertGuardianAcademicAccess(context, studentProfileId);
    const weekday = Number(args.weekday ?? 5);
    const hour = Number(args.hour ?? 19);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6 ||
        !Number.isInteger(hour) || hour < 0 || hour > 23) throw new Error("Invalid schedule");
    const prefs = await getNotificationPreferences(context.actorPersonId);
    const [subscription] = await tx.insert(subscriptions).values({
      subscriberPersonId: context.actorPersonId,
      eventTypes: ["WeeklyStudentDigest"],
      subjectType: "student_profile",
      subjectId: studentProfileId,
      filter: { kind: "weekly_digest", weekday, hour, timezone: prefs?.timezone ?? "UTC" },
      channel: "in_app",
      createdVia: "conversation",
      sourceConversationId: typeof args.sourceConversationId === "string" ? args.sourceConversationId : null,
    }).returning({ id: subscriptions.id });
    if (!subscription) throw new Error("Unable to create weekly digest");
    return {
      summary: `I'll send a weekly academic digest for ${student.displayName}. You can pause or revoke it in Things CAN Is Watching.`,
      evidence: [{ type: "subscription", id: subscription.id, label: "Weekly academic digest" }],
      data: { subscriptionId: subscription.id },
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
