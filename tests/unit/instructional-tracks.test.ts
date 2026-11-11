import { describe, expect, it } from "vitest";
import { assertCurrentPracticeSelection, assertTrackPublishable, parseStudentPracticeBody,
  trackContentAvailable, trackReviewCriteria, type TrackPublicationContext } from "../../src/domain/instructional-tracks";
import { hashInstructionalTrackManifest } from "../../src/modules/learning/instructional-track-manifest.server";

const hash = "a".repeat(64);
const now = new Date("2026-11-10T12:00:00Z");
const later = new Date("2026-12-10T12:00:00Z");
const earlier = new Date("2026-10-10T12:00:00Z");
const publishable = (): TrackPublicationContext => ({
  status: "approved", sourceStatus: "published", courseTemplateId: "course", sourceCourseTemplateId: "course",
  courseTemplateVersionId: "v1", sourceVersionId: "v1", authorPersonId: "author", presenterPersonId: "presenter",
  manifestHash: hash, computedManifestHash: hash, requiredLessonIds: ["l1", "l2"], allLessonIds: ["l1", "l2"],
  primaryLessonIds: ["l1", "l2"], practiceLessonIds: ["l1"], rightsEvidencePresent: true,
  rightsExpiresAt: later, resourcesEligible: true, now,
  reviews: trackReviewCriteria.map(criterion => ({ criterion, decision: "approved", manifestHash: hash, reviewerPersonId: "reviewer" })),
});

describe("instructional track publication", () => {
  it("accepts independent approval of complete instruction and practice", () => expect(() => assertTrackPublishable(publishable())).not.toThrow());
  it.each([
    { status: "draft" }, { sourceStatus: "draft" }, { sourceVersionId: "v2" }, { sourceCourseTemplateId: "another-course" },
    { computedManifestHash: "b".repeat(64) }, { manifestHash: "unhashed" }, { requiredLessonIds: [] },
    { primaryLessonIds: ["l1"] }, { practiceLessonIds: ["unrelated-lesson"] },
    { rightsEvidencePresent: false }, { rightsExpiresAt: earlier }, { rightsExpiresAt: now },
    { rightsExpiresAt: new Date("invalid") }, { resourcesEligible: false }, { reviews: [] },
  ])("blocks incomplete, stale, mismatched or unlicensed publication %j", patch =>
    expect(() => assertTrackPublishable({ ...publishable(), ...patch })).toThrow());
  it.each(trackReviewCriteria)("requires the current independent %s decision", criterion => {
    for (const patch of [{ reviewerPersonId: "author" }, { reviewerPersonId: "presenter" },
      { manifestHash: "b".repeat(64) }, { decision: "rejected" as const }, { decision: "changes_requested" as const }]) {
      const input = publishable();
      input.reviews = input.reviews.map(review => review.criterion === criterion ? { ...review, ...patch } : review);
      expect(() => assertTrackPublishable(input)).toThrow();
    }
  });
});

describe("student-safe practice definition", () => {
  const body = { instructions: "Solve each problem.", prompts: [{ key: "q1", text: "What is 2 + 2?" }] };
  it("returns a new, explicitly shaped student definition", () => {
    expect(parseStudentPracticeBody(body)).toEqual(body);
    expect(parseStudentPracticeBody(body)).not.toBe(body);
  });
  it.each([ { ...body, solutions: ["4"] }, { ...body, answerKey: "4" },
    { ...body, prompts: [{ ...body.prompts[0], answer: "4" }] },
    { ...body, prompts: [body.prompts[0], body.prompts[0]] },
    { ...body, instructions: "x".repeat(20001) }, null,
  ])("rejects private fields, ambiguous prompts and oversized input %j", value => expect(() => parseStudentPracticeBody(value)).toThrow());
});

describe("teacher changes and content withdrawal", () => {
  const base = { status: "published", rightsExpiresAt: later, now, selectionCreatedAt: earlier, restrictions: [] };
  it("allows published content with current rights", () => expect(trackContentAvailable(base)).toBe(true));
  it("retains explicitly permitted legacy access after routine retirement", () => {
    const input = { ...base, status: "retired", restrictions: [{ kind: "routine_retirement" as const, effectiveAt: earlier, legacyAccessUntil: later }],
      selectionCreatedAt: new Date("2026-09-01T00:00:00Z") };
    expect(trackContentAvailable(input)).toBe(true);
    expect(trackContentAvailable({ ...input, selectionCreatedAt: null })).toBe(false);
    expect(trackContentAvailable({ ...input, now: later })).toBe(false);
  });
  it.each(["urgent_rights", "urgent_safety"] as const)("blocks %s despite an earlier retirement grace window", kind => {
    expect(trackContentAvailable({ ...base, restrictions: [
      { kind: "routine_retirement", effectiveAt: earlier, legacyAccessUntil: later },
      { kind, effectiveAt: now, legacyAccessUntil: null },
    ] })).toBe(false);
  });
  it("fails closed for retirement without policy and invalid or expired rights", () => {
    expect(trackContentAvailable({ ...base, status: "retired" })).toBe(false);
    expect(trackContentAvailable({ ...base, rightsExpiresAt: now })).toBe(false);
    expect(trackContentAvailable({ ...base, rightsExpiresAt: new Date("invalid") })).toBe(false);
  });
  it("rejects a late practice write after the student changed presenter", () => {
    const input = { expectedRevision: 1, currentRevision: 2, currentTrackVersionId: "B", activityTrackVersionId: "A",
      sectionCourseVersionId: "v1", trackCourseVersionId: "v1" };
    expect(() => assertCurrentPracticeSelection(input)).toThrow("selection changed");
    expect(() => assertCurrentPracticeSelection({ ...input, expectedRevision: 2 })).toThrow("current approved course");
    expect(() => assertCurrentPracticeSelection({ ...input, expectedRevision: 2, activityTrackVersionId: "B" })).not.toThrow();
  });
});

describe("whole-track manifest", () => {
  const manifest = { courseTemplateVersionId: "v1", presenterPersonId: "teacher", producerOrganizationId: "provider",
    lessons: [{ resourceId: "video" }], activities: [{ instructions: "Solve", activityKey: "a1" }],
    privateSolutions: [{ answer: "4" }], resourceSnapshots: [{ id: "video", url: "https://example.org/approved" }],
    rights: { license: "agreement", expires: "2027-01-01" } };
  it("hashes object keys deterministically", () => {
    expect(hashInstructionalTrackManifest(manifest)).toBe(hashInstructionalTrackManifest({ ...manifest,
      activities: [{ activityKey: "a1", instructions: "Solve" }] }));
  });
  it.each([ { privateSolutions: [{ answer: "5" }] }, { activities: [{ instructions: "Changed" }] },
    { resourceSnapshots: [{ id: "video", url: "https://example.org/changed" }] }, { rights: { license: "changed" } },
    { lessons: [{ resourceId: "other" }] }, { courseTemplateVersionId: "v2" },
  ])("invalidates approval when any protected manifest component changes %j", patch => {
    expect(hashInstructionalTrackManifest({ ...manifest, ...patch })).not.toBe(hashInstructionalTrackManifest(manifest));
  });
});
