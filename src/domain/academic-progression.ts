/**
 * Conservative academic progression REVIEW, not an authorized graduation,
 * transcript or diploma decision. All requirement inputs must be reviewed and
 * versioned by a qualified school operator in a later canonical workflow.
 */
export type ProgressionRequirement = {
  category: string;
  minimumUnits: number;
};
export type AcademicCourseEvidence = {
  category: string;
  units: number | null;
  finalized: boolean;
  approved: boolean;
  source: "institution" | "transfer";
};

export function assessAcademicProgression(input: {
  requirements: readonly ProgressionRequirement[];
  courses: readonly AcademicCourseEvidence[];
}) {
  const categories = new Set<string>();
  for (const required of input.requirements) {
    if (!required.category.trim() || categories.has(required.category) ||
        !Number.isFinite(required.minimumUnits) || required.minimumUnits < 0) {
      throw new Error("Invalid academic requirement configuration");
    }
    categories.add(required.category);
  }
  for (const course of input.courses) {
    if (!course.category.trim() ||
        (course.units !== null && (!Number.isFinite(course.units) || course.units < 0))) {
      throw new Error("Invalid academic credit evidence");
    }
  }
  const missingOrPendingCredit = input.courses.filter(c =>
    c.units === null || !c.finalized || !c.approved);
  const totals = input.requirements.map(required => {
    const counted = input.courses.filter(c =>
      c.category === required.category && c.finalized && c.approved && c.units !== null);
    const recordedUnits = counted.reduce((sum,c) => sum + (c.units ?? 0), 0);
    return {
      category: required.category, minimumUnits: required.minimumUnits,
      recordedUnits, shortfallUnits: Math.max(0, required.minimumUnits - recordedUnits),
    };
  });
  const shortfalls = totals.filter(t => t.shortfallUnits > 0);
  return {
    categories: totals,
    incompleteCategories: shortfalls.map(t => t.category),
    pendingEvidenceCount: missingOrPendingCredit.length,
    reviewStatus: !input.requirements.length || missingOrPendingCredit.length
      ? "review_required" as const
      : shortfalls.length ? "requirements_incomplete" as const : "provisionally_met" as const,
    diplomaAuthorized: false as const,
    note: "Provisional arithmetic only. An authorized school review, valid institution/cohort rules, transfer approvals, and separate diploma issuance are required.",
  };
}
