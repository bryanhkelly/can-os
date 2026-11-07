import { changeSitePublicationWithinTransaction } from "./site-publication.server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { actions, siteLocalContentVersions, sitePublications } from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import {
  classifySiteLocalContent, normalizeSiteLocalContent, type SiteLocalContent,
} from "@/domain/site-local-content";
import { emitEvent, writeAudit } from "@/platform/mutation";
import { requirePartnerWebsiteEditor } from "./site-website-authorization.server";
import { siteWebsiteLocalPublishCapability } from "@/domain/site-publication-policy";
import { DomainError } from "@/domain/errors";

import { EventTypes } from "@/domain/event-types";
type Reader = Pick<typeof db, "select">;

/** Read ONLY the latest locally published content for the live website. */
export async function readCurrentLocalContent(siteId: string, executor: Reader = db) {
  const [current] = await executor.select().from(siteLocalContentVersions)
    .where(and(
      eq(siteLocalContentVersions.siteId, siteId),
      eq(siteLocalContentVersions.status, "published"),
    )).orderBy(desc(siteLocalContentVersions.revision)).limit(1);
  return current ?? null;
}

/** Bounded edit history, never exposed through the anonymous public route. */
export async function readLocalContentHistory(siteId: string, executor: Reader = db) {
  return executor.select().from(siteLocalContentVersions)
    .where(eq(siteLocalContentVersions.siteId, siteId))
    .orderBy(desc(siteLocalContentVersions.revision)).limit(25);
}

/**
 * A church controls local copy directly. Protected claims are held as a
 * separate immutable revision and create an Action for CAN review, leaving
 * the last locally published revision untouched. Unsafe markup is rejected.
 *
 * Rollback appends another revision, preserving authorship and evidence.
 * Neither action changes official Site/Program publication or admission.
 */
export type PartnerLocalContentTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type PartnerLocalContentCommand = {
  expectedRevision: number;
  operation: "save" | "restore" | "draft";
  content?: SiteLocalContent;
  restoreRevision?: number;
};

/**
 * Shared canonical local-content publisher within an existing DB transaction.
 * The caller MUST acquire the Site publication row before any lower-level
 * source locks, if source review is involved. All policy, audit and outbox
 * writes remain in this single implementation.
 */
export async function publishPartnerLocalContentWithinTransaction(
  actor: AccessContext, input: PartnerLocalContentCommand, tx: PartnerLocalContentTx,
) {
    // Relationship authorization runs inside the write transaction.
    const site = await requirePartnerWebsiteEditor(actor, tx, siteWebsiteLocalPublishCapability);
    const [sitePublication] = await tx.select({
      siteId: sitePublications.siteId, updatedAt: sitePublications.updatedAt,
    }).from(sitePublications)
      .where(eq(sitePublications.siteId, site.id)).for("update").limit(1);
    if (!sitePublication) {
      throw new Error("This Site needs a reserved public address before editing website copy");
    }
    const [latest] = await tx.select().from(siteLocalContentVersions)
      .where(eq(siteLocalContentVersions.siteId, site.id))
      .orderBy(desc(siteLocalContentVersions.revision)).limit(1);
    const currentRevision = latest?.revision ?? 0;
    if (input.expectedRevision !== currentRevision)
      throw new Error("Website content was updated. Refresh before saving your changes.");

    let content: SiteLocalContent;
    let restoredFromRevision: number | null = null;
    if (input.operation === "restore") {
      if (!Number.isSafeInteger(input.restoreRevision) ||
          input.restoreRevision! < 1 ||
          input.restoreRevision! >= currentRevision) {
        throw new Error("Select a previously published content revision");
      }
      const [old] = await tx.select({
        content: siteLocalContentVersions.content,
      }).from(siteLocalContentVersions).where(and(
        eq(siteLocalContentVersions.siteId, site.id),
        eq(siteLocalContentVersions.revision, input.restoreRevision!),
        eq(siteLocalContentVersions.status, "published"),
      )).limit(1);
      if (!old) throw new Error("This revision was not published by your Site");
      content = normalizeSiteLocalContent(old.content);
      restoredFromRevision = input.restoreRevision!;
    } else {
      if (!input.content) throw new Error("Local website content is required");
      content = normalizeSiteLocalContent(input.content, { allowIncompleteImage: input.operation === "draft" });
    }

    // The "original" behind Reset is fixed on the first saved Site revision.
    // An editor may change any displayed wording, but subsequent requests
    // cannot silently replace that baseline. History restores retain it too.
    const original = latest?.content.editorialBaseline;
    if (original && input.operation === "restore") {
      content = { ...content, editorialBaseline: original };
    } else if (original &&
      JSON.stringify(content.editorialBaseline) !== JSON.stringify(original)) {
      throw new Error("The original website copy cannot be replaced after its first save");
    }

    const classified = classifySiteLocalContent(content);
    // Drafts are immutable, private revisions; never overwrite published content.
    // Protected claims are screened again when the editor requests publication.
    const decision = input.operation === "draft"
      ? { status: "draft" as const, flaggedFields: [] as string[] } : classified;
    if (latest && JSON.stringify(latest.content) === JSON.stringify(content) &&
      latest.status === decision.status) {
      if(actor.role === "site_admin" && decision.status === "published")
        await changeSitePublicationWithinTransaction(actor, {siteId:site.id,action:"publish",expectedRevision:sitePublication.updatedAt.toISOString(),reason:"Site Administrator published reviewed school website content.",contentReviewed:true}, tx);
      return { changed: false, revision: currentRevision, status: latest.status,
        flaggedFields: latest.flaggedFields };
    }

    const revision = currentRevision + 1;
    const [created] = await tx.insert(siteLocalContentVersions).values({
      siteId: site.id, revision, content, status: decision.status,
      flaggedFields: decision.flaggedFields,
      createdByPersonId: actor.actorPersonId!,
      restoredFromRevision,
    }).returning({ id: siteLocalContentVersions.id });
    if (!created) throw new Error("Local website revision could not be saved");

    if (decision.status === "review_required") {
      // The Action is a bounded CAN review task, not a publication decision.
      // Do not copy religious statements into general Operations metadata.
      await tx.insert(actions).values({
        type: "site_website_institutional_claim_review",
        title: "Review protected claim in church website copy",
        description: "Review the restricted Site website revision before any release.",
        subjectType: "site_local_content_version",
        subjectId: created.id,
        siteId: site.id, organizationId: site.organizationId,
        status: "open", priority: "normal",
        metadata: { revision, flaggedFields: decision.flaggedFields },
      });
    }
    await writeAudit(tx, actor, {
      action: decision.status === "draft"
        ? "site.website.local_content.draft_saved"
        : decision.status === "published"
          ? "site.website.local_content.published"
          : "site.website.local_content.review_requested",
      entityType: "site_local_content_version", entityId: created.id,
      scope: { organizationId: site.organizationId, siteId: site.id },
      before: { revision: currentRevision, status: latest?.status ?? null },
      after: { revision, status: decision.status,
        flaggedFields: decision.flaggedFields, restoredFromRevision },
      // Actual immutable copy is retained on this version row, not in
      // unrestricted event notifications or action metadata.
    });
    await emitEvent(tx, {
      eventType: decision.status === "draft"
        ? EventTypes.SiteLocalWebsiteDraftSaved
        : decision.status === "published"
          ? EventTypes.SiteLocalWebsiteContentPublished
          : EventTypes.SiteLocalWebsiteContentReviewRequested,
      aggregateType: "site_local_content_version", aggregateId: created.id,
      actorPersonId: actor.actorPersonId,
      organizationId: site.organizationId, siteId: site.id,
      payload: { revision, status: decision.status },
    });
    if(actor.role === "site_admin" && decision.status === "published")
      await changeSitePublicationWithinTransaction(actor, {siteId:site.id,action:"publish",expectedRevision:sitePublication.updatedAt.toISOString(),reason:"Site Administrator published reviewed school website content.",contentReviewed:true}, tx);
    return { changed: true, revision, status: decision.status,
      flaggedFields: decision.flaggedFields };
}

/** Detect the deployed database's historic check rejecting immutable drafts.
 * Do not pretend an insert succeeded; the remedy is migration 0077. */
function draftStatusConstraintMissing(error: unknown): boolean {
  let candidate: unknown = error;
  for (let depth = 0; depth < 4 && candidate && typeof candidate === "object"; depth++) {
    const info = candidate as { code?: unknown; constraint?: unknown; message?: unknown; cause?: unknown };
    if (info.constraint === "site_local_content_status_ck" && info.code === "23514")
      return true;
    if (info.code === "23514" && typeof info.message === "string" &&
        info.message.includes("site_local_content_status_ck")) return true;
    candidate = info.cause;
  }
  return false;
}

export async function publishPartnerLocalContent(
  actor: AccessContext, input: PartnerLocalContentCommand,
) {
  try {
    return await db.transaction(tx => publishPartnerLocalContentWithinTransaction(actor, input, tx));
  } catch (error) {
    if (input.operation === "draft" && draftStatusConstraintMissing(error))
      throw new DomainError("WEBSITE_DRAFT_STORAGE_NOT_READY");
    throw error;
  }
}

