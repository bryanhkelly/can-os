import { describe, expect, it } from "vitest";
import {
  demoCurriculumSource, isOwnedPrivateDemoPack, selectSingleImporterDraft,
} from "../../scripts/lib/demo-curriculum-import.mjs";

describe("demo curriculum importer ownership", () => {
  it("only reuses privately visible packs marked as importer-owned", () => {
    expect(isOwnedPrivateDemoPack({
      visibility: "private",
      metadata: { sourceSystem: demoCurriculumSource, sourceHash: "hash" },
    })).toBe(true);
    expect(isOwnedPrivateDemoPack({
      visibility: "public",
      metadata: { sourceSystem: demoCurriculumSource, sourceHash: "hash" },
    })).toBe(false);
    expect(isOwnedPrivateDemoPack({
      visibility: "private",
      metadata: { sourceHash: "hash" },
    })).toBe(false);
  });

  it("reuses one importer-owned draft and permits a new draft when none exists", () => {
    const draft = { id: "draft", status: "draft", metadata: { sourceSystem: demoCurriculumSource } };
    expect(selectSingleImporterDraft([draft], version =>
      version.metadata?.sourceSystem === demoCurriculumSource)).toBe(draft);
    expect(selectSingleImporterDraft([{ id: "published", status: "published" }], () => false)).toBeNull();
  });

  it("rejects foreign or accumulated drafts instead of overwriting or adding another", () => {
    expect(() => selectSingleImporterDraft([
      { id: "draft", status: "draft", metadata: { sourceSystem: "manual" } },
    ], version => version.metadata?.sourceSystem === demoCurriculumSource))
      .toThrow("not created by this importer");
    expect(() => selectSingleImporterDraft([
      { id: "one", status: "draft", metadata: { sourceSystem: demoCurriculumSource } },
      { id: "two", status: "draft", metadata: { sourceSystem: demoCurriculumSource } },
    ], version => version.metadata?.sourceSystem === demoCurriculumSource))
      .toThrow("Multiple editable drafts");
  });
});
