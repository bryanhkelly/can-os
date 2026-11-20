import type { BlueprintReferenceCatalogItem } from "./blueprint-reference-catalog";
import type { SiteProgramsAudiencesV61 } from "./site-launch-preferences";

export type SchoolYearGradeBand = "grades-6-8" | "grades-9-12";
export type SchoolYearAvailability = Readonly<Record<SchoolYearGradeBand, boolean>>;
export const noSchoolYearAvailability: SchoolYearAvailability = {
  "grades-6-8": false,
  "grades-9-12": false,
};

/** An explicit full-day, school-year academy is different from enrichment,
 * summer, Saturday, adult learning, or a noncredit course. The reference
 * publisher owns the Program category; neither a Site name nor a learner's
 * grade range determines whether a Program is a school.
 */
export function isSchoolYearAcademyReference(
  item: Pick<BlueprintReferenceCatalogItem, "kind" | "category">,
): boolean {
  return item.kind === "program_model" && item.category === "core";
}

export function schoolYearBandForInterest(id: string): SchoolYearGradeBand | null {
  return id === "grades-6-8" || id === "grades-9-12" ? id : null;
}

function gradeNumber(value: string): number | null {
  const match = /^(?:grade\s*)?(\d{1,2})$/i.exec(value.trim());
  const number = match ? Number(match[1]) : NaN;
  return Number.isInteger(number) && number >= 1 && number <= 12 ? number : null;
}

/** Only *complete* coverage of the published academy's grade span unlocks
 * its selection. A 9–12 authorization cannot enable a 6–12 academy.
 * Published grade_range metadata is advisory to the chooser; operating
 * gates still independently check jurisdiction, provider and enrollment.
 */
export function academyReferenceMayBeSelected(
  item: Pick<BlueprintReferenceCatalogItem,
    "kind" | "category" | "academicGradeRange">,
  allowed: SchoolYearAvailability,
): boolean {
  if (!isSchoolYearAcademyReference(item)) return true;
  const min = item.academicGradeRange ? gradeNumber(item.academicGradeRange.min) : null;
  const max = item.academicGradeRange ? gradeNumber(item.academicGradeRange.max) : null;
  if (min == null || max == null || min > max) return false;
  if (min <= 8 && max >= 6 && !allowed["grades-6-8"]) return false;
  if (min <= 12 && max >= 9 && !allowed["grades-9-12"]) return false;
  return true;
}

export function schoolYearInterestMayBeSelected(
  id: string,
  allowed: SchoolYearAvailability,
): boolean {
  const band = schoolYearBandForInterest(id);
  return !band || allowed[band];
}

/** Existing Site intent is retained until an explicit edit; disabling a
 * selectable option must never silently revoke a prior Program or offering.
 */
export function newlyRestrictedSiteIntent(
  proposed: Pick<SiteProgramsAudiencesV61, "interestIds" | "programCodes">,
  previous: Pick<SiteProgramsAudiencesV61, "interestIds" | "programCodes">,
  catalog: readonly BlueprintReferenceCatalogItem[],
  allowed: SchoolYearAvailability,
): string[] {
  const previouslySelected = new Set(previous.interestIds);
  const previouslyChosen = new Set(previous.programCodes ?? []);
  const programs = new Map(catalog.map(item => [item.code, item]));
  return [
    ...proposed.interestIds
      .filter(id => !previouslySelected.has(id) && !schoolYearInterestMayBeSelected(id, allowed)),
    ...(proposed.programCodes ?? [])
      .filter(code => !previouslyChosen.has(code))
      .filter(code => {
        const published = programs.get(code);
        return !!published && !academyReferenceMayBeSelected(published, allowed);
      }),
  ];
}
