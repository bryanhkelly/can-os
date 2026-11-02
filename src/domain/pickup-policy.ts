export const pickupDenialReasons = [
  "not_authorized",
  "identity_not_verified",
  "custody_dispute",
  "emergency_hold",
  "expired_authorization",
] as const;

export type PickupDenialReason = (typeof pickupDenialReasons)[number];
export type PickupHoldKind = "disputed_custody" | "emergency";

export function normalizedLegalName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

/** Pure final decision shared by command validation and focused policy tests. */
export function evaluatePickupRelease(input: {
  attendanceStatus: string;
  alreadyReleased: boolean;
  authorization: {
    status: string;
    startsOn: string;
    expiresOn: string | null;
    identityVerificationMethod: string;
    expectedLegalName: string;
  } | null;
  activeHoldKinds: readonly PickupHoldKind[];
  date: string;
  identityVerified: boolean;
  identityVerificationMethod: string;
  verifiedLegalName: string;
  handoffEvidence: string;
}): { allowed: true } | {
  allowed: false;
  reason: PickupDenialReason | "not_present" | "already_released" | "handoff_evidence_required";
} {
  if (!['present', 'tardy'].includes(input.attendanceStatus))
    return { allowed: false, reason: "not_present" };
  if (input.alreadyReleased) return { allowed: false, reason: "already_released" };
  if (input.activeHoldKinds.includes("disputed_custody"))
    return { allowed: false, reason: "custody_dispute" };
  if (input.activeHoldKinds.includes("emergency"))
    return { allowed: false, reason: "emergency_hold" };
  const authorization = input.authorization;
  if (!authorization || authorization.status !== "active" ||
      input.date < authorization.startsOn)
    return { allowed: false, reason: "not_authorized" };
  if (authorization.expiresOn && input.date > authorization.expiresOn)
    return { allowed: false, reason: "expired_authorization" };
  if (!input.identityVerified ||
      input.identityVerificationMethod !== authorization.identityVerificationMethod ||
      normalizedLegalName(input.verifiedLegalName) !==
        normalizedLegalName(authorization.expectedLegalName))
    return { allowed: false, reason: "identity_not_verified" };
  if (input.handoffEvidence.trim().length < 10)
    return { allowed: false, reason: "handoff_evidence_required" };
  return { allowed: true };
}
