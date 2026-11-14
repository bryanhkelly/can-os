import { z } from "zod";
import { blueprintReferenceKinds } from "./blueprint-configuration";

export { blueprintReferenceKinds } from "./blueprint-configuration";

export const blueprintReferenceCatalogInputSchema = z.object({
  siteId: z.string().uuid(),
}).strict();

export type BlueprintReferenceKind = (typeof blueprintReferenceKinds)[number];

export interface BlueprintReferenceSourceRow {
  itemId: string;
  versionId: string;
  code: string;
  referenceKind: BlueprintReferenceKind;
  category: string;
  status: "active" | "retired";
  sortOrder: number;
  versionNo: number;
  title: string;
  summary: string;
  lifecycle: "draft" | "published";
}

export interface BlueprintReferenceCatalogItem {
  itemId: string;
  versionId: string;
  code: string;
  kind: BlueprintReferenceKind;
  category: string;
  title: string;
  summary: string;
  versionNo: number;
  status: "reference_only";
}

/**
 * Project one current published version per active reference item.
 * This is planning content, never an Offering, Deployment or authorization.
 * Do not send rights metadata or unpublished authoring fields to browsers.
 */
export function projectBlueprintReferenceCatalog(
  rows: readonly BlueprintReferenceSourceRow[],
): BlueprintReferenceCatalogItem[] {
  const published = rows
    .filter(row => row.status === "active" && row.lifecycle === "published")
    .sort((left, right) =>
      left.sortOrder - right.sortOrder
      || left.code.localeCompare(right.code)
      || right.versionNo - left.versionNo,
    );
  const seen = new Set<string>();
  const catalog: BlueprintReferenceCatalogItem[] = [];
  for (const row of published) {
    if (seen.has(row.itemId)) continue;
    seen.add(row.itemId);
    catalog.push({
      itemId: row.itemId,
      versionId: row.versionId,
      code: row.code,
      kind: row.referenceKind,
      category: row.category,
      title: row.title,
      summary: row.summary,
      versionNo: row.versionNo,
      status: "reference_only",
    });
  }
  return catalog;
}
