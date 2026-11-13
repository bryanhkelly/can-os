import { describe, expect, it } from "vitest";
import {
  instructionalCommandFingerprint,
} from "../../src/modules/learning/instructional-track-command.server";
import {
  createInstructionalTrackDraftSchema,
  saveInstructionalTrackDraftSchema,
} from "../../src/modules/learning/instructional-track-authoring.server";
import {
  instructionalTrackAssetDownloadSchema,
  recordFormativePracticeSchema,
} from "../../src/modules/learning/student-instructional-tracks.server";

describe("instructional track commands", () => {
  it("fingerprints object input independently of property order", () => {
    expect(instructionalCommandFingerprint({ a: 1, nested: { x: 2, y: 3 } }))
      .toBe(instructionalCommandFingerprint({ nested: { y: 3, x: 2 }, a: 1 }));
    expect(instructionalCommandFingerprint({ a: 1 })).not.toBe(
      instructionalCommandFingerprint({ a: 2 }),
    );
  });

  it("accepts only canonical attempt and asset-version identifiers for protected downloads", () => {
    const request = {
      courseAttemptId: "814910c9-dc18-428a-a400-9b73587cc27e",
      assetVersionId: "d9428888-122b-4b9a-bc4c-9a9b5b31f5d2",
    };
    expect(instructionalTrackAssetDownloadSchema.parse(request)).toEqual(request);
    expect(() => instructionalTrackAssetDownloadSchema.parse({
      ...request,
      storageReference: "learning/instructional-track/other",
    })).toThrow();
    expect(() => instructionalTrackAssetDownloadSchema.parse({
      ...request,
      assetVersionId: "../private-object",
    })).toThrow();
  });

  it("requires the exact course and instructor for each private practice submission", () => {
    const request = {
      requestId: "6a11e2ec-7aa0-4b6f-853e-180e90160614",
      courseAttemptId: "814910c9-dc18-428a-a400-9b73587cc27e",
      courseVersionId: "e35ffedc-7c99-4405-a1c3-37a32cc672ba",
      trackVersionId: "fa9fd6d3-0792-46de-a1e3-bf803179e447",
      materialId: "d9428888-122b-4b9a-bc4c-9a9b5b31f5d2",
      expectedRevision: 2,
      responses: [{ promptKey: "q1", response: "My working" }],
    };
    expect(recordFormativePracticeSchema.parse(request)).toEqual(request);
    expect(() => recordFormativePracticeSchema.parse({
      ...request,
      trackVersionId: undefined,
    })).toThrow();
    expect(() => recordFormativePracticeSchema.parse({
      ...request,
      courseVersionId: undefined,
    })).toThrow();
    expect(() => recordFormativePracticeSchema.parse({
      ...request,
      responses: [{ promptKey: "q1", response: "My working", answerKey: "private" }],
    })).toThrow();
  });

  it("validates authoring command scopes and bounded release content", () => {
    const requestId = "6a11e2ec-7aa0-4b6f-853e-180e90160614";
    const courseVersionId = "814910c9-dc18-428a-a400-9b73587cc27e";
    expect(createInstructionalTrackDraftSchema.parse({
      requestId,
      courseVersionId,
      title: "Foundations",
    })).toMatchObject({ requestId, courseVersionId, trackKind: "primary" });
    expect(() => createInstructionalTrackDraftSchema.parse({
      requestId,
      courseVersionId,
      title: "Foundations",
      isApproved: true,
    })).toThrow();

    const validSave = {
      requestId,
      trackVersionId: "fa9fd6d3-0792-46de-a1e3-bf803179e447",
      expectedRevision: "a".repeat(64),
      materials: [],
      presentations: [],
    };
    expect(saveInstructionalTrackDraftSchema.parse(validSave)).toEqual(validSave);
    expect(() => saveInstructionalTrackDraftSchema.parse({
      ...validSave,
      materials: [{
        courseUnitId: "e35ffedc-7c99-4405-a1c3-37a32cc672ba",
        assetVersionId: null,
        materialKind: "practice",
        activitySpec: { instructions: "Try it", answerKey: "secret" },
      }],
    })).toThrow();
    expect(() => saveInstructionalTrackDraftSchema.parse({
      ...validSave,
      presentations: Array.from({ length: 4_001 }, () => ({
        courseLessonId: "e35ffedc-7c99-4405-a1c3-37a32cc672ba",
        assetVersionId: "e35ffedc-7c99-4405-a1c3-37a32cc672ba",
        presentationKind: "primary",
        ordinal: 1,
      })),
    })).toThrow();
  });
});
