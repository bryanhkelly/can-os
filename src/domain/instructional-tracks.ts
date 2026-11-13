export const instructionalTrackReviewKinds = [
  "academic",
  "rights",
  "accessibility",
  "coverage",
  "safeguarding",
] as const;

export type InstructionalTrackReviewKind = (typeof instructionalTrackReviewKinds)[number];
export type InstructionalTrackPolicyDecision =
  | { status: "unknown"; reason: "missing_policy" }
  | {
      status: "denied";
      reason:
        | "invalid_time"
        | "wrong_scope"
        | "unpublished"
        | "not_yet_effective"
        | "expired"
        | "withdrawn"
        | "delivery_disabled"
        | "practice_disabled"
        | "choice_disabled"
        | "selector_not_allowed";
      policyVersionId: string;
    }
  | { status: "allowed"; policyVersionId: string };

export type InstructionalTrackPolicyContext = {
  policyVersionId: string | null;
  lifecycle: "draft" | "published" | null;
  deploymentId: string;
  adoptionId: string;
  offeringVersionId: string;
  courseVersionId: string;
  policyDeploymentId: string | null;
  policyAdoptionId: string | null;
  policyOfferingVersionId: string | null;
  policyCourseVersionId: string | null;
  effectiveFrom: Date | null;
  effectiveThrough: Date | null;
  withdrawnAt: Date | null;
  deliveryEnabled: boolean;
  practiceEnabled: boolean;
  studentChoiceEnabled: boolean;
  selectionPolicy: "student" | "guardian";
  selectionSource: "learner" | "guardian" | "institutional_default" | "authorized_assistance";
  now: Date;
  action: "delivery" | "practice" | "student_choice";
};

/** Evaluates policy eligibility only; actor authorization and current content rights remain separate. */
export function evaluateInstructionalTrackPolicy(
  input: InstructionalTrackPolicyContext,
): InstructionalTrackPolicyDecision {
  const policyVersionId = input.policyVersionId;
  if (!policyVersionId) return { status: "unknown", reason: "missing_policy" };
  const denied = (
    reason: Extract<InstructionalTrackPolicyDecision, { status: "denied" }>["reason"],
  ): InstructionalTrackPolicyDecision => ({
    status: "denied",
    reason,
    policyVersionId,
  });
  if (
    !Number.isFinite(input.now.getTime()) ||
    (input.effectiveFrom !== null && !Number.isFinite(input.effectiveFrom.getTime())) ||
    (input.effectiveThrough !== null && !Number.isFinite(input.effectiveThrough.getTime())) ||
    (input.withdrawnAt !== null && !Number.isFinite(input.withdrawnAt.getTime()))
  ) {
    return denied("invalid_time");
  }
  if (
    input.policyDeploymentId !== input.deploymentId ||
    input.policyAdoptionId !== input.adoptionId ||
    input.policyOfferingVersionId !== input.offeringVersionId ||
    input.policyCourseVersionId !== input.courseVersionId
  ) {
    return denied("wrong_scope");
  }
  if (input.lifecycle !== "published") return denied("unpublished");
  if (!input.effectiveFrom || input.effectiveFrom > input.now) return denied("not_yet_effective");
  if (input.effectiveThrough && input.effectiveThrough <= input.now) return denied("expired");
  if (input.withdrawnAt && input.withdrawnAt <= input.now) return denied("withdrawn");
  if (input.action === "delivery" && !input.deliveryEnabled) return denied("delivery_disabled");
  if (input.action === "practice" && (!input.deliveryEnabled || !input.practiceEnabled)) {
    return denied("practice_disabled");
  }
  if (
    input.action === "student_choice" &&
    !input.deliveryEnabled
  ) {
    return denied("choice_disabled");
  }
  if (
    input.action === "student_choice" &&
    (input.selectionSource === "learner" ||
      input.selectionSource === "authorized_assistance") &&
    !input.studentChoiceEnabled
  ) {
    return denied("choice_disabled");
  }
  if (
    input.action === "student_choice" &&
    ((input.selectionSource === "guardian" && input.selectionPolicy !== "guardian") ||
      (input.selectionSource !== "guardian" &&
        input.selectionSource !== "institutional_default" &&
        input.selectionPolicy !== "student"))
  ) {
    return denied("selector_not_allowed");
  }
  return { status: "allowed", policyVersionId };
}

export type TrackRestriction = {
  kind: "routine_retirement" | "urgent_rights" | "urgent_safety";
  effectiveAt: Date;
  legacyAccessUntil: Date | null;
};

/** Rights and withdrawal predicate only; it does not authorize an actor or a course attempt. */
export function trackContentAvailable(input: {
  lifecycle: "draft" | "published" | "retired";
  rightsExpireAt: Date | null;
  now: Date;
  selectionCreatedAt: Date | null;
  restrictions: TrackRestriction[];
}): boolean {
  if (!Number.isFinite(input.now.getTime()) || input.lifecycle === "draft") return false;
  if (
    input.rightsExpireAt !== null &&
    (!Number.isFinite(input.rightsExpireAt.getTime()) || input.rightsExpireAt <= input.now)
  ) {
    return false;
  }
  if (
    input.selectionCreatedAt !== null &&
    !Number.isFinite(input.selectionCreatedAt.getTime())
  ) {
    return false;
  }
  if (input.lifecycle === "retired" && input.selectionCreatedAt === null) return false;
  for (const restriction of input.restrictions) {
    if (
      !Number.isFinite(restriction.effectiveAt.getTime()) ||
      (restriction.legacyAccessUntil !== null &&
        !Number.isFinite(restriction.legacyAccessUntil.getTime()))
    ) {
      return false;
    }
    if (restriction.effectiveAt > input.now) continue;
    if (
      restriction.kind !== "routine_retirement" ||
      !input.selectionCreatedAt ||
      input.selectionCreatedAt >= restriction.effectiveAt ||
      !restriction.legacyAccessUntil ||
      restriction.legacyAccessUntil <= input.now
    ) {
      return false;
    }
  }
  return (
    input.lifecycle !== "retired" ||
    input.restrictions.some(
      (restriction) =>
        restriction.kind === "routine_retirement" && restriction.effectiveAt <= input.now,
    )
  );
}

export function isVerifiedEvidenceCurrent(input: {
  verifiedAt: Date | null;
  verifiedByPersonId: string | null;
  validFrom: string | null;
  validThrough: string | null;
  at: Date;
}): boolean {
  if (
    !input.verifiedAt ||
    !input.verifiedByPersonId ||
    !Number.isFinite(input.verifiedAt.getTime()) ||
    !Number.isFinite(input.at.getTime()) ||
    input.verifiedAt > input.at
  ) {
    return false;
  }
  const dateKey = input.at.toISOString().slice(0, 10);
  const validDate = (value: string): boolean =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00.000Z`)) &&
    new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
  if (
    (input.validFrom !== null &&
      (!validDate(input.validFrom) || input.validFrom > dateKey)) ||
    (input.validThrough !== null &&
      (!validDate(input.validThrough) || input.validThrough < dateKey))
  ) {
    return false;
  }
  return true;
}

export type TrackManifestUsageKind =
  | "required_instruction"
  | "supporting"
  | "accessibility"
  | "assessment";

export function instructionalTrackAssetStorageKey(assetVersionId: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(assetVersionId)) {
    throw new Error("Invalid instructional asset version identifier.");
  }
  return `learning/instructional-track/${assetVersionId.toLowerCase()}`;
}

export function buildTrackManifestUsages(input: {
  presentations: readonly {
    assetVersionId: string;
    presentationKind: "primary" | "worked_example" | "supplement" | "alternate_language";
  }[];
  materials: readonly {
    assetVersionId: string | null;
    materialKind: "instruction" | "practice" | "reference";
  }[];
}): Array<{ assetVersionId: string; usageKind: TrackManifestUsageKind }> {
  const usages = new Map<string, Set<TrackManifestUsageKind>>();
  const add = (assetVersionId: string, usageKind: TrackManifestUsageKind) => {
    const kinds = usages.get(assetVersionId) ?? new Set<TrackManifestUsageKind>();
    kinds.add(usageKind);
    usages.set(assetVersionId, kinds);
  };
  for (const presentation of input.presentations) {
    add(
      presentation.assetVersionId,
      presentation.presentationKind === "primary"
        ? "required_instruction"
        : presentation.presentationKind === "alternate_language"
          ? "accessibility"
          : "supporting",
    );
  }
  for (const material of input.materials) {
    if (material.assetVersionId) {
      add(
        material.assetVersionId,
        material.materialKind === "instruction" ? "required_instruction" : "supporting",
      );
    }
  }
  return [...usages.entries()]
    .flatMap(([assetVersionId, kinds]) =>
      [...kinds].map((usageKind) => ({ assetVersionId, usageKind })),
    )
    .sort((left, right) =>
      `${left.assetVersionId}:${left.usageKind}`.localeCompare(
        `${right.assetVersionId}:${right.usageKind}`,
      ),
    );
}

export function assertCurrentPracticeSelection(input: {
  expectedRevision: number;
  currentRevision: number;
  currentTrackVersionId: string;
  submittedTrackVersionId: string;
  currentCourseVersionId: string;
  submittedCourseVersionId: string;
}): void {
  if (
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision <= 0 ||
    input.expectedRevision !== input.currentRevision
  ) {
    throw new Error("Recorded teacher selection changed. Reload before submitting practice.");
  }
  if (
    input.currentTrackVersionId !== input.submittedTrackVersionId ||
    input.currentCourseVersionId !== input.submittedCourseVersionId
  ) {
    throw new Error("Practice does not belong to the current approved course and track.");
  }
}

export type InstructionalTrackSelectionDecision = "reuse" | "create" | "switch_denied";

/**
 * A policy version change requires a new selection receipt even when the
 * learner keeps the same presenter. It is not a forbidden presenter switch.
 */
export function decideInstructionalTrackSelection(input: {
  current: { trackVersionId: string; policyVersionId: string } | null;
  lastTrackVersionId: string | null;
  requestedTrackVersionId: string;
  policyVersionId: string;
  allowSwitching: boolean;
}): InstructionalTrackSelectionDecision {
  if (
    input.current?.trackVersionId === input.requestedTrackVersionId &&
    input.current.policyVersionId === input.policyVersionId
  ) {
    return "reuse";
  }
  const previousTrackVersionId = input.current?.trackVersionId ?? input.lastTrackVersionId;
  if (
    previousTrackVersionId &&
    previousTrackVersionId !== input.requestedTrackVersionId &&
    !input.allowSwitching
  ) {
    return "switch_denied";
  }
  return "create";
}

export type StudentPracticeDefinition = {
  instructions: string;
  prompts: { key: string; text: string }[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function boundedText(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximum;
}

/** Produces the student-visible practice definition without leaking answer-key properties. */
export function parseStudentPracticeDefinition(input: unknown): StudentPracticeDefinition {
  if (!isRecord(input) || !hasOnlyKeys(input, ["instructions", "prompts"])) {
    throw new Error("Invalid student practice definition.");
  }
  if (!boundedText(input.instructions, 20_000)) throw new Error("Invalid practice instructions.");
  if (!Array.isArray(input.prompts) || input.prompts.length > 100) {
    throw new Error("Invalid practice prompts.");
  }
  const prompts = input.prompts.map((value) => {
    if (!isRecord(value) || !hasOnlyKeys(value, ["key", "text"])) {
      throw new Error("Invalid practice prompt.");
    }
    if (!boundedText(value.key, 100) || !boundedText(value.text, 5_000)) {
      throw new Error("Invalid practice prompt text.");
    }
    return { key: value.key, text: value.text };
  });
  if (new Set(prompts.map((prompt) => prompt.key)).size !== prompts.length) {
    throw new Error("Duplicate practice prompt key.");
  }
  return { instructions: input.instructions, prompts };
}
