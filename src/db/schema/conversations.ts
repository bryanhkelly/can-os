import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./common";
import {
  agentRunIntent,
  agentRunStatus,
  conversationRole,
  conversationStatus,
} from "./enums";
import { people } from "./identity";

/**
 * Ask CAN conversation store. Durable, server-side threads replace the
 * prototype's localStorage history. A conversation belongs to exactly one
 * person and carries the workspace context it was started in.
 */
export const conversations = pgTable(
  "conversations",
  {
    id: id(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    /** Workspace context: organization/site/program/section/student ids. */
    workspaceContext: jsonb("workspace_context")
      .$type<Record<string, string>>()
      .default({})
      .notNull(),
    status: conversationStatus("status").default("active").notNull(),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("conversation_person_idx").on(table.personId, table.lastActiveAt),
  ],
);

export type EvidenceRef = {
  type: string;
  id: string;
  label: string;
};

/** JSON-serializable value; required at the server-function boundary. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type ActionPreview = {
  runId: string;
  tool: string;
  summary: string;
  args: Record<string, JsonValue>;
};

export const conversationMessages = pgTable(
  "conversation_messages",
  {
    id: id(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: conversationRole("role").notNull(),
    body: text("body").notNull(),
    /** Verifiable canonical-record links backing an agent answer. */
    evidenceRefs: jsonb("evidence_refs")
      .$type<EvidenceRef[]>()
      .default([])
      .notNull(),
    /** Pending human approval card; execution waits for confirmation. */
    actionPreview: jsonb("action_preview").$type<ActionPreview | null>(),
    agentRunId: uuid("agent_run_id"),
    createdAt: createdAt(),
  },
  (table) => [
    index("conversation_message_thread_idx").on(
      table.conversationId,
      table.createdAt,
    ),
  ],
);

/**
 * One agent turn: intent classification, plan, approval state, and execution
 * outcome. Every run is auditable and belongs to the asking person.
 */
export const agentRuns = pgTable(
  "agent_runs",
  {
    id: id(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    intent: agentRunIntent("intent").notNull(),
    status: agentRunStatus("status").default("planning").notNull(),
    /** Planned tool call: { tool, args }. */
    plan: jsonb("plan").$type<Record<string, unknown>>().default({}).notNull(),
    /** Execution outcome: tool result summary, created record ids. */
    result: jsonb("result").$type<Record<string, unknown>>().default({}).notNull(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("agent_run_conversation_idx").on(table.conversationId, table.createdAt),
    index("agent_run_person_idx").on(table.personId, table.status),
  ],
);
