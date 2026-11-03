import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db } from "@/db/client";
import { auditEvents, churchContentSuggestions, churchSourceReferences, sitePublications } from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import {
  type ChurchSuggestionField, normalizeChurchReferenceUrl, churchSuggestionTargetFields,
  assertChurchProposalSourceIdentity,
} from "@/domain/church-source-references";
import { emptySiteLocalContent, siteLocalContentLimits, type SiteLocalContent, type SiteLocalTextField } from "@/domain/site-local-content";
import { emitEvent, writeAudit } from "@/platform/mutation";
import { EventTypes } from "@/domain/event-types";
import { requirePartnerWebsiteEditor } from "./site-website-authorization.server";
import { siteWebsiteLocalPublishCapability } from "@/domain/site-publication-policy";
import { publishPartnerLocalContentWithinTransaction, readLocalContentHistory, readCurrentLocalContent } from "./site-local-content.server";
import { extractChurchPublicWebsite } from "./church-public-web-fetch.server";
import { deriveChurchBrandProposal } from "@/domain/church-brand-suggestions";
import { assertChurchSourceEditorialCopy } from "@/domain/church-source-editorial-safety";
import { classifyChurchWebFetchFailure, describeChurchWebFetchFailure } from "@/domain/church-web-fetch-diagnostics";

/**
 * User-submitted or boundedly fetched public church excerpts, never verified
 * institutional claims. Source identity and review are required for publication.
 */
const suggestionTargetFields = churchSuggestionTargetFields;
const excerptDigest = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

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
  const rows = await db.select({
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
    .orderBy(desc(churchContentSuggestions.createdAt)).limit(25);
  if (!rows.length) return [];
  const capture = await db.select({
    resourceId: auditEvents.resourceId, after: auditEvents.after,
  }).from(auditEvents).where(and(
    eq(auditEvents.resourceType, "church_content_suggestion"),
    inArray(auditEvents.resourceId, rows.map(item => item.id)),
    inArray(auditEvents.action, [
      "site.website.source_excerpt.submitted",
      "site.website.source_excerpt.retrieved",
    ]),
  )).orderBy(desc(auditEvents.occurredAt)).limit(50);
  const byId = new Map<string, "manual_summary" | "public_html">();
  for (const entry of capture) {
    if (byId.has(entry.resourceId)) continue;
    const origin = entry.after?.origin;
    if (origin === "manual_summary" || origin === "public_html") {
      byId.set(entry.resourceId, origin);
    }
  }
  return rows.map(row => ({
    ...row,
    origin: byId.get(row.id) ?? "legacy_unknown" as const,
  }));
}

export async function submitChurchSourceExcerpt(actor: AccessContext, input: {
  sourceReferenceId: string; field: ChurchSuggestionField;
  text: string; sourcePageUrl: string;
}) {
  const target = suggestionTargetFields[input.field];
  if (!target) throw new Error("This suggestion field needs manual branding review");
  const proposedText = input.text.trim();
  assertChurchSourceEditorialCopy(proposedText, target);
  const normalizedUrl = normalizeChurchReferenceUrl("website", input.sourcePageUrl);
  return db.transaction(async tx => {
    const site = await requirePartnerWebsiteEditor(actor, tx, siteWebsiteLocalPublishCapability);
    const [reference] = await tx.select().from(churchSourceReferences)
      .where(and(eq(churchSourceReferences.id, input.sourceReferenceId),
        eq(churchSourceReferences.siteId, site.id), eq(churchSourceReferences.kind, "website"),
        isNull(churchSourceReferences.revokedAt))).for("update").limit(1);
    if (!reference || new URL(normalizedUrl).origin !== new URL(reference.normalizedUrl).origin) {
      throw new Error("Choose a page from your saved church website");
    }
    // The source row is locked so concurrent manual submission, refresh and
    // revocation cannot leave an orphan pending proposal.
    const pending = await tx.select({
      id: churchContentSuggestions.id, field: churchContentSuggestions.field,
      proposedText: churchContentSuggestions.proposedText,
      sourcePageUrl: churchContentSuggestions.sourcePageUrl,
    }).from(churchContentSuggestions).where(and(
      eq(churchContentSuggestions.siteId, site.id),
      eq(churchContentSuggestions.reviewDecision, "pending"),
    )).orderBy(desc(churchContentSuggestions.createdAt)).limit(25);
    const duplicate = pending.find(row =>
      row.field === input.field && row.proposedText === proposedText &&
      row.sourcePageUrl === normalizedUrl);
    if (duplicate) return { id: duplicate.id, changed: false };
    if (pending.length >= 25) {
      throw new Error("Review or discard some existing church suggestions before adding more");
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
      after: {
        field: input.field, sourceReferenceId: reference.id,
        sourceUrlAtCapture: reference.normalizedUrl,
        sourcePageUrl: normalizedUrl, origin: "manual_summary",
        excerptDigest: excerptDigest(proposedText),
      },
    });
    await emitEvent(tx, {
      eventType: EventTypes.ChurchContentSuggestionSubmitted,
      aggregateType: "church_content_suggestion", aggregateId: created.id,
      actorPersonId: actor.actorPersonId, organizationId: site.organizationId,
      siteId: site.id, payload: { field: input.field },
    });
    return { id: created.id, changed: true };
  });
}


/**
 * A source-derived review is ONE transaction: canonical Site-publication lock,
 * source lock, proposal lock, then versioned church-content publish and the
 * proposal decision/audit/outbox. No nested publisher transaction.
 *
 * Lock order is Site-publication -> church source -> suggestion -> local
 * content version. Source save/revoke take only the source lock and never
 * subsequently request the Site-publication lock.
 */
export async function reviewChurchSourceExcerpt(actor: AccessContext, input: {
  suggestionId: string; decision: "accepted"|"edited"|"discarded";
  editedText?: string; expectedRevision?: number; rightsConfirmed?: boolean;
}) {
  return db.transaction(async tx => {
    const site = await requirePartnerWebsiteEditor(actor, tx, siteWebsiteLocalPublishCapability);
    // This is the canonical local-content revision serialization lock. Take
    // it before the lower-level source lock for deterministic concurrency.
    const [publicationAddress] = await tx.select({ id: sitePublications.siteId })
      .from(sitePublications).where(eq(sitePublications.siteId, site.id))
      .for("update").limit(1);
    if (!publicationAddress && input.decision !== "discarded") {
      throw new Error("Reserve a Site public address before reviewing website copy");
    }

    // Read the source ID without a lock only to determine the next lock key.
    // Re-read and validate the entire proposal after both locks are held.
    const [identity] = await tx.select({
      sourceReferenceId: churchContentSuggestions.sourceReferenceId,
    }).from(churchContentSuggestions).where(and(
      eq(churchContentSuggestions.id, input.suggestionId),
      eq(churchContentSuggestions.siteId, site.id),
    )).limit(1);
    if (!identity) throw new Error("Church suggestion was not found for this Site");

    const [source] = await tx.select().from(churchSourceReferences)
      .where(and(eq(churchSourceReferences.id, identity.sourceReferenceId),
        eq(churchSourceReferences.siteId, site.id)))
      .for("update").limit(1);
    const [proposal] = await tx.select().from(churchContentSuggestions)
      .where(and(eq(churchContentSuggestions.id, input.suggestionId),
        eq(churchContentSuggestions.siteId, site.id)))
      .for("update").limit(1);
    if (!source || source.revokedAt || !proposal ||
        proposal.sourceReferenceId !== source.id) {
      throw new Error("Church suggestion source was removed or changed; refresh before reviewing");
    }
    if (proposal.reviewDecision !== "pending") {
      if (proposal.reviewDecision === input.decision) {
        // The committed review audit is the authoritative receipt until I
        // approves additive suggestion provenance columns. Never publish again.
        const [receipt] = await tx.select({ after: auditEvents.after })
          .from(auditEvents).where(and(
            eq(auditEvents.resourceType, "church_content_suggestion"),
            eq(auditEvents.resourceId, proposal.id),
            eq(auditEvents.action, "site.website.source_excerpt.reviewed"),
          )).orderBy(desc(auditEvents.occurredAt)).limit(1);
        const data = receipt?.after;
        const revision = data?.publicationRevision;
        const status = data?.publicationStatus;
        const priorPublication: Awaited<ReturnType<typeof publishPartnerLocalContentWithinTransaction>> | null =
          typeof revision === "number" && Number.isSafeInteger(revision) &&
          (status === "published" || status === "review_required")
            ? { changed: false, revision, status,
              flaggedFields: Array.isArray(data?.flaggedFields) &&
                data.flaggedFields.every(item => typeof item === "string")
                ? data.flaggedFields as string[] : [] }
            : null;
        return { decision: input.decision, publication: priorPublication, alreadyReviewed: true };
      }
      throw new Error("This church suggestion has already been reviewed; refresh first");
    }

    const [capture] = await tx.select({ after: auditEvents.after })
      .from(auditEvents).where(and(
        eq(auditEvents.resourceType, "church_content_suggestion"),
        eq(auditEvents.resourceId, proposal.id),
        inArray(auditEvents.action, [
          "site.website.source_excerpt.submitted",
          "site.website.source_excerpt.retrieved",
        ]),
      )).orderBy(desc(auditEvents.occurredAt)).limit(1);
    assertChurchProposalSourceIdentity(
      source.normalizedUrl, proposal.sourcePageUrl,
      typeof capture?.after?.sourceUrlAtCapture === "string"
        ? capture.after.sourceUrlAtCapture : null,
    );

    let publication: Awaited<ReturnType<typeof publishPartnerLocalContentWithinTransaction>> | null = null;
    if (input.decision !== "discarded") {
      if (input.rightsConfirmed !== true) {
        throw new Error("Confirm your church has the rights to publish the selected text");
      }
      const target = suggestionTargetFields[proposal.field];
      if (!target) throw new Error("This suggestion needs a manual branding review");
      if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision! < 0) {
        throw new Error("Current website revision is required");
      }
      const revisedText = input.decision === "edited"
        ? (input.editedText?.trim() ?? "") : proposal.proposedText;
      assertChurchSourceEditorialCopy(revisedText, target);
      const history = await readLocalContentHistory(site.id, tx);
      if ((history[0]?.revision ?? 0) !== input.expectedRevision) {
        throw new Error("Website content changed. Refresh and review the new version first.");
      }
      const current = history[0]?.content ?? emptySiteLocalContent;
      // The same canonical publisher applies normalization, unsafe content
      // checks, protected-claim review, versioning and audit under this tx.
      publication = await publishPartnerLocalContentWithinTransaction(actor, {
        operation: "save", expectedRevision: input.expectedRevision!,
        content: { ...current, [target]: revisedText },
      }, tx);
    }

    await tx.update(churchContentSuggestions).set({
      reviewDecision: input.decision, reviewedAt: new Date(),
      reviewedByPersonId: actor.actorPersonId!,
    }).where(and(eq(churchContentSuggestions.id, proposal.id),
      eq(churchContentSuggestions.siteId, site.id),
      eq(churchContentSuggestions.reviewDecision, "pending")));
    await writeAudit(tx, actor, {
      action: "site.website.source_excerpt.reviewed",
      entityType: "church_content_suggestion", entityId: proposal.id,
      scope: { organizationId: site.organizationId, siteId: site.id },
      before: { decision: "pending" },
      after: {
        decision: input.decision,
        publicationRevision: publication?.revision ?? null,
        publicationStatus: publication?.status ?? null,
        flaggedFields: publication?.flaggedFields ?? [],
        reviewedTextDigest: input.decision === "discarded" ? null :
          excerptDigest(input.decision === "edited"
            ? (input.editedText?.trim() ?? "") : proposal.proposedText),
        sourceUrlAtReview: source.normalizedUrl,
        rightsConfirmed: input.decision !== "discarded" && input.rightsConfirmed === true,
      },
    });
    await emitEvent(tx, {
      eventType: EventTypes.ChurchContentSuggestionReviewed,
      aggregateType: "church_content_suggestion", aggregateId: proposal.id,
      actorPersonId: actor.actorPersonId, organizationId: site.organizationId,
      siteId: site.id, payload: {
        decision: input.decision, publicationRevision: publication?.revision ?? null,
      },
    });
    return { decision: input.decision, publication, alreadyReviewed: false };
  });
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
    const diagnosis = classifyChurchWebFetchFailure(error);
    const stillActive = await db.transaction(async tx => {
      const checked = await requirePartnerWebsiteEditor(actor, tx, siteWebsiteLocalPublishCapability);
      const [current] = await tx.select().from(churchSourceReferences)
        .where(and(eq(churchSourceReferences.id, reference.id),
          eq(churchSourceReferences.siteId, checked.id))).for("update").limit(1);
      if (!current || current.revokedAt || current.normalizedUrl !== reference.normalizedUrl ||
          current.lastAttemptAt?.getTime() !== attemptAt.getTime()) return false;
      await tx.update(churchSourceReferences).set({
        referenceState: diagnosis.state, updatedAt: new Date(),
      }).where(eq(churchSourceReferences.id, reference.id));
      await writeAudit(tx, actor, {
        action: "site.website.source_refresh.failed",
        entityType: "church_source_reference", entityId: reference.id,
        scope: { organizationId: checked.organizationId, siteId: checked.id },
        // Bounded reason code only; never persist network errors, request bodies
        // or DNS response addresses to a general operations action.
        after: { reasonCode: diagnosis.code, state: diagnosis.state },
      });
      return true;
    });
    if (!stillActive) return { status: "stale" as const, count: 0,
      message: "The church reference changed during retrieval. No suggestions were saved." };
    return { status: diagnosis.state, count: 0, reasonCode: diagnosis.code,
      message: diagnosis.message };
  }
  const brandProposal = deriveChurchBrandProposal(
    reference.normalizedUrl, new Date().toISOString(),
    pages.flatMap(page => page.brandEvidence ?? []),
  );
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
      try { assertChurchSourceEditorialCopy(proposedText, target); }
      catch { return []; }
      return [{
        siteId: checked.id,
        sourceReferenceId: reference.id,
        field: page.sourceField,
        proposedText,
        sourcePageUrl: page.pageUrl,
        retrievedAt: new Date(),
        confidence: "low" as const,
        reviewDecision: "pending" as const,
        createdByPersonId: actor.actorPersonId!,
      }];
    });
    // Different source paths can repeat identical text. Present only one
    // bounded proposal per source field/text and keep the first source page.
    const seen = new Set<string>();
    const distinct = values.filter(value => {
      const key = JSON.stringify([value.field, value.proposedText]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (!distinct.length) {
      const diagnosis = describeChurchWebFetchFailure("unsafe_excerpt");
      await tx.update(churchSourceReferences).set({
        referenceState: diagnosis.state, updatedAt: new Date(),
      }).where(eq(churchSourceReferences.id, reference.id));
      await writeAudit(tx, actor, {
        action: "site.website.source_refresh.failed",
        entityType: "church_source_reference", entityId: reference.id,
        scope: { organizationId: checked.organizationId, siteId: checked.id },
        after: { reasonCode: diagnosis.code, state: diagnosis.state },
      });
      return { status: diagnosis.state, count: 0, reasonCode: diagnosis.code,
        message: diagnosis.message };
    }
    const created = await tx.insert(churchContentSuggestions).values(distinct).returning({
      id: churchContentSuggestions.id,
      field: churchContentSuggestions.field,
      proposedText: churchContentSuggestions.proposedText,
      sourcePageUrl: churchContentSuggestions.sourcePageUrl,
    });
    if (created.length !== distinct.length) throw new Error("Incomplete church-source proposal persistence");
    for (const proposal of created) {
      await writeAudit(tx, actor, {
        action: "site.website.source_excerpt.retrieved",
        entityType: "church_content_suggestion", entityId: proposal.id,
        scope: { organizationId: checked.organizationId, siteId: checked.id },
        after: {
          sourceReferenceId: reference.id, field: proposal.field,
          sourcePageUrl: proposal.sourcePageUrl,
          sourceUrlAtCapture: reference.normalizedUrl,
          origin: "public_html", extractionVersion: "church-html-v1",
          excerptDigest: excerptDigest(proposal.proposedText),
        },
      });
    }
    await tx.update(churchSourceReferences).set({
      referenceState: "fetchable", updatedAt: new Date(),
    }).where(eq(churchSourceReferences.id, reference.id));
    await writeAudit(tx, actor, {
      action: "site.website.source_refresh.completed",
      entityType: "church_source_reference", entityId: reference.id,
      scope: { organizationId: checked.organizationId, siteId: checked.id },
      after: { count: distinct.length },
    });
    await emitEvent(tx, {
      eventType: EventTypes.ChurchWebsiteSuggestionsRetrieved,
      aggregateType: "church_source_reference", aggregateId: reference.id,
      actorPersonId: actor.actorPersonId,
      organizationId: checked.organizationId, siteId: checked.id,
      payload: { count: distinct.length },
    });
    return { status: "ready" as const, count: distinct.length, brandProposal,
      message: "Public church website excerpts are ready for individual review. Nothing was published." };
  });
}
