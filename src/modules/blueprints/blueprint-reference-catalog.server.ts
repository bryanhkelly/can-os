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
  if (process.env.CAN_CANONICAL_CATALOG_ENABLED !== "true") {
    throw new DomainError("UNAVAILABLE", "Canonical Blueprint catalog is not enabled.");
  }
  const databaseRole = programCatalogDatabaseRole(context);

  return db.transaction(async tx => {
    await tx.execute(sql.raw(`SET LOCAL ROLE ${databaseRole}`));
    const [site] = await tx.select({
      id: catalogSites.id,
      status: catalogSites.status,
    }).from(catalogSites).where(eq(catalogSites.id, siteId)).limit(1);
    if (!site || site.status === "closed") {
      throw new DomainError("UNAVAILABLE", "This Site is unavailable for Blueprint planning.");
    }

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
  });
}
