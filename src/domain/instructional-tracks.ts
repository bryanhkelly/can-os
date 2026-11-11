/** Pure content/eligibility rules. These predicates do not authorize a person or a request. */
export const trackReviewCriteria = ["academic", "rights", "accessibility", "safety"] as const;
export type TrackReviewCriterion = typeof trackReviewCriteria[number];
export type TrackReviewDecision = {
  criterion: TrackReviewCriterion;
  decision: "approved" | "changes_requested" | "rejected";
  manifestHash: string;
  reviewerPersonId: string;
};

export type StudentPracticeBody = {
  instructions: string;
  prompts: { key: string; text: string }[];
};

// Reject unknown keys rather than filtering answers out of an arbitrary JSON blob.
export function parseStudentPracticeBody(input: unknown): StudentPracticeBody {
  function object(value: unknown, keys: string[]): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some(key => !keys.includes(key))) throw new Error("Invalid student practice definition.");
    return value as Record<string, unknown>;
  }
  function boundedText(value: unknown, max: number): string {
    if (typeof value !== "string" || !value.trim() || value.length > max)
      throw new Error("Invalid practice text.");
    return value;
  }
  const body = object(input, ["instructions", "prompts"]);
  if (!Array.isArray(body.prompts) || body.prompts.length > 100) throw new Error("Invalid practice prompts.");
  const prompts = body.prompts.map(value => {
    const prompt = object(value, ["key", "text"]);
    return { key: boundedText(prompt.key, 100), text: boundedText(prompt.text, 5000) };
  });
  if (new Set(prompts.map(prompt => prompt.key)).size !== prompts.length) throw new Error("Duplicate practice prompt key.");
  return { instructions: boundedText(body.instructions, 20000), prompts };
}

export type TrackPublicationContext = {
  status: string;
  sourceStatus: string;
  courseTemplateId: string;
  sourceCourseTemplateId: string;
  courseTemplateVersionId: string;
  sourceVersionId: string;
  authorPersonId: string;
  presenterPersonId: string;
  manifestHash: string;
  computedManifestHash: string;
  requiredLessonIds: string[];
  allLessonIds: string[];
  primaryLessonIds: string[];
  practiceLessonIds: string[];
  rightsEvidencePresent: boolean;
  rightsExpiresAt: Date | null;
  resourcesEligible: boolean;
  reviews: TrackReviewDecision[]; // Latest decision per criterion from a locked transaction.
  now: Date;
};

export function assertTrackPublishable(input: TrackPublicationContext): void {
  if (!Number.isFinite(input.now.getTime())) throw new Error("Valid publication time required.");
  if (input.status !== "approved" || input.sourceStatus !== "published") throw new Error("Approved track and published source required.");
  if (input.courseTemplateId !== input.sourceCourseTemplateId || input.courseTemplateVersionId !== input.sourceVersionId)
    throw new Error("Exact course release required.");
  if (!/^[a-f0-9]{64}$/.test(input.manifestHash) || input.manifestHash !== input.computedManifestHash)
    throw new Error("Track manifest changed; independent review required.");
  if (!input.rightsEvidencePresent || !input.resourcesEligible ||
    (input.rightsExpiresAt !== null && (!Number.isFinite(input.rightsExpiresAt.getTime()) || input.rightsExpiresAt <= input.now)))
    throw new Error("Current rights and eligible accessible resources required.");
  const allLessons = new Set(input.allLessonIds);
  const primary = new Set(input.primaryLessonIds);
  if (!input.requiredLessonIds.length || input.requiredLessonIds.some(id => !allLessons.has(id) || !primary.has(id)) ||
    [...input.primaryLessonIds, ...input.practiceLessonIds].some(id => !allLessons.has(id)))
    throw new Error("Complete canonical lesson coverage required.");
  for (const criterion of trackReviewCriteria) {
    const decisions = input.reviews.filter(review => review.criterion === criterion);
    const review = decisions[0];
    if (decisions.length !== 1 || !review || !review.reviewerPersonId || review.decision !== "approved" || review.manifestHash !== input.manifestHash ||
      review.reviewerPersonId === input.authorPersonId || review.reviewerPersonId === input.presenterPersonId)
      throw new Error(`Independent current ${criterion} approval required.`);
  }
}

export type TrackRestriction = {
  kind: "routine_retirement" | "urgent_rights" | "urgent_safety";
  effectiveAt: Date;
  legacyAccessUntil: Date | null;
};

/** Rights/withdrawal predicate only; Program, enrollment and actor authorization remain mandatory. */
export function trackContentAvailable(input: {
  status: string; rightsExpiresAt: Date | null; now: Date;
  selectionCreatedAt: Date | null; restrictions: TrackRestriction[];
}): boolean {
  if (!Number.isFinite(input.now.getTime()) || !["published", "retired"].includes(input.status)) return false;
  if (input.selectionCreatedAt !== null && !Number.isFinite(input.selectionCreatedAt.getTime())) return false;
  if (input.rightsExpiresAt !== null && (!Number.isFinite(input.rightsExpiresAt.getTime()) || input.rightsExpiresAt <= input.now)) return false;
  if (input.status === "retired" && input.selectionCreatedAt === null) return false;
  for (const restriction of input.restrictions) {
    if (!Number.isFinite(restriction.effectiveAt.getTime())) return false;
    if (restriction.effectiveAt > input.now) continue;
    if (restriction.kind !== "routine_retirement" || !input.selectionCreatedAt ||
      input.selectionCreatedAt >= restriction.effectiveAt || !restriction.legacyAccessUntil ||
      !Number.isFinite(restriction.legacyAccessUntil.getTime()) || restriction.legacyAccessUntil <= input.now) return false;
  }
  // A retired release without an explicit legacy policy is unavailable.
  return input.status !== "retired" || input.restrictions.some(restriction =>
    restriction.kind === "routine_retirement" && restriction.effectiveAt <= input.now);
}

/** Call under the enrollment/selection transaction lock; never infer current selection from client input. */
export function assertCurrentPracticeSelection(input: {
  expectedRevision: number; currentRevision: number;
  currentTrackVersionId: string; activityTrackVersionId: string;
  sectionCourseVersionId: string; trackCourseVersionId: string;
}): void {
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision <= 0 || input.expectedRevision !== input.currentRevision)
    throw new Error("Recorded teacher selection changed. Reload before submitting practice.");
  if (input.currentTrackVersionId !== input.activityTrackVersionId || input.sectionCourseVersionId !== input.trackCourseVersionId)
    throw new Error("Practice does not belong to the current approved course and track.");
}
