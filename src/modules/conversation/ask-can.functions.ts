import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { subscriptionDeliveries, subscriptions } from "@/db/schema";
import { beginSmsVerification, confirmSmsVerification, revokeSmsConsent, updateQuietHours, getNotificationPreferences } from "@/platform/subscriptions/preferences";
import { writeAudit } from "@/platform/mutation";
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
    repeatEveryHours: row.reminderPolicy.repeatEveryHours ?? null,
    maxReminders: row.reminderPolicy.maxReminders ?? 1,
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

/** Read the signed-in subscriber's bounded delivery history. */
export const getMyWatchDeliveries = createServerFn({ method: "GET" })
  .validator((value: unknown) =>
    z.object({ subscriptionId: z.string().uuid() }).parse(value))
  .handler(async ({ data }) => {
    const context = await actor();
    const rows = await db.select({
      id: subscriptionDeliveries.id,
      kind: subscriptionDeliveries.kind,
      channel: subscriptionDeliveries.channel,
      status: subscriptionDeliveries.status,
      attempts: subscriptionDeliveries.attempts,
      lastError: subscriptionDeliveries.lastError,
      createdAt: subscriptionDeliveries.createdAt,
      deliveredAt: subscriptionDeliveries.deliveredAt,
    }).from(subscriptionDeliveries)
      .innerJoin(subscriptions, eq(subscriptions.id, subscriptionDeliveries.subscriptionId))
      .where(and(
        eq(subscriptions.id, data.subscriptionId),
        eq(subscriptions.subscriberPersonId, context.actorPersonId),
      ))
      .orderBy(desc(subscriptionDeliveries.createdAt)).limit(50);
    return rows.map(row => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      deliveredAt: row.deliveredAt?.toISOString() ?? null,
    }));
  });

/** A subscriber can manage delivery options, but cannot change watched subjects. */
export const updateWatchOptions = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    subscriptionId: z.string().uuid(),
    channel: z.enum(["in_app", "email", "sms"]),
    remindAfterHours: z.number().int().min(1).max(720).nullable(),
    repeatEveryHours: z.number().int().min(1).max(720).nullable(),
    maxReminders: z.number().int().min(1).max(30),
  }).parse(value))
  .handler(async ({ data }) => {
    const context = await actor();
    const reminderPolicy = data.remindAfterHours === null ? {} : {
      remindAfterHours: data.remindAfterHours,
      ...(data.repeatEveryHours === null ? {} : { repeatEveryHours: data.repeatEveryHours }),
      maxReminders: data.maxReminders,
    };
    await db.transaction(async (tx) => {
      const result = await tx.update(subscriptions).set({
        channel: data.channel,
        reminderPolicy,
        updatedAt: new Date(),
      }).where(and(eq(subscriptions.id, data.subscriptionId),
        eq(subscriptions.subscriberPersonId, context.actorPersonId),
        eq(subscriptions.status, "active")))
        .returning({ id: subscriptions.id });
      if (!result.length) throw new AuthorizationError("active watch");
      await writeAudit(tx, context, {
        action: "subscription.options_updated",
        entityType: "subscription",
        entityId: data.subscriptionId,
        after: { channel: data.channel, reminderPolicy },
      });
    });
    return { ok: true };
  });

export const getMyNotificationPreferences = createServerFn({ method: "GET" }).handler(async () => {
  const context = await actor();
  const prefs = await getNotificationPreferences(context.actorPersonId);
  return {
    timezone: prefs?.timezone ?? "UTC",
    quietStart: prefs?.quietStart ?? null,
    quietEnd: prefs?.quietEnd ?? null,
    smsOptedIn: prefs?.smsOptedIn ?? false,
    smsVerifiedPhone: prefs?.smsVerifiedPhone ?? null,
  };
});

export const saveMyQuietHours = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    timezone: z.string().min(1).max(80),
    quietStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
    quietEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  }).parse(value))
  .handler(async ({ data }) => {
    const context = await actor();
    await updateQuietHours(context.actorPersonId, data.timezone, data.quietStart, data.quietEnd);
    return { ok: true };
  });

export const requestMySmsVerification = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({ phone: z.string().regex(/^\+[1-9]\d{7,14}$/) }).parse(value))
  .handler(async ({ data }) => {
    const context = await actor();
    await beginSmsVerification(context.actorPersonId, data.phone, context.scope.organizationIds ?? []);
    return { ok: true };
  });

export const verifyMySmsConsent = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    phone: z.string().regex(/^\+[1-9]\d{7,14}$/),
    code: z.string().regex(/^\d{4,10}$/),
    consent: z.literal(true),
  }).parse(value))
  .handler(async ({ data }) => {
    const context = await actor();
    await confirmSmsVerification(context.actorPersonId, data.phone, data.code, context.scope.organizationIds ?? []);
    return { ok: true };
  });

export const disableMySms = createServerFn({ method: "POST" }).handler(async () => {
  const context = await actor();
  await revokeSmsConsent(context.actorPersonId);
  return { ok: true };
});
