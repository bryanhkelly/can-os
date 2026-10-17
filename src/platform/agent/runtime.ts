import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  agentRuns,
  conversationMessages,
  conversations,
  type ActionPreview,
  type EvidenceRef,
} from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import { writeAudit } from "@/platform/mutation";
import {
  createWatch,
  createWeeklyDigest,
  getAgentTool,
  getStudentAcademicSummary,
  listWatches,
  resolveVisibleStudents,
  setWatchStatus,
  type AgentContext,
} from "./tools";
import { getSchoolOperationsCommandCenter } from "@/modules/operations/command-center-service";
import { HELP_TEXT, planTurn, type AgentPlan } from "./planner";

/**
 * The agent runtime turns one user message into an authorized, auditable
 * turn: persist the message, plan, execute read-only tools immediately, and
 * park consequential tool calls behind an explicit human approval card.
 */
export type AgentMessage = {
  id: string;
  role: "user" | "agent" | "system";
  body: string;
  evidenceRefs: EvidenceRef[];
  actionPreview: ActionPreview | null;
  createdAt: Date;
};

export type TurnResult = {
  conversationId: string;
  runId: string;
  runStatus: string;
  message: AgentMessage;
};

async function addMessage(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  values: {
    conversationId: string;
    role: "user" | "agent" | "system";
    body: string;
    evidenceRefs?: EvidenceRef[];
    actionPreview?: ActionPreview | null;
    agentRunId?: string | null;
  },
): Promise<AgentMessage> {
  const [row] = await tx
    .insert(conversationMessages)
    .values({
      conversationId: values.conversationId,
      role: values.role,
      body: values.body,
      evidenceRefs: values.evidenceRefs ?? [],
      actionPreview: values.actionPreview ?? null,
      agentRunId: values.agentRunId ?? null,
    })
    .returning();
  return {
    id: row!.id,
    role: row!.role,
    body: row!.body,
    evidenceRefs: row!.evidenceRefs,
    actionPreview: row!.actionPreview,
    createdAt: row!.createdAt,
  };
}

function studentNotFoundMessage(query: string, visibleCount: number): string {
  if (visibleCount === 0) {
    return "I don't have any students connected to you that I can see. If that looks wrong, your school may need to confirm your relationship or access.";
  }
  return `I couldn't find a student matching “${query}” among the students you can view. Try their first name as it appears on their record.`;
}

function studentAmbiguousMessage(matches: Array<{ displayName: string }>): string {
  return `I found more than one match: ${matches.map((m) => m.displayName).join(", ")}. Please reply with the full name of the student you mean.`;
}

export async function sendMessage(
  context: AgentContext,
  input: {
    conversationId?: string;
    body: string;
    workspaceContext?: Record<string, string>;
  },
): Promise<TurnResult> {
  const body = input.body.trim();
  if (!body) throw new Error("Empty message");

  return db.transaction(async (tx) => {
    // Conversation: resume an owned one or start a new thread.
    let conversationId = input.conversationId;
    if (conversationId) {
      const [existing] = await tx
        .select({ personId: conversations.personId })
        .from(conversations)
        .where(eq(conversations.id, conversationId))
        .limit(1);
      if (!existing || existing.personId !== context.actorPersonId) {
        throw new AuthorizationError(`conversation: ${conversationId}`);
      }
    } else {
      const [created] = await tx
        .insert(conversations)
        .values({
          personId: context.actorPersonId,
          workspaceContext: input.workspaceContext ?? {},
        })
        .returning({ id: conversations.id });
      conversationId = created!.id;
    }

    await addMessage(tx, {
      conversationId,
      role: "user",
      body,
    });

    let plan: AgentPlan = planTurn(body);
    // Clarification may consist solely of a full name. Reuse only the
    // immediately previous ambiguous plan in this same owned conversation.
    if (input.conversationId && plan.intent === "ask" && plan.kind === "help") {
      const [prior] = await tx.select({ plan: agentRuns.plan, result: agentRuns.result })
        .from(agentRuns).where(eq(agentRuns.conversationId, conversationId))
        .orderBy(desc(agentRuns.createdAt)).limit(1);
      const previous = prior?.plan as AgentPlan | undefined;
      if (prior?.result?.kind === "clarification" && previous &&
          (previous.intent === "watch" ||
           (previous.intent === "ask" && previous.kind === "student_summary"))) {
        const visible = await resolveVisibleStudents(context);
        const matching = visible.filter(s => s.displayName.toLocaleLowerCase() === body.trim().toLocaleLowerCase());
        if (matching.length === 1) plan = { ...previous, studentQuery: matching[0]!.displayName };
      }
    }

    const [run] = await tx
      .insert(agentRuns)
      .values({
        conversationId,
        personId: context.actorPersonId,
        intent: plan.intent,
        status: "planning",
        plan: plan as unknown as Record<string, unknown>,
      })
      .returning({ id: agentRuns.id });

    const finish = async (
      status: "completed" | "awaiting_approval" | "failed",
      result: Record<string, unknown>,
    ) => {
      await tx
        .update(agentRuns)
        .set({ status, result, updatedAt: new Date() })
        .where(eq(agentRuns.id, run!.id));
    };

    let reply: AgentMessage;

    if (plan.intent === "ask" && plan.kind === "help") {
      reply = await addMessage(tx, {
        conversationId,
        role: "agent",
        body: HELP_TEXT,
        agentRunId: run!.id,
      });
      await finish("completed", { kind: "help" });
    } else if (plan.intent === "ask" && plan.kind === "operations_overview") {
      const overview = await getSchoolOperationsCommandCenter({ ...context, role: "registrar" });
      const lines = [
        `There are ${overview.summary.sections} active sections, ${overview.summary.unstaffed} without instructors, ${overview.summary.underCapacity} with instructional capacity gaps, and ${overview.summary.waitlisted} waitlisted students.`,
        ...overview.issues.slice(0,10).map(issue=>`- ${issue.title}: ${issue.description}`),
      ];
      reply = await addMessage(tx,{conversationId,role:"agent",body:lines.join("\n"),
        agentRunId:run!.id});
      await finish("completed",{kind:"operations_overview"});
    } else if (plan.intent === "ask" && plan.kind === "student_summary") {
      const matches = await resolveVisibleStudents(context, plan.studentQuery);
      if (matches.length !== 1) {
        reply = await addMessage(tx, {
          conversationId,
          role: "agent",
          body:
            matches.length === 0
              ? studentNotFoundMessage(plan.studentQuery, (await resolveVisibleStudents(context)).length)
              : studentAmbiguousMessage(matches),
          agentRunId: run!.id,
        });
        await finish("completed", { kind: "clarification" });
      } else {
        const result = await getStudentAcademicSummary.execute(context, {
          studentProfileId: matches[0]!.studentProfileId,
        });
        reply = await addMessage(tx, {
          conversationId,
          role: "agent",
          body: result.summary,
          evidenceRefs: result.evidence,
          agentRunId: run!.id,
        });
        await finish("completed", result.data ?? {});
      }
    } else if (plan.intent === "watch") {
      const matches = await resolveVisibleStudents(context, plan.studentQuery);
      const visibleCount = (await resolveVisibleStudents(context)).length;
      if (matches.length !== 1) {
        reply = await addMessage(tx, {
          conversationId,
          role: "agent",
          body:
            matches.length === 0
              ? studentNotFoundMessage(plan.studentQuery, visibleCount)
              : studentAmbiguousMessage(matches),
          agentRunId: run!.id,
        });
        await finish("completed", { kind: "clarification" });
      } else {
        const student = matches[0]!;
        const args = {
          studentProfileId: student.studentProfileId,
          eventTypes: plan.eventTypes,
          ...(plan.remindAfterHours
            ? { remindAfterHours: plan.remindAfterHours }
            : {}),
          sourceConversationId: conversationId,
        };
        const preview: ActionPreview = {
          runId: run!.id,
          tool: createWatch.name,
          summary: `Watch ${student.displayName} for missing assignments${
            plan.remindAfterHours
              ? `, reminding you after ${plan.remindAfterHours} hours if unresolved`
              : ""
          }. Notifications arrive in CAN.`,
          args,
        };
        reply = await addMessage(tx, {
          conversationId,
          role: "agent",
          body: `I can set that up. Here's the monitoring rule I've prepared — confirm and I'll start watching.`,
          actionPreview: preview,
          agentRunId: run!.id,
        });
        await finish("awaiting_approval", { tool: createWatch.name, args });
      }
    } else if (plan.intent === "manage" && plan.action === "create_digest") {
      const matches = await resolveVisibleStudents(context, plan.studentQuery);
      if (matches.length !== 1) {
        reply = await addMessage(tx, {
          conversationId, role: "agent",
          body: matches.length ? studentAmbiguousMessage(matches)
            : studentNotFoundMessage(plan.studentQuery, 0),
          agentRunId: run!.id,
        });
        await finish("completed", { kind: "clarification" });
      } else {
        const student = matches[0]!;
        const args = {
          studentProfileId: student.studentProfileId,
          weekday: plan.weekday, hour: plan.hour,
          sourceConversationId: conversationId,
        };
        const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
        const preview: ActionPreview = {
          runId: run!.id, tool: createWeeklyDigest.name,
          summary: `Send a weekly progress digest for ${student.displayName} every ${days[plan.weekday]} at ${plan.hour}:00 in your notification timezone.`,
          args,
        };
        reply = await addMessage(tx, {
          conversationId, role: "agent",
          body: "I can schedule that weekly academic digest. Confirm the details below.",
          actionPreview: preview, agentRunId: run!.id,
        });
        await finish("awaiting_approval", { tool: createWeeklyDigest.name, args });
      }
    } else if (plan.intent === "manage" && plan.action === "list") {
      const result = await listWatches.execute(context, {});
      reply = await addMessage(tx, {
        conversationId,
        role: "agent",
        body: result.summary,
        evidenceRefs: result.evidence,
        agentRunId: run!.id,
      });
      await finish("completed", result.data ?? {});
    } else if (plan.intent === "manage") {
      // pause / resume / revoke: act on the subscriber's single matching watch,
      // otherwise defer to the Watching page for an explicit choice.
      const active = (await listWatches.execute(context, {})).evidence;
      if (active.length !== 1) {
        reply = await addMessage(tx, {
          conversationId,
          role: "agent",
          body:
            active.length === 0
              ? "There's no active watch to change."
              : "You have several watches. Open Things CAN Is Watching to change a specific one.",
          agentRunId: run!.id,
        });
        await finish("completed", { kind: "clarification" });
      } else {
        const args = { subscriptionId: active[0]!.id, status: plan.action === "resume" ? "active" : plan.action === "pause" ? "paused" : "revoked" };
        const preview: ActionPreview = {
          runId: run!.id,
          tool: setWatchStatus.name,
          summary: `${plan.action === "resume" ? "Resume" : plan.action === "pause" ? "Pause" : "Turn off"} the watch on ${active[0]!.label}.`,
          args,
        };
        reply = await addMessage(tx, {
          conversationId,
          role: "agent",
          body: "Just to confirm before I change anything:",
          actionPreview: preview,
          agentRunId: run!.id,
        });
        await finish("awaiting_approval", { tool: setWatchStatus.name, args });
      }
    } else {
      reply = await addMessage(tx, {
        conversationId,
        role: "agent",
        body: HELP_TEXT,
        agentRunId: run!.id,
      });
      await finish("completed", { kind: "help" });
    }

    await writeAudit(tx, context, {
      action: "agent.run",
      entityType: "agent_run",
      entityId: run!.id,
      after: { intent: plan.intent, conversationId },
    });

    await tx
      .update(conversations)
      .set({ lastActiveAt: new Date(), updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));

    const [finalRun] = await tx
      .select({ status: agentRuns.status })
      .from(agentRuns)
      .where(eq(agentRuns.id, run!.id))
      .limit(1);

    return {
      conversationId,
      runId: run!.id,
      runStatus: finalRun!.status,
      message: reply,
    };
  });
}

/**
 * Apply a human decision on a parked run. Only the run's owner can decide,
 * and only while it is still awaiting approval — navigating away without
 * approving never executes anything.
 */
export async function confirmRun(
  context: AgentContext,
  input: { runId: string; approve: boolean },
): Promise<TurnResult> {
  return db.transaction(async (tx) => {
    const [run] = await tx
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.id, input.runId))
      .limit(1)
      .for("update");

    if (!run || run.personId !== context.actorPersonId) {
      throw new AuthorizationError(`agent run: ${input.runId}`);
    }
    if (run.status !== "awaiting_approval") {
      throw new Error(`Agent run is not awaiting approval (status: ${run.status})`);
    }

    if (Date.now() - run.createdAt.getTime() > 10 * 60_000) {
      await tx.update(agentRuns).set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(agentRuns.id, run.id));
      const message = await addMessage(tx, {
        conversationId: run.conversationId, role: "agent",
        body: "This approval expired. Ask me again to prepare a fresh action.",
        agentRunId: run.id,
      });
      return { conversationId: run.conversationId, runId: run.id, runStatus: "cancelled", message };
    }

    if (!input.approve) {
      await tx
        .update(agentRuns)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(agentRuns.id, run.id));
      const message = await addMessage(tx, {
        conversationId: run.conversationId,
        role: "agent",
        body: "No problem — I won't set that up. Anything else?",
        agentRunId: run.id,
      });
      await writeAudit(tx, context, {
        action: "agent.run.cancel",
        entityType: "agent_run",
        entityId: run.id,
      });
      return {
        conversationId: run.conversationId,
        runId: run.id,
        runStatus: "cancelled",
        message,
      };
    }

    const toolName = String(run.result.tool ?? "");
    const args = (run.result.args ?? {}) as Record<string, unknown>;
    const tool = getAgentTool(toolName);
    if (!tool) throw new Error(`Unknown tool in approved run: ${toolName}`);

    const result = await tool.execute(context, args);

    await tx
      .update(agentRuns)
      .set({
        status: "completed",
        approvedAt: new Date(),
        result: { ...run.result, ...(result.data ?? {}) },
        updatedAt: new Date(),
      })
      .where(eq(agentRuns.id, run.id));

    const message = await addMessage(tx, {
      conversationId: run.conversationId,
      role: "agent",
      body: result.summary,
      evidenceRefs: result.evidence,
      agentRunId: run.id,
    });

    await writeAudit(tx, context, {
      action: "agent.run.approve",
      entityType: "agent_run",
      entityId: run.id,
      after: { tool: toolName },
    });

    return {
      conversationId: run.conversationId,
      runId: run.id,
      runStatus: "completed",
      message,
    };
  });
}

export async function listConversations(personId: string) {
  return db
    .select()
    .from(conversations)
    .where(eq(conversations.personId, personId))
    .orderBy(asc(conversations.lastActiveAt));
}

export async function getConversationMessages(
  personId: string,
  conversationId: string,
): Promise<AgentMessage[]> {
  const [conversation] = await db
    .select({ personId: conversations.personId })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  if (!conversation || conversation.personId !== personId) {
    throw new AuthorizationError(`conversation: ${conversationId}`);
  }

  const rows = await db
    .select()
    .from(conversationMessages)
    .where(eq(conversationMessages.conversationId, conversationId))
    .orderBy(asc(conversationMessages.createdAt));

  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    body: row.body,
    evidenceRefs: row.evidenceRefs,
    actionPreview: row.actionPreview,
    createdAt: row.createdAt,
  }));
}
