import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { churchContentSuggestions, churchSourceReferences } from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import {
  initialChurchReferenceState, normalizeChurchReferenceUrl,
  type ChurchReferenceKind,
} from "@/domain/church-source-references";
import { emitEvent, writeAudit } from "@/platform/mutation";
import { requirePartnerWebsiteEditor } from "./site-website-authorization.server";
import { siteWebsiteLocalPublishCapability } from "@/domain/site-publication-policy";

/**
 * Only scoped church website editors can read these references.
 * They are never joined into public Site DTOs, and saving does not crawl URLs.
 */
export async function readChurchSourceReferences(actor: AccessContext) {
  const site = await requirePartnerWebsiteEditor(actor);
  return db.select().from(churchSourceReferences)
    .where(and(eq(churchSourceReferences.siteId, site.id), isNull(churchSourceReferences.revokedAt)))
    .orderBy(asc(churchSourceReferences.kind));
}

export async function saveChurchSourceReference(actor: AccessContext, input: {
  kind: ChurchReferenceKind;
  url: string;
  authorizedToSubmit: boolean;
}) {
  if (input.authorizedToSubmit !== true) {
    throw new Error("Confirm that you are authorized to provide this church's public reference");
  }
  const normalizedUrl = normalizeChurchReferenceUrl(input.kind, input.url);
  return db.transaction(async tx => {
    const site = await requirePartnerWebsiteEditor(actor, tx, siteWebsiteLocalPublishCapability);
    // Serialize replacement and audit against the same Site record.
    const [before] = await tx.select().from(churchSourceReferences)
      .where(and(eq(churchSourceReferences.siteId, site.id),
        eq(churchSourceReferences.kind, input.kind))).for("update").limit(1);
    if (before?.normalizedUrl === normalizedUrl && !before.revokedAt) return { changed: false };
    // A changed URL invalidates its old extraction state. Extraction is
    // deliberately unsupported until a separately audited egress service exists.
    const state = initialChurchReferenceState(input.kind);
    const [saved] = await tx.insert(churchSourceReferences).values({
      siteId: site.id, kind: input.kind, normalizedUrl,
      referenceState: state, addedByPersonId: actor.actorPersonId!,
    }).onConflictDoUpdate({
      target: [churchSourceReferences.siteId, churchSourceReferences.kind],
      set: { normalizedUrl, referenceState: state,
        addedByPersonId: actor.actorPersonId!, lastAttemptAt: null, revokedAt: null,
        updatedAt: new Date() },
    }).returning({ id: churchSourceReferences.id });
    if (!saved) throw new Error("Unable to save this church reference");
    if (before && before.normalizedUrl !== normalizedUrl) {
      // Pending proposals are stale as soon as their source identity changes.
      await tx.update(churchContentSuggestions).set({
        reviewDecision: "discarded", reviewedAt: new Date(),
        reviewedByPersonId: actor.actorPersonId!,
      }).where(and(eq(churchContentSuggestions.siteId, site.id),
        eq(churchContentSuggestions.sourceReferenceId, before.id),
        eq(churchContentSuggestions.reviewDecision, "pending")));
    }
    await writeAudit(tx, actor, {
      action: "site.website.source_reference.saved",
      entityType: "church_source_reference", entityId: saved.id,
      scope: { organizationId: site.organizationId, siteId: site.id },
      before: before ? { kind: before.kind, url: before.normalizedUrl } : null,
      after: { kind: input.kind, url: normalizedUrl, state },
    });
    await emitEvent(tx, {
      eventType: "ChurchSourceReferenceSaved",
      aggregateType: "church_source_reference", aggregateId: saved.id,
      actorPersonId: actor.actorPersonId,
      organizationId: site.organizationId, siteId: site.id,
      payload: { kind: input.kind },
    });
    return { changed: true };
  });
}

export async function removeChurchSourceReference(actor: AccessContext, input: {
  kind: ChurchReferenceKind;
}) {
  return db.transaction(async tx => {
    const site = await requirePartnerWebsiteEditor(actor, tx, siteWebsiteLocalPublishCapability);
    const [existing] = await tx.select().from(churchSourceReferences)
      .where(and(eq(churchSourceReferences.siteId, site.id),
        eq(churchSourceReferences.kind, input.kind))).for("update").limit(1);
    if (!existing) return { changed: false };
    if (existing.revokedAt) return { changed: false };
    await tx.update(churchSourceReferences).set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(eq(churchSourceReferences.id, existing.id));
    // Re-adding a revoked URL must not resurrect old pending proposals.
    await tx.update(churchContentSuggestions).set({
      reviewDecision: "discarded", reviewedAt: new Date(),
      reviewedByPersonId: actor.actorPersonId!,
    }).where(and(eq(churchContentSuggestions.siteId, site.id),
      eq(churchContentSuggestions.sourceReferenceId, existing.id),
      eq(churchContentSuggestions.reviewDecision, "pending")));
    await writeAudit(tx, actor, {
      action: "site.website.source_reference.removed",
      entityType: "church_source_reference", entityId: existing.id,
      scope: { organizationId: site.organizationId, siteId: site.id },
      before: { kind: existing.kind, url: existing.normalizedUrl }, after: null,
    });
    await emitEvent(tx, {
      eventType: "ChurchSourceReferenceRemoved",
      aggregateType: "church_source_reference", aggregateId: existing.id,
      actorPersonId: actor.actorPersonId,
      organizationId: site.organizationId, siteId: site.id,
      payload: { kind: existing.kind },
    });
    return { changed: true };
  });
}
