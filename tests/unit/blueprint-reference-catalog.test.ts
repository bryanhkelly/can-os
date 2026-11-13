import { describe, expect, it } from "vitest";
import { getBlueprintReferenceCatalog } from "@/modules/blueprints/blueprint-reference-catalog.server";
import {
  blueprintReferenceCatalogInputSchema,
  projectBlueprintReferenceCatalog,
  type BlueprintReferenceSourceRow,
} from "@/domain/blueprint-reference-catalog";

const first: BlueprintReferenceSourceRow = {
  itemId: "00000000-0000-4000-8000-000000000001",
  versionId: "00000000-0000-4000-8000-000000000002",
  code: "can.program.summer_enrichment",
  referenceKind: "program_model",
  category: "extended",
  status: "active",
  sortOrder: 5,
  versionNo: 1,
  title: "Summer Enrichment",
  summary: "A planning reference.",
  lifecycle: "published",
};

describe("canonical Blueprint reference catalog", () => {
  it("accepts only a Site identifier, never caller-supplied permissions", () => {
    expect(blueprintReferenceCatalogInputSchema.parse({
      siteId: first.itemId,
    })).toEqual({ siteId: first.itemId });
    expect(() => blueprintReferenceCatalogInputSchema.parse({
      siteId: first.itemId,
      organizationId: "00000000-0000-4000-8000-000000000003",
    })).toThrow();
  });

  it("projects only active published references with the latest version", () => {
    const newest = { ...first, versionId: "00000000-0000-4000-8000-000000000004", versionNo: 2 };
    const draft = { ...first, versionId: "00000000-0000-4000-8000-000000000005", versionNo: 3, lifecycle: "draft" as const };
    const retired = {
      ...first, itemId: "00000000-0000-4000-8000-000000000006",
      status: "retired" as const,
    };
    const result = projectBlueprintReferenceCatalog([draft, first, retired, newest]);
    expect(result).toEqual([{
      itemId: first.itemId,
      versionId: newest.versionId,
      code: first.code,
      kind: "program_model",
      category: "extended",
      title: first.title,
      summary: first.summary,
      versionNo: 2,
      status: "reference_only",
    }]);
    expect(result[0]).not.toHaveProperty("lifecycle");
    expect(result[0]).not.toHaveProperty("metadata");
  });

  it("orders distinct reference types by curated sort order", () => {
    const second: BlueprintReferenceSourceRow = {
      ...first,
      itemId: "00000000-0000-4000-8000-000000000007",
      versionId: "00000000-0000-4000-8000-000000000008",
      code: "can.club.chess",
      referenceKind: "club",
      sortOrder: 2,
    };
    expect(projectBlueprintReferenceCatalog([first, second]).map(row => row.code)).toEqual([
      "can.club.chess", "can.program.summer_enrichment",
    ]);
  });

  it("rejects unauthenticated, unprivileged and out-of-scope Site reads before querying", async () => {
    const siteId = first.itemId;
    const scoped = {
      actorPersonId: "00000000-0000-4000-8000-000000000009",
      capabilities: new Set(["program.launch.start"]),
      scope: {
        siteIds: [siteId],
        organizationIds: ["00000000-0000-4000-8000-000000000010"],
      },
    };
    await expect(getBlueprintReferenceCatalog(
      { ...scoped, actorPersonId: null }, { siteId },
    )).rejects.toMatchObject({ name: "AuthorizationError" });
    await expect(getBlueprintReferenceCatalog(
      { ...scoped, capabilities: new Set<string>() }, { siteId },
    )).rejects.toMatchObject({ name: "AuthorizationError" });
    await expect(getBlueprintReferenceCatalog(
      { ...scoped, scope: { ...scoped.scope, siteIds: [] } }, { siteId },
    )).rejects.toMatchObject({ name: "AuthorizationError" });
  });
});
