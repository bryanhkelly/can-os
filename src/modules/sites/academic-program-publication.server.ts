import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { programPublications, programs, sitePublications } from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import {
  academicMarketingSnapshot, publishableAcademicProgram,
} from "@/domain/academic-program-publication";
import { emitEvent, writeAudit } from "@/platform/mutation";
import { requireSitePublisher } from "./site-publication.server";
import { requireChurchHostedOperatingServices } from "@/modules/programs/program-site-authorization.server";

import { EventTypes } from "@/domain/event-types";
export type AcademicMarketingAction = "publish" | "unpublish";

/** Reviewed, reversible academic marketing copy. No admissions/credit changes. */
export async function changeAcademicProgramPublication(
  actor: AccessContext,
  input: {
    siteId: string;
    programId: string;
    action: AcademicMarketingAction;
    expectedRevision: string | null;
    summary: string;
    reason: string;
    contentReviewed: boolean;
  },
) {
  return db.transaction(async tx => {
    const site = await requireSitePublisher(actor, input.siteId, tx);
    if (!(actor.scope.programIds ?? []).includes(input.programId)) {
      throw new Error("This Program is not in your authorized scope");
    }

    // Serializes against Site publish/unpublish and other academic decisions.
    const [siteAddress] = await tx.select({ siteId: sitePublications.siteId })
      .from(sitePublications).where(eq(sitePublications.siteId, site.id))
      .for("update").limit(1);
    if (!siteAddress) throw new Error("Reserve this Site's public address first");

    const [program] = await tx.select({
      id: programs.id, name: programs.name, siteId: programs.siteId,
      organizationId: programs.organizationId,
      type: programs.type, status: programs.status,
      gradeRange: programs.gradeRange, deliveryModel: programs.deliveryModel,
    }).from(programs).where(and(
      eq(programs.id, input.programId),
      eq(programs.siteId, site.id),
      eq(programs.organizationId, site.organizationId),
    )).for("share").limit(1);
    if (!program || (input.action === "publish" && !publishableAcademicProgram({
      type: program.type, status: program.status,
      siteId: program.siteId, organizationId: program.organizationId,
      publicationSiteId: site.id, siteOrganizationId: site.organizationId,
    }))) throw new Error("Only current academic Programs belonging to this Site can be marketed");

    const [current] = await tx.select({
      status: programPublications.status,
      updatedAt: programPublications.updatedAt,
      title: programPublications.title,
      summary: programPublications.summary,
      publishedAt: programPublications.publishedAt,
    }).from(programPublications)
      .where(eq(programPublications.programId, program.id)).for("update").limit(1);

    const target = input.action === "publish" ? "published" as const : "draft" as const;
    if ((current?.status ?? "draft") === target) {
      return { programId: program.id, status: target, changed: false,
        updatedAt: current?.updatedAt.toISOString() ?? null };
    }
    if ((current?.updatedAt.toISOString() ?? null) !== input.expectedRevision) {
      throw new Error("Program marketing approval changed. Refresh and try again.");
    }
    const reason = input.reason.trim();
    if (reason.length < 10 || reason.length > 500)
      throw new Error("Provide a 10–500 character publication decision reason");
    if (target === "published" && !input.contentReviewed)
      throw new Error("Review academic marketing information before publishing");

    const now = new Date();
    const updatedAt = new Date(Math.max(now.getTime(),
      (current?.updatedAt.getTime() ?? 0) + 1));
    const snapshot = target === "published"
      ? academicMarketingSnapshot(program, input.summary)
      : null;
    // A host registrar's Site-publisher grant cannot itself authorize CAN's
    // academic/school-of-record relationship. Verify independent agreement
    // before associating CAN instructional claims with a public listing.
    // This remains distinct from operational activation or admissions.
    const institutionalAuthorizationId = target === "published"
      ? await requireChurchHostedOperatingServices(tx, program.id,
          ["academic_instruction", "school_of_record"])
      : null;
    if (target === "published") {
      if (current) {
        await tx.update(programPublications).set({
          ...snapshot!, status: "published", publishedAt: now,
          approvedByPersonId: actor.actorPersonId, updatedAt,
        }).where(eq(programPublications.programId, program.id));
      } else {
        await tx.insert(programPublications).values({
          programId: program.id, siteId: site.id,
          ...snapshot!, status: "published", publishedAt: now,
          approvedByPersonId: actor.actorPersonId, updatedAt,
        });
      }
    } else {
      await tx.update(programPublications).set({
        status: "draft", publishedAt: null, approvedByPersonId: null,
        updatedAt,
      }).where(eq(programPublications.programId, program.id));
    }

    await writeAudit(tx, actor, {
      action: target === "published"
        ? "program.marketing.publish" : "program.marketing.unpublish",
      entityType: "program", entityId: program.id,
      scope: { organizationId: site.organizationId, siteId: site.id, programId: program.id },
      before: current ? { status: current.status,
        publishedAt: current.publishedAt?.toISOString() ?? null } : null,
      after: { status: target, title: snapshot?.title ?? current?.title,
        summary: snapshot?.summary ?? current?.summary, reason,
        institutionalAuthorizationId,
        reviewed: target === "published" ? input.contentReviewed : null },
    });
    await emitEvent(tx, {
      eventType: target === "published"
        ? EventTypes.AcademicProgramMarketingPublished : EventTypes.AcademicProgramMarketingUnpublished,
      aggregateType: "program", aggregateId: program.id,
      actorPersonId: actor.actorPersonId, organizationId: site.organizationId,
      siteId: site.id, programId: program.id,
      payload: { publicationStatus: target },
    });
    return { programId: program.id, status: target, changed: true,
      updatedAt: updatedAt.toISOString() };
  });
}
