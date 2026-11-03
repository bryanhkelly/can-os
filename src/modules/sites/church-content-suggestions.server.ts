import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { churchContentSuggestions, churchSourceReferences } from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import {
  type ChurchSuggestionField, normalizeChurchReferenceUrl, churchSuggestionTargetFields,
} from "@/domain/church-source-references";
import { siteLocalContentLimits, type SiteLocalContent, type SiteLocalTextField } from "@/domain/site-local-content";
import { emitEvent, writeAudit } from "@/platform/mutation";
import { EventTypes } from "@/domain/event-types";
import { requirePartnerWebsiteEditor } from "./site-website-authorization.server";
import { siteWebsiteLocalPublishCapability } from "@/domain/site-publication-policy";
import { publishPartnerLocalContent, readLocalContentHistory, readCurrentLocalContent } from "./site-local-content.server";
import { extractChurchPublicWebsite } from "./church-public-web-fetch.server";

/**
 * User-submitted or boundedly fetched public church excerpts, never verified
 * institutional claims. Source identity and review are required for publication.
 */
const suggestionTargetFields = churchSuggestionTargetFields;

/** Only church-owned text reaches the comparison UI; no image payloads or branding. */
function reviewableChurchText(content?: SiteLocalContent): Partial<Record<SiteLocalTextField, string>> {
  const result: Partial<Record<SiteLocalTextField, string>> = {};
  for (const field of Object.values(churchSuggestionTargetFields)) {
    if (field) result[field] = content?.[field] ?? "";
  }
  return result;
}

/** Latest editor revision and last published church copy are intentionally distinct. */
export async function readChurchSourceReviewContext(actor: AccessContext) {
  const site = await requirePartnerWebsiteEditor(actor);
  const [history, published] = await Promise.all([
    readLocalContentHistory(site.id), readCurrentLocalContent(site.id),
  ]);
  return {
    revision: history[0]?.revision ?? 0,
    editorStatus: history[0]?.status ?? null,
    editorContent: reviewableChurchText(history[0]?.content),
    publishedContent: reviewableChurchText(published?.content),
    publishedRevision: published?.revision ?? 0,
  };
}

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
      eq(churchSourceReferences.siteId, site.id), isNull(churchSourceReferences.revokedAt),
      eq(churchContentSuggestions.reviewDecision, "pending")))
    .orderBy(desc(churchContentSuggestions.createdAt)).limit(200);
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
      eventType: EventTypes.ChurchContentSuggestionSubmitted,
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
      eventType: EventTypes.ChurchContentSuggestionReviewed,
      aggregateType: "church_content_suggestion", aggregateId: pending.id,
      actorPersonId: actor.actorPersonId, organizationId: checked.organizationId,
      siteId: checked.id, payload: { decision: input.decision },
    });
  });
  return { decision: input.decision, publication };
}


/**
 * Explicit, rate-limited website-only refresh. This is opt-in and defaults
 * disabled until secure egress and per-tenant acceptance are independently
 * verified by the integration owner. No social APIs or auto-publication.
 */
export async function refreshChurchWebsiteSuggestions(actor: AccessContext) {
  if (process.env.CAN_CHURCH_WEBSITE_DISCOVERY_ENABLED !== "true") {
    return { status: "unsupported" as const, count: 0,
      message: "Website extraction is not enabled. You can submit attributed summaries manually." };
  }
  const input = await db.transaction(async tx => {
    const site = await requirePartnerWebsiteEditor(actor, tx, siteWebsiteLocalPublishCapability);
    const [reference] = await tx.select().from(churchSourceReferences)
      .where(and(eq(churchSourceReferences.siteId, site.id),
        eq(churchSourceReferences.kind, "website"),
        isNull(churchSourceReferences.revokedAt))).for("update").limit(1);
    if (!reference) throw new Error("Save a church website reference before requesting suggestions");
    const [pendingReview] = await tx.select({ id: churchContentSuggestions.id })
      .from(churchContentSuggestions).where(and(
        eq(churchContentSuggestions.siteId, site.id),
        eq(churchContentSuggestions.sourceReferenceId, reference.id),
        eq(churchContentSuggestions.reviewDecision, "pending"),
      )).limit(1);
    if (pendingReview) return { status: "review_pending" as const };
    if (reference.lastAttemptAt &&
        Date.now() - reference.lastAttemptAt.getTime() < 30 * 60 * 1000) {
      return null;
    }
    const attemptAt = new Date();
    await tx.update(churchSourceReferences).set({ lastAttemptAt: attemptAt })
      .where(eq(churchSourceReferences.id, reference.id));
    await writeAudit(tx, actor, {
      action: "site.website.source_refresh.requested",
      entityType: "church_source_reference", entityId: reference.id,
      scope: { siteId: site.id, organizationId: site.organizationId },
      after: { kind: "website" },
    });
    return { site, reference, attemptAt };
  });
  if (!input) return { status: "throttled" as const, count: 0,
    message: "This website was checked recently. Try again later." };
  if ("status" in input) return { status: "review_pending" as const, count: 0,
    message: "Review or discard the existing church suggestions before requesting a new website check." };
  const { site, reference, attemptAt } = input;
  let pages: Awaited<ReturnType<typeof extractChurchPublicWebsite>>;
  try {
    pages = await extractChurchPublicWebsite(reference.normalizedUrl);
  } catch (error) {
    const blocked = error instanceof Error && /robots|DNS|Cross-origin/.test(error.message);
    await db.transaction(async tx => {
      const checked = await requirePartnerWebsiteEditor(actor, tx, siteWebsiteLocalPublishCapability);
      const [current] = await tx.select().from(churchSourceReferences)
        .where(and(eq(churchSourceReferences.id, reference.id),
          eq(churchSourceReferences.siteId, checked.id))).for("update").limit(1);
      if (current && !current.revokedAt && current.normalizedUrl === reference.normalizedUrl &&
          current.lastAttemptAt?.getTime() === attemptAt.getTime()) {
        await tx.update(churchSourceReferences).set({
          referenceState: blocked ? "blocked" : "failed", updatedAt: new Date(),
        }).where(eq(churchSourceReferences.id, reference.id));
        await writeAudit(tx, actor, {
          action: "site.website.source_refresh.failed",
          entityType: "church_source_reference", entityId: reference.id,
          scope: { organizationId: checked.organizationId, siteId: checked.id },
          after: { blocked },
        });
      }
    });
    return { status: blocked ? "blocked" as const : "failed" as const, count: 0,
      message: "The website could not be read safely. Use the manual church-story editor instead." };
  }
  return db.transaction(async tx => {
    const checked = await requirePartnerWebsiteEditor(actor, tx, siteWebsiteLocalPublishCapability);
    const [current] = await tx.select().from(churchSourceReferences)
      .where(and(eq(churchSourceReferences.id, reference.id),
        eq(churchSourceReferences.siteId, checked.id))).for("update").limit(1);
    if (!current || current.revokedAt || current.normalizedUrl !== reference.normalizedUrl ||
        current.lastAttemptAt?.getTime() !== attemptAt.getTime()) {
      return { status: "stale" as const, count: 0,
        message: "Church website link changed during retrieval. No suggestions were saved." };
    }
    // An editor may have submitted a proposal while the HTTP fetch ran.
    // Never discard unsaved editorial work merely because a refresh completed.
    const [pendingReview] = await tx.select({ id: churchContentSuggestions.id })
      .from(churchContentSuggestions).where(and(
        eq(churchContentSuggestions.siteId, checked.id),
        eq(churchContentSuggestions.sourceReferenceId, reference.id),
        eq(churchContentSuggestions.reviewDecision, "pending"),
      )).limit(1);
    if (pendingReview) return { status: "review_pending" as const, count: 0,
      message: "New suggestions were saved while this website check was running. Review them before retrying." };
    const values = pages.flatMap(page => {
      const target = suggestionTargetFields[page.sourceField];
      if (!target) return [];
      const proposedText = page.pageText.slice(0, siteLocalContentLimits[target]).trim();
      return proposedText ? [{
        siteId: checked.id,
        sourceReferenceId: reference.id,
        field: page.sourceField,
        proposedText,
        sourcePageUrl: page.pageUrl,
        retrievedAt: new Date(),
        confidence: "low" as const,
        reviewDecision: "pending" as const,
        createdByPersonId: actor.actorPersonId!,
      }] : [];
    });
    if (!values.length) return { status: "failed" as const, count: 0,
      message: "No appropriate church story text was found." };
    await tx.insert(churchContentSuggestions).values(values);
    await tx.update(churchSourceReferences).set({
      referenceState: "fetchable", updatedAt: new Date(),
    }).where(eq(churchSourceReferences.id, reference.id));
    await writeAudit(tx, actor, {
      action: "site.website.source_refresh.completed",
      entityType: "church_source_reference", entityId: reference.id,
      scope: { organizationId: checked.organizationId, siteId: checked.id },
      after: { count: values.length },
    });
    await emitEvent(tx, {
      eventType: EventTypes.ChurchWebsiteSuggestionsRetrieved,
      aggregateType: "church_source_reference", aggregateId: reference.id,
      actorPersonId: actor.actorPersonId,
      organizationId: checked.organizationId, siteId: checked.id,
      payload: { count: values.length },
    });
    return { status: "ready" as const, count: values.length,
      message: "Public church website excerpts are ready for individual review. Nothing was published." };
  });
}
