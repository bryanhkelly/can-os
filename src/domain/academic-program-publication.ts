import { isExtendedLearningType, type ProgramType } from "./program-offerings";

export type PublicAcademicProgram = {
  programId: string;
  title: string;
  summary: string;
  typeLabel: string;
  grades: { min: string; max: string };
  delivery: { onsite: boolean; asynchronous: boolean; liveOnline: boolean; onsiteDaysPerWeek: number | null };
  availability: "planned" | "operating";
};

export function isAcademicMarketingType(type: ProgramType): boolean {
  return !isExtendedLearningType(type);
}

export function publishableAcademicProgram(input: {
  type: ProgramType;
  status: string;
  siteId: string | null;
  organizationId: string;
  siteOrganizationId: string;
  publicationSiteId: string;
}): boolean {
  return isAcademicMarketingType(input.type) &&
    !["paused", "closed"].includes(input.status) &&
    !!input.siteId && input.siteId === input.publicationSiteId &&
    input.organizationId === input.siteOrganizationId;
}

/** Public copy is approved separately from the mutable internal Program. */
export function publicAcademicProgram(row: {
  programId: string;
  title: string;
  summary: string;
  type: ProgramType;
  status: string;
  gradeRange: { min: string; max: string };
  deliveryModel: {
    onsite: boolean;
    asynchronous: boolean;
    liveOnline: boolean;
    onsiteDaysPerWeek: number | null;
  };
}): PublicAcademicProgram {
  const labels: Record<ProgramType, string> = {
    church_hosted_academy: "Church-hosted academy",
    high_school_extension: "High school extension",
    full_school: "School program",
    microschool: "Microschool",
    hybrid_program: "Hybrid learning program",
    homeschool_cohort: "Homeschool learning cohort",
    summer_enrichment: "Summer enrichment",
    summer_program: "Summer program",
    after_school_enrichment: "After-school enrichment",
  };
  return {
    programId: row.programId,
    title: row.title,
    summary: row.summary,
    typeLabel: labels[row.type],
    grades: { min: row.gradeRange.min, max: row.gradeRange.max },
    delivery: { ...row.deliveryModel },
    // Marketing approval does NOT assert admissions readiness.
    availability: row.status === "active" ? "operating" : "planned",
  };
}

/** Publish from reviewed, canonical Program facts; no accreditation, diploma
 * promises, admission date or institutional authority can be invented here. */
export function academicMarketingSnapshot(input: {
  name: string;
  gradeRange: { min: string; max: string };
  deliveryModel: {
    onsite?: boolean; asynchronous?: boolean;
    liveOnline?: boolean; onsiteDaysPerWeek?: number;
  };
}, summary: string) {
  const title = input.name.trim();
  const text = summary.trim();
  if (title.length < 3 || title.length > 150) throw new Error("Program title must be 3–150 characters");
  if (text.length < 30 || text.length > 2000) throw new Error("Public program summary must be 30–2000 characters");
  if (/[<>]/.test(text)) throw new Error("Use plain text; HTML is not allowed");
  const days = input.deliveryModel.onsiteDaysPerWeek;
  return {
    title,
    summary: text,
    gradeRange: { ...input.gradeRange },
    deliveryModel: {
      onsite: input.deliveryModel.onsite === true,
      asynchronous: input.deliveryModel.asynchronous === true,
      liveOnline: input.deliveryModel.liveOnline === true,
      onsiteDaysPerWeek: typeof days === "number" && Number.isInteger(days) && days >= 0 && days <= 7 ? days : null,
    },
  };
}
