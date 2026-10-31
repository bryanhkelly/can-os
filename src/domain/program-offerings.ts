export const programTypes = [
  "church_hosted_academy", "high_school_extension", "full_school",
  "microschool", "hybrid_program", "homeschool_cohort",
  "summer_enrichment", "summer_program", "after_school_enrichment",
] as const;
export type ProgramType = (typeof programTypes)[number];
export type ProgramCreditMode = "credit_bearing" | "non_credit";
export const programTypeLabels: Record<ProgramType, string> = {
  church_hosted_academy: "Church-hosted academy",
  high_school_extension: "High school extension",
  full_school: "Full school",
  microschool: "Microschool",
  hybrid_program: "Hybrid program",
  homeschool_cohort: "Homeschool cohort",
  summer_enrichment: "Summer camp / enrichment",
  summer_program: "Summer academic program",
  after_school_enrichment: "After-school enrichment",
};
export function isExtendedLearningType(type: ProgramType): boolean {
  return type === "summer_program" || type === "summer_enrichment" || type === "after_school_enrichment";
}
/** Avoid inventing a credit issuer for camps; credit mode is separate from Program type. */
export function resolveProgramCreditMode(input: {
  type: ProgramType;
  creditMode?: ProgramCreditMode;
  creditIssuingOrganizationId?: string | null;
}): ProgramCreditMode {
  const mode = input.creditMode ?? (isExtendedLearningType(input.type) ? "non_credit" : "credit_bearing");
  if (mode === "non_credit") {
    if (!isExtendedLearningType(input.type)) throw new Error("School-year programs must be credit-bearing");
    if (input.creditIssuingOrganizationId) throw new Error("Noncredit programs must not designate a credit issuer");
    return mode;
  }
  if (input.type === "summer_enrichment" || input.type === "after_school_enrichment") {
    throw new Error("Choose Summer academic program for credit-bearing summer instruction");
  }
  if (!input.creditIssuingOrganizationId) throw new Error("Credit-bearing programs require a credit-issuing organization");
  return mode;
}
