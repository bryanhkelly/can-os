import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { churchContentSuggestions, churchSourceReferences } from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import {
  type ChurchSuggestionField, normalizeChurchReferenceUrl,
} from "@/domain/church-source-references";
import { emptySiteLocalContent, siteLocalContentLimits, type SiteLocalTextField } from "@/domain/site-local-content";
import { emitEvent, writeAudit } from "@/platform/mutation";
import { requirePartnerWebsiteEditor } from "./site-website-authorization.server";
import { siteWebsiteLocalPublishCapability } from "@/domain/site-publication-policy";
import { publishPartnerLocalContent, readLocalContentHistory } from "./site-local-content.server";

/**
 * These are USER-SUBMITTED excerpts, not fetched or AI-generated claims.
 * The source must be an active church website reference; no untrusted URL is fetched.
 * Branding is deliberately excluded from text imports.
 */
export const suggestionTargetFields: Partial<Record<ChurchSuggestionField, SiteLocalTextField>> = {
  church_history: "churchHistory",
  church_mission: "localDescription",
  church_vision: "localDescription",
  denomination: "denomination",
  local_community: "communityOutreach",
  leadership_intro: "leadershipWelcome",
  ministries: "localTraditions",
  welcome_message: "welcomeMessage",
  faith_and_values: "statementOfFaith",
};

export async function readChurchContentSuggestions(actor: AccessContext) {
  const site = await requirePartnerWebsiteEditor(actor);
  return db.select({
    id: churchContentSuggestions.id,
    field: churchContentSuggestions.field,
    proposedText: churchContentSuggestions.proposedText,
    sourcePageUrl: churchContentSuggestions.sourcePageUrl,
    retrievedAt: churchContentSuggestions.retrievedAt,
    confidence: churchContentSuggestions.confidence,
    reviewDecision: churchContentSuggestions.reviewDecision,
    sourceReferenceId: churchContentSuggestions.sourceReferenceId,
    sourceUrl: churchSourceReferences.normalizedUrl,
  }).from(churchContentSuggestions)
    .innerJoin(churchSourceReferences,
      eq(churchSourceReferences.id, churchContentSuggestions.sourceReferenceId))
    .where(and(eq(churchContentSuggestions.siteId, site.id),
      eq(churchSourceReferences.siteId, site.id), isNull(churchSourceReferences.revokedAt)))
    .orderBy(desc(churchContentSuggestions.createdAt)).limit(50);
}

export async function submitChurchSourceExcerpt(actor: AccessContext, input: {
  sourceReferenceId: string; field: ChurchSuggestionField;
  text: string; sourcePageUrl: string;
}) {
  const target = suggestionTargetFields[input.field];
  if (!target) throw new Error("This suggestion field needs manual branding review");
  const proposedText = input.text.trim();
  if (!proposedText || proposedText.length > siteLocalContentLimits[target] ||
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(proposedText)) {
    throw new Error("The proposed church text is empty, too long or contains control characters");
  }
  const normalizedUrl = normalizeChurchReferenceUrl("website", input.sourcePageUrl);
  return db.transaction(async tx => {
    const site = await requirePartnerWebsiteEditor(actor, tx, siteWebsiteLocalPublishCapability);
    const [reference] = await tx.select().from(churchSourceReferences)
      .where(and(eq(churchSourceReferences.id, input.sourceReferenceId),
        eq(churchSourceReferences.siteId, site.id), eq(churchSourceReferences.kind, "website"),
        isNull(churchSourceReferences.revokedAt))).limit(1);
    if (!reference || new URL(normalizedUrl).origin !== new URL(reference.normalizedUrl).origin) {
      throw new Error("Choose a page from your saved church website");
    }
    const [created] = await tx.insert(churchContentSuggestions).values({
      siteId: site.id, sourceReferenceId: reference.id,
      field: input.field, proposedText, sourcePageUrl: normalizedUrl,
      retrievedAt: new Date(), confidence: "low",
      reviewDecision: "pending", createdByPersonId: actor.actorPersonId!,
    }).returning({ id: churchContentSuggestions.id });
    if (!created) throw new Error("Unable to save this source excerpt");
    await writeAudit(tx, actor, {
      action: "site.website.source_excerpt.submitted",
      entityType: "church_content_suggestion", entityId: created.id,
      scope: { organizationId: site.organizationId, siteId: site.id },
      after: { field: input.field, sourceReferenceId: reference.id },
    });
    await emitEvent(tx, {
      eventType: "ChurchContentSuggestionSubmitted",
      aggregateType: "church_content_suggestion", aggregateId: created.id,
      actorPersonId: actor.actorPersonId, organizationId: site.organizationId,
      siteId: site.id, payload: { field: input.field },
    });
    return { id: created.id };
  });
}

/**
 * Publication MUST pass through the same canonical versioned editor command.
 * The follow-up decision write is separate; if it fails, publication state is
 * canonical and the proposal remains pending for reconciliation.
 */
export async function reviewChurchSourceExcerpt(actor: AccessContext, input: {
  suggestionId: string; decision: "accepted"|"edited"|"discarded";
  editedText?: string; expectedRevision?: number;
}) {
  const site = await requirePartnerWebsiteEditor(actor, db, siteWebsiteLocalPublishCapability);
  const [proposal] = await db.select({
    id: churchContentSuggestions.id, siteId: churchContentSuggestions.siteId,
    field: churchContentSuggestions.field, proposedText: churchContentSuggestions.proposedText,
    decision: churchContentSuggestions.reviewDecision,
    sourceReferenceId: churchContentSuggestions.sourceReferenceId,
    revokedAt: churchSourceReferences.revokedAt,
  }).from(churchContentSuggestions).innerJoin(churchSourceReferences,
    eq(churchSourceReferences.id, churchContentSuggestions.sourceReferenceId))
    .where(and(eq(churchContentSuggestions.id, input.suggestionId),
      eq(churchContentSuggestions.siteId, site.id),
      eq(churchSourceReferences.siteId, site.id))).limit(1);
  if (!proposal || proposal.revokedAt || proposal.decision !== "pending") {
    throw new Error("Suggestion is not pending or its source is no longer active");
  }
  let publication: Awaited<ReturnType<typeof publishPartnerLocalContent>> | null = null;
  if (input.decision !== "discarded") {
    const target = suggestionTargetFields[proposal.field];
    if (!target) throw new Error("This suggestion needs a manual branding review");
    if (input.expectedRevision === undefined || !Number.isSafeInteger(input.expectedRevision)) {
      throw new Error("Current website revision is required");
    }
    const revisedText = input.decision === "edited" ? input.editedText?.trim() : proposal.proposedText;
    if (!revisedText || revisedText.length > siteLocalContentLimits[target]) {
      throw new Error("Suggestion is empty or exceeds the field limit");
    }
    const history = await readLocalContentHistory(site.id);
    if ((history[0]?.revision ?? 0) !== input.expectedRevision) {
      throw new Error("Website content changed. Refresh and review the new version first.");
    }
    const current = history[0]?.content ?? emptySiteLocalContent;
    // The canonical write checks revision again inside its Site transaction,
    // and screens the complete merged content for protected claims/markup.
    publication = await publishPartnerLocalContent(actor, {
      operation: "save", expectedRevision: input.expectedRevision,
      content: { ...current, [target]: revisedText },
    });
  }
  await db.transaction(async tx => {
    const checked = await requirePartnerWebsiteEditor(actor, tx, siteWebsiteLocalPublishCapability);
    const [pending] = await tx.select().from(churchContentSuggestions)
      .where(and(eq(churchContentSuggestions.id, input.suggestionId),
        eq(churchContentSuggestions.siteId, checked.id))).for("update").limit(1);
    const [activeSource] = await tx.select({ revokedAt: churchSourceReferences.revokedAt })
      .from(churchSourceReferences)
      .where(and(eq(churchSourceReferences.id, proposal.sourceReferenceId),
        eq(churchSourceReferences.siteId, checked.id))).limit(1);
    if (!pending || pending.reviewDecision !== "pending" || !activeSource || activeSource.revokedAt) {
      throw new Error("Suggestion was reviewed or its source was removed; refresh");
    }
    await tx.update(churchContentSuggestions).set({
      reviewDecision: input.decision, reviewedAt: new Date(),
      reviewedByPersonId: actor.actorPersonId!,
    }).where(eq(churchContentSuggestions.id, pending.id));
    await writeAudit(tx, actor, {
      action: "site.website.source_excerpt.reviewed",
      entityType: "church_content_suggestion", entityId: pending.id,
      scope: { organizationId: checked.organizationId, siteId: checked.id },
      before: { decision: "pending" },
      after: { decision: input.decision, publicationRevision: publication?.revision ?? null,
        publicationStatus: publication?.status ?? null },
    });
    await emitEvent(tx, {
      eventType: "ChurchContentSuggestionReviewed",
      aggregateType: "church_content_suggestion", aggregateId: pending.id,
      actorPersonId: actor.actorPersonId, organizationId: checked.organizationId,
      siteId: checked.id, payload: { decision: input.decision },
    });
  });
  return { decision: input.decision, publication };
}
