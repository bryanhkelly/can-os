import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { AuthorizationError } from "@/domain/command-context";
import {
  confirmRun,
  getConversationMessages,
  listConversations,
  sendMessage,
  type AgentContext,
} from "@/platform/agent";
import {
  listSubscriptionsForPerson,
  setSubscriptionStatus,
} from "@/platform/subscriptions";

/**
 * Ask CAN server boundary. The conversation endpoint requires an
 * authenticated session only — every role may talk to CAN. Authorization is
 * enforced inside each agent tool (capability + relationship), so the agent
 * never has privileges the person doesn't have.
 */
async function actor(): Promise<AgentContext> {
  const context = await getCommandContext(getRequest());
  if (!context.actorPersonId) throw new AuthorizationError("authenticated person");
  return { ...context, actorPersonId: context.actorPersonId };
}

export const sendAskCanMessage = createServerFn({ method: "POST" })
  .validator((value: unknown) =>
    z
      .object({
        conversationId: z.string().uuid().optional(),
        body: z.string().min(1).max(4000),
        workspaceContext: z.record(z.string(), z.string()).optional(),
      })
      .parse(value),
  )
  .handler(async ({ data }) => {
    const context = await actor();
    return sendMessage(context, data);
  });

export const confirmAskCanAction = createServerFn({ method: "POST" })
  .validator((value: unknown) =>
    z
      .object({ runId: z.string().uuid(), approve: z.boolean() })
      .parse(value),
  )
  .handler(async ({ data }) => {
    const context = await actor();
    return confirmRun(context, data);
  });

export const getAskCanConversation = createServerFn({ method: "GET" })
  .validator((value: unknown) =>
    z.object({ conversationId: z.string().uuid() }).parse(value),
  )
  .handler(async ({ data }) => {
    const context = await actor();
    return getConversationMessages(context.actorPersonId, data.conversationId);
  });

export const listAskCanConversations = createServerFn({ method: "GET" }).handler(
  async () => {
    const context = await actor();
    return listConversations(context.actorPersonId);
  },
);

/** "Things CAN Is Watching" — the subscriber's durable standing instructions. */
export const getMyWatches = createServerFn({ method: "GET" }).handler(async () => {
  const context = await actor();
  const rows = await listSubscriptionsForPerson(context.actorPersonId);
  // Project to a plain serializable DTO; internal filter payloads stay server-side.
  return rows.map((row) => ({
    id: row.id,
    eventTypes: row.eventTypes,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    reminderAfterHours: row.reminderPolicy.remindAfterHours ?? null,
    channel: row.channel,
    status: row.status,
    createdVia: row.createdVia,
    createdAt: row.createdAt.toISOString(),
  }));
});

export const updateWatchStatus = createServerFn({ method: "POST" })
  .validator((value: unknown) =>
    z
      .object({
        subscriptionId: z.string().uuid(),
        status: z.enum(["active", "paused", "revoked"]),
      })
      .parse(value),
  )
  .handler(async ({ data }) => {
    const context = await actor();
    const updated = await setSubscriptionStatus(
      data.subscriptionId,
      context.actorPersonId,
      data.status,
    );
    if (!updated) throw new AuthorizationError(`watch: ${data.subscriptionId}`);
    return { ok: true };
  });
