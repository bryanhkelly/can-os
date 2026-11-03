import { db } from "@/db/client";
import { sites } from "@/db/schema";
import { siteFamilyServiceSchema, siteFamilyServicesSchema, readSiteFamilyServices } from "@/domain/site-family-services";
import type { AccessContext } from "@/domain/access-context";
import { requireSitePublisher } from "./site-publication.server";
import { writeAudit } from "@/platform/mutation";
import { eq } from "drizzle-orm";
import { z } from "zod";

export const changeFamilyServicesInput = z.object({
  siteId: z.string().uuid(),
  expectedRevision: z.number().int().nonnegative(),
  entries: z.array(siteFamilyServiceSchema).max(7),
  reason: z.string().trim().min(10).max(500),
  contentReviewed: z.literal(true),
}).strict();

/**
 * Site-scoped, institutionally reviewed configuration. An ordinary website
 * editor cannot approve services. Edits invalidate the previous snapshot
 * atomically; the public read always uses the newest canonical Site metadata.
 */
export async function changeSiteFamilyServices(
  actor: AccessContext,
  rawInput: z.input<typeof changeFamilyServicesInput>,
) {
  const input = changeFamilyServicesInput.parse(rawInput);
  if (!actor.actorPersonId) throw new Error("Authenticated reviewer required");
  return db.transaction(async tx => {
    const site = await requireSitePublisher(actor, input.siteId, tx);
    const [locked] = await tx.select({metadata:sites.metadata})
      .from(sites).where(eq(sites.id, site.id)).for("update").limit(1);
    if (!locked) throw new Error("Site configuration not found");
    const previous = readSiteFamilyServices(locked.metadata);
    const revision = previous?.revision ?? 0;
    if (revision !== input.expectedRevision)
      throw new Error("Service information changed. Refresh before saving.");
    const reviewedAt = new Date().toISOString();
    const snapshot = siteFamilyServicesSchema.parse({
      version:1,revision:revision+1,
      reviewedByPersonId:actor.actorPersonId,
      reviewedAt, entries:input.entries,
    });
    await tx.update(sites).set({
      metadata:{...locked.metadata,familyServices:snapshot},
      updatedAt:new Date(),
    }).where(eq(sites.id,site.id));
    await writeAudit(tx,actor,{
      action:"site.family_services.review",
      entityType:"site",entityId:site.id,
      scope:{organizationId:site.organizationId,siteId:site.id},
      before:{revision},
      after:{revision:snapshot.revision,categoryStatuses:snapshot.entries.map(entry=>({
        category:entry.category,status:entry.status,
      })),reason:input.reason,contentReviewed:true},
    });
    return {siteId:site.id,revision:snapshot.revision,reviewedAt};
  });
}
