import { z } from "zod";

/** The five canonical institutional-opening evidence requirements. */
export const schoolOpeningEvidenceCategories = [
  "school_opening_jurisdiction_authority",
  "school_opening_facility_approval",
  "school_opening_safeguarding_reporting_procedure",
  "school_opening_emergency_response",
  "school_opening_authorized_pickup",
] as const;

export type SchoolOpeningEvidenceCategory = typeof schoolOpeningEvidenceCategories[number];
export type SchoolOpeningEvidenceStatus = "missing" | "pending" | "rejected" | "expired" | "approved" | "invalid";

export const schoolOpeningEvidenceLabels: Record<SchoolOpeningEvidenceCategory, string> = {
  school_opening_jurisdiction_authority: "Legal and jurisdiction opening authority",
  school_opening_facility_approval: "Facility approval",
  school_opening_safeguarding_reporting_procedure: "Safeguarding and mandated-reporting procedure",
  school_opening_emergency_response: "Emergency response procedure",
  school_opening_authorized_pickup: "Authorized pickup and custody procedure",
};

export const schoolOpeningEvidenceCategorySchema = z.enum(schoolOpeningEvidenceCategories);
const file = {
  fileName: z.string().trim().min(1).max(150),
  mimeType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
  size: z.number().int().min(16).max(10 * 1024 * 1024),
};

export const beginSchoolOpeningEvidenceUploadSchema = z.object({
  programId: z.string().uuid(),
  configurationId: z.string().uuid(),
  expectedVersion: z.number().int().positive(),
  category: schoolOpeningEvidenceCategorySchema,
  expiresAt: z.string().datetime({ offset: true }),
  ...file,
}).strict();

export const finishSchoolOpeningEvidenceUploadSchema = beginSchoolOpeningEvidenceUploadSchema.extend({
  key: z.string().regex(/^school-opening\/[a-f0-9-]{36}\/[a-f0-9-]{36}$/i),
}).strict();

export const reviewSchoolOpeningEvidenceSchema = z.object({
  programId: z.string().uuid(),
  documentId: z.string().uuid(),
  expectedVersion: z.number().int().positive(),
  decision: z.enum(["approve", "reject"]),
  reason: z.string().trim().min(10).max(2000),
}).strict();

export const schoolOpeningEvidenceDownloadSchema = z.object({
  programId: z.string().uuid(),
  documentId: z.string().uuid(),
}).strict();

export function schoolOpeningEvidenceStatus(
  document: {
    expiresAt: Date | null;
    verifiedAt: Date | null;
    metadata: Record<string, unknown>;
  } | null,
  now: Date,
): SchoolOpeningEvidenceStatus {
  if (!document) return "missing";
  if (document.expiresAt && document.expiresAt <= now) return "expired";
  if (document.metadata.reviewStatus === "rejected") return "rejected";
  if (document.verifiedAt && document.verifiedAt <= now &&
      (document.metadata.reviewStatus === undefined || document.metadata.reviewStatus === "approved")) {
    return "approved";
  }
  return "pending";
}

export function schoolOpeningEvidenceNextAction(status: SchoolOpeningEvidenceStatus): {
  owner: "Church registrar" | "CAN opening reviewer";
  action: string;
} {
  if (status === "pending") return {
    owner: "CAN opening reviewer",
    action: "Independently review this submitted version; the uploader and final opening approver must be different people.",
  };
  if (status === "approved") return {
    owner: "CAN opening reviewer",
    action: "No evidence action is due. Opening still rechecks agreements, configuration, staffing and current evidence.",
  };
  if (status === "rejected") return {
    owner: "Church registrar",
    action: "Read the rejection reason, correct the source document and upload a new version. Previous versions remain preserved.",
  };
  if (status === "expired") return {
    owner: "Church registrar",
    action: "Obtain current evidence and upload a new version with its actual future expiry.",
  };
  if (status === "invalid") return {
    owner: "Church registrar",
    action: "Upload the evidence again against the current school configuration and exact Site, host, CAN institution and jurisdiction.",
  };
  return {
    owner: "Church registrar",
    action: "Upload the required document for independent CAN review. Opening remains blocked until it is verified.",
  };
}
