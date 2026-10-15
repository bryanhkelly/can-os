export type CredentialRecord = {
  credentialType: string;
  verificationStatus: "unverified" | "pending" | "verified" | "rejected" | "revoked";
  issuedAt?: Date | null;
  expiresAt?: Date | null;
};
export type RequirementRule = {
  code: string;
  requiredCredentialTypes: string[];
  mandatory: boolean;
};
export type RequirementResult = { code: string; status: "met" | "missing" | "pending" | "expired"; blocking: boolean };
export function credentialState(record: CredentialRecord, asOf: Date): "verified" | "expired" | "pending" {
  if (record.expiresAt && record.expiresAt.getTime() <= asOf.getTime()) return "expired";
  if (record.issuedAt && record.issuedAt.getTime() > asOf.getTime()) return "pending";
  return record.verificationStatus === "verified" ? "verified" : "pending";
}
export function evaluatePersonRequirements(requirements: RequirementRule[], credentials: CredentialRecord[], asOf: Date): RequirementResult[] {
  return requirements.map(rule => {
    const statuses = rule.requiredCredentialTypes.map(type => {
      const matches = credentials.filter(c => c.credentialType === type);
      if (!matches.length) return "missing";
      if (matches.some(c => credentialState(c, asOf) === "verified")) return "met";
      if (matches.every(c => credentialState(c, asOf) === "expired")) return "expired";
      return "pending";
    });
    const status: RequirementResult["status"] = statuses.includes("missing") ? "missing" : statuses.includes("expired") ? "expired" : statuses.includes("pending") ? "pending" : "met";
    return { code: rule.code, status, blocking: rule.mandatory && status !== "met" };
  });
}
export type SchoolConfiguration = {
  deploymentModel: "church_hosted" | "school_extension" | "microschool" | "consortium" | "network";
  grades: { min: string; max: string };
  delivery: { onsite: boolean; asynchronous: boolean; liveOnline: boolean; onsiteDaysPerWeek?: number };
  responsibilities: Record<string, "host" | "can" | "partner">;
  services: string[];
};
export function validateSchoolConfiguration(configuration: SchoolConfiguration): string[] {
  const errors: string[] = [];
  const { delivery, grades, responsibilities } = configuration;
  if (!delivery.onsite && !delivery.asynchronous && !delivery.liveOnline) errors.push("At least one instruction delivery mode is required");
  if (delivery.onsiteDaysPerWeek !== undefined && (!delivery.onsite || !Number.isInteger(delivery.onsiteDaysPerWeek) || delivery.onsiteDaysPerWeek < 0 || delivery.onsiteDaysPerWeek > 7)) errors.push("Onsite days must be a whole number from zero to seven, with onsite enabled");
  if (!grades.min.trim() || !grades.max.trim()) errors.push("Grade range is required");
  for (const key of ["instruction", "supervision", "attendance", "safeguarding", "records"]) if (!responsibilities[key]) errors.push(`Responsibility owner required: ${key}`);
  return errors;
}
