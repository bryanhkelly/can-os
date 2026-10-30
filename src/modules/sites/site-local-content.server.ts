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
export async function publishPartnerLocalContent(actor: AccessContext, input: {
  expectedRevision: number;
  operation: "save" | "restore";
  content?: SiteLocalContent;
  restoreRevision?: number;
}) {
  return db.transaction(async tx => {
    // Relationship authorization runs inside the write transaction.
    const site = await requirePartnerWebsiteEditor(actor, tx, siteWebsiteLocalPublishCapability);
    const [sitePublication] = await tx.select({
      siteId: sitePublications.siteId,
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
      content = normalizeSiteLocalContent(input.content);
    }

    const decision = classifySiteLocalContent(content);
    if (latest && JSON.stringify(latest.content) === JSON.stringify(content) &&
      latest.status === decision.status) {
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
      action: decision.status === "published"
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
      eventType: decision.status === "published"
        ? EventTypes.SiteLocalWebsiteContentPublished
        : EventTypes.SiteLocalWebsiteContentReviewRequested,
      aggregateType: "site_local_content_version", aggregateId: created.id,
      actorPersonId: actor.actorPersonId,
      organizationId: site.organizationId, siteId: site.id,
      payload: { revision, status: decision.status },
    });
    return { changed: true, revision, status: decision.status,
      flaggedFields: decision.flaggedFields };
  });
}
