export const demoCurriculumSource = "can-demo-catalog-factory";
export const demoCurriculumReviewStatus = "under_review";

export function isOwnedPrivateDemoPack(pack) {
  return pack?.visibility === "private" &&
    pack.metadata?.sourceSystem === demoCurriculumSource;
}

export function selectSingleImporterDraft(versions, isOwned) {
  const drafts = versions.filter(version => version.status === "draft");
  if (drafts.length > 1) {
    throw new Error("Multiple editable drafts exist; resolve them before importing again");
  }
  const draft = drafts[0] ?? null;
  if (draft && !isOwned(draft)) {
    throw new Error("Refusing to replace a draft not created by this importer");
  }
  return draft;
}
