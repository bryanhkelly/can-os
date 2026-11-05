import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, eq, sql } from "drizzle-orm";
import { assertLaunchDraftAudience, launchDraftSelectionSchema, launchDraftValueSchema, saveLaunchDraftSchema } from "@/domain/launch-draft";
import { DomainError } from "@/domain/errors";
import { EventTypes } from "@/domain/event-types";
import { emitEvent, writeAudit } from "@/platform/mutation";
import { personDisplayName } from "@/domain/person-name";

export const getStaffLaunchWorkspace = createServerFn({ method: "GET" }).handler(async () => {
  const [{ db }, { people }, { getCommandContext }] = await Promise.all([
    import("@/db/client"), import("@/db/schema"), import("@/modules/identity/command-context.server"),
  ]);
  setResponseHeader("Cache-Control", "private, no-store");
  const actor = await getCommandContext(getRequest());
  assertLaunchDraftAudience(actor, "staff");
  const [person] = await db.select({ legalFirstName: people.legalFirstName, legalLastName: people.legalLastName,
    preferredName: people.preferredName }).from(people).where(and(eq(people.id, actor.actorPersonId!),
    eq(people.active, true))).limit(1);
  if (!person) throw new DomainError("FORBIDDEN", "Active staff identity required");
  return { name: personDisplayName(person), role: actor.role,
    canSubmitQualifications: actor.capabilities.has("profiles.credentials.submit") };
});

export const getLaunchStudioDraft = createServerFn({ method: "GET" })
  .validator((input: unknown) => launchDraftSelectionSchema.parse(input))
  .handler(async ({ data }) => {
    const [{ db }, { launchStudioDrafts }, { getCommandContext }] = await Promise.all([
      import("@/db/client"), import("@/db/schema"), import("@/modules/identity/command-context.server"),
    ]);
    setResponseHeader("Cache-Control", "private, no-store");
    const actor = await getCommandContext(getRequest());
    assertLaunchDraftAudience(actor, data.audience);
    const [draft] = await db.select().from(launchStudioDrafts).where(and(
      eq(launchStudioDrafts.accountId, actor.accountId), eq(launchStudioDrafts.grantId, actor.grantId),
      eq(launchStudioDrafts.audience, data.audience), eq(launchStudioDrafts.context, data.context),
    )).limit(1);
    return draft ? { value: launchDraftValueSchema.parse(draft.value),
      revision: draft.revision, savedAt: draft.updatedAt.toISOString() } : null;
  });

export const saveLaunchStudioDraft = createServerFn({ method: "POST" })
  .validator((input: unknown) => saveLaunchDraftSchema.parse(input))
  .handler(async ({ data }) => {
    const [{ db }, { launchStudioDrafts }, { getCommandContext }] = await Promise.all([
      import("@/db/client"), import("@/db/schema"), import("@/modules/identity/command-context.server"),
    ]);
    const actor = await getCommandContext(getRequest());
    assertLaunchDraftAudience(actor, data.audience);
    return db.transaction(async tx => {
      // These are private form buffers, not authority to read or mutate a URL's resource.
      // Canonical commands revalidate every selected identity, relationship and consent.
      const owner = and(eq(launchStudioDrafts.accountId, actor.accountId),
        eq(launchStudioDrafts.grantId, actor.grantId), eq(launchStudioDrafts.audience, data.audience),
        eq(launchStudioDrafts.context, data.context));
      const [saved] = data.expectedRevision === 0
        ? await tx.insert(launchStudioDrafts).values({
          accountId: actor.accountId, grantId: actor.grantId, audience: data.audience,
          context: data.context, value: data.value,
        }).onConflictDoNothing().returning()
        : await tx.update(launchStudioDrafts).set({
          value: data.value, revision: sql`${launchStudioDrafts.revision} + 1`, updatedAt: new Date(),
        }).where(and(owner, eq(launchStudioDrafts.revision, data.expectedRevision))).returning();
      if (!saved) throw new DomainError("CONFLICT", "Launch draft changed in another tab");
      await writeAudit(tx, actor, { action: "launch.draft.save", entityType: "launch_draft",
        entityId: saved.id, after: { audience: data.audience, revision: saved.revision } });
      await emitEvent(tx, { eventType: EventTypes.LaunchDraftSaved, aggregateType: "launch_draft",
        aggregateId: saved.id, actorPersonId: actor.actorPersonId,
        payload: { audience: data.audience, revision: saved.revision } });
      return { revision: saved.revision, savedAt: saved.updatedAt.toISOString() };
    });
  });
