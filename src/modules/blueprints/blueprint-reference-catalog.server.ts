import { isCanonicalSiteDiscoverable, isPrivateCanSitePlanningAllowed } from "@/domain/canonical-site-availability";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  blueprintReferenceItems,
  blueprintReferenceItemVersions,
  catalogSites,
} from "@/db/canonical-v301";
import {
  blueprintReferenceCatalogInputSchema,
  projectBlueprintReferenceCatalog,
  type BlueprintReferenceCatalogItem,
} from "@/domain/blueprint-reference-catalog";
import {
  assertCapability,
  AuthorizationError,
  type CommandContext,
} from "@/domain/command-context";
import { programCatalogDatabaseRole } from "@/domain/program-catalog-database-role";
import { DomainError } from "@/domain/errors";
import { assertVerifiedCanPlanningSite, isVerifiedCanSitePlanning } from "@/modules/blueprints/verified-site-planning.server";


type BlueprintCatalogTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Reuse one published-reference query for both Establish browsing and
 * save-time validation. The caller owns Site authorization and transaction.
 * This helper cannot issue a second role, grant, or nested DB transaction. */
export async function readPublishedBlueprintReferences(
  tx: BlueprintCatalogTx,
): Promise<BlueprintReferenceCatalogItem[]> {
    const rows = await tx.select({
      itemId: blueprintReferenceItems.id,
      versionId: blueprintReferenceItemVersions.id,
      code: blueprintReferenceItems.code,
      referenceKind: blueprintReferenceItems.referenceKind,
      category: blueprintReferenceItems.category,
      status: blueprintReferenceItems.status,
      sortOrder: blueprintReferenceItems.sortOrder,
      versionNo: blueprintReferenceItemVersions.versionNo,
      title: blueprintReferenceItemVersions.title,
      summary: blueprintReferenceItemVersions.summary,
      lifecycle: blueprintReferenceItemVersions.lifecycle,
    }).from(blueprintReferenceItems)
      .innerJoin(blueprintReferenceItemVersions,
        eq(blueprintReferenceItemVersions.itemId, blueprintReferenceItems.id))
      .where(and(
        eq(blueprintReferenceItems.status, "active"),
        eq(blueprintReferenceItemVersions.lifecycle, "published"),
      ))
      .orderBy(
        asc(blueprintReferenceItems.sortOrder),
        asc(blueprintReferenceItems.code),
        desc(blueprintReferenceItemVersions.versionNo),
      );

    return projectBlueprintReferenceCatalog(rows);
}

/** Catalog discovery is scoped to a real Site and a purpose-bound DB role. */
export async function getBlueprintReferenceCatalog(
  context: CommandContext,
  rawInput: unknown,
): Promise<BlueprintReferenceCatalogItem[]> {
  if (!context.actorPersonId) throw new AuthorizationError("authenticated session");
  assertCapability(context, "program.launch.start");
  const { siteId } = blueprintReferenceCatalogInputSchema.parse(rawInput);
  if (!context.scope.siteIds?.includes(siteId)) {
    throw new AuthorizationError("Blueprint catalog Site scope");
  }
  const isCanPlanning = isVerifiedCanSitePlanning(context);
  const databaseRole = isCanPlanning ? null : programCatalogDatabaseRole(context);

  return db.transaction(async tx => {
    if (databaseRole) await tx.execute(sql.raw(`SET LOCAL ROLE ${databaseRole}`));
    const [site] = await tx.select({
      id: catalogSites.id,
      status: catalogSites.status,
    }).from(catalogSites).where(eq(catalogSites.id, siteId)).limit(1);
    if (!site || (isCanPlanning
      ? !isPrivateCanSitePlanningAllowed(site.status)
      : !isCanonicalSiteDiscoverable(site.status))) {
      throw new DomainError("UNAVAILABLE", "This Site is unavailable for Blueprint planning.");
    }
    if (isCanPlanning) await assertVerifiedCanPlanningSite(tx, context, siteId);

    return readPublishedBlueprintReferences(tx);
  });
}
