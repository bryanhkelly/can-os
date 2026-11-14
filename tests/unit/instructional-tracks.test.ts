import { describe, expect, it } from "vitest";
import {
  assertCurrentPracticeSelection,
  buildTrackManifestUsages,
  canAccessStudentTrackMaterial,
  decideInstructionalTrackSelection,
  evaluateInstructionalTrackPolicy,
  isVerifiedEvidenceCurrent,
  parseStudentPracticeDefinition,
  projectRecordedCourseLessons,
  recordedInstructorSelectionIsCurrent,
  recordedPracticeResponsesComplete,
  snapshotRecordedPracticeAnswers,
  trackContentAvailable,
  instructionalTrackAssetStorageKey,
  type InstructionalTrackPolicyContext,
} from "../../src/domain/instructional-tracks";

const now = new Date("2026-11-10T12:00:00Z");
const earlier = new Date("2026-10-10T12:00:00Z");
const beforeWithdrawal = new Date("2026-09-10T12:00:00Z");
const later = new Date("2026-12-10T12:00:00Z");

function policyContext(
  patch: Partial<InstructionalTrackPolicyContext> = {},
): InstructionalTrackPolicyContext {
  return {
    policyVersionId: "policy-1",
    lifecycle: "published",
    deploymentId: "deployment-1",
    adoptionId: "adoption-1",
    offeringVersionId: "offering-version-1",
    courseVersionId: "course-version-1",
    policyDeploymentId: "deployment-1",
    policyAdoptionId: "adoption-1",
    policyOfferingVersionId: "offering-version-1",
    policyCourseVersionId: "course-version-1",
    effectiveFrom: earlier,
    effectiveThrough: later,
    withdrawnAt: null,
    deliveryEnabled: true,
    practiceEnabled: true,
    studentChoiceEnabled: true,
    selectionPolicy: "student",
    selectionSource: "learner",
    now,
    action: "delivery",
    ...patch,
  };
}

describe("canonical instructional policy eligibility", () => {
  it("allows only a published, in-scope policy effective at the decision time", () => {
    expect(evaluateInstructionalTrackPolicy(policyContext())).toEqual({
      status: "allowed",
      policyVersionId: "policy-1",
    });
  });

  it("distinguishes an unknown policy from expired, withdrawn, unpublished, or mismatched policy", () => {
    expect(evaluateInstructionalTrackPolicy(policyContext({ policyVersionId: null }))).toEqual({
      status: "unknown",
      reason: "missing_policy",
    });
    expect(evaluateInstructionalTrackPolicy(policyContext({ effectiveThrough: now }))).toMatchObject({
      status: "denied",
      reason: "expired",
    });
    expect(evaluateInstructionalTrackPolicy(policyContext({ withdrawnAt: now }))).toMatchObject({
      status: "denied",
      reason: "withdrawn",
    });
    expect(evaluateInstructionalTrackPolicy(policyContext({ lifecycle: "draft" }))).toMatchObject({
      status: "denied",
      reason: "unpublished",
    });
    expect(evaluateInstructionalTrackPolicy(policyContext({ policyAdoptionId: "other" }))).toMatchObject({
      status: "denied",
      reason: "wrong_scope",
    });
  });

  it("applies practice and student-choice policy gates independently", () => {
    expect(
      evaluateInstructionalTrackPolicy(
        policyContext({
          action: "student_choice",
          studentChoiceEnabled: false,
          selectionPolicy: "guardian",
          selectionSource: "guardian",
        }),
      ),
    ).toMatchObject({ status: "allowed" });
    expect(
      evaluateInstructionalTrackPolicy(policyContext({ action: "practice", practiceEnabled: false })),
    ).toMatchObject({ status: "denied", reason: "practice_disabled" });
    expect(
      evaluateInstructionalTrackPolicy(
        policyContext({ action: "student_choice", studentChoiceEnabled: false }),
      ),
    ).toMatchObject({ status: "denied", reason: "choice_disabled" });
    expect(
      evaluateInstructionalTrackPolicy(
        policyContext({
          action: "student_choice",
          selectionPolicy: "guardian",
          selectionSource: "learner",
        }),
      ),
    ).toMatchObject({ status: "denied", reason: "selector_not_allowed" });
  });
});

describe("instructional content withdrawal", () => {
  const available = {
    lifecycle: "published" as const,
    rightsExpireAt: later,
    now,
    selectionCreatedAt: earlier,
    restrictions: [],
  };

  it("allows current published content with current rights", () => {
    expect(trackContentAvailable(available)).toBe(true);
  });

  it("allows only pre-existing selections during explicit routine-retirement grace", () => {
    const retired = {
      ...available,
      lifecycle: "retired" as const,
      selectionCreatedAt: beforeWithdrawal,
      restrictions: [
        { kind: "routine_retirement" as const, effectiveAt: earlier, legacyAccessUntil: later },
      ],
    };
    expect(trackContentAvailable(retired)).toBe(true);
    expect(trackContentAvailable({ ...retired, selectionCreatedAt: null })).toBe(false);
    expect(trackContentAvailable({ ...retired, now: later })).toBe(false);
  });

  it.each(["urgent_rights", "urgent_safety"] as const)(
    "does not grant legacy access after %s withdrawal",
    (kind) => {
      expect(
        trackContentAvailable({
          ...available,
          restrictions: [{ kind, effectiveAt: now, legacyAccessUntil: later }],
        }),
      ).toBe(false);
    },
  );
});

describe("instructional distribution rights evidence", () => {
  const validEvidence = {
    verifiedAt: earlier,
    verifiedByPersonId: "reviewer-1",
    validFrom: "2026-10-01",
    validThrough: "2026-11-10",
    at: now,
  };

  it("allows evidence verified by another person and current on the effective date", () => {
    expect(isVerifiedEvidenceCurrent(validEvidence)).toBe(true);
  });

  it.each([
    { verifiedAt: null },
    { verifiedByPersonId: null },
    { verifiedAt: later },
    { validFrom: "2026-11-11" },
    { validThrough: "2026-11-09" },
    { validThrough: "not-a-date" },
  ])("denies missing, future, expired, or malformed rights evidence %#", (patch) => {
    expect(isVerifiedEvidenceCurrent({ ...validEvidence, ...patch })).toBe(false);
  });
});

describe("instructional track manifests", () => {
  it("binds private asset storage keys to canonical immutable asset-version IDs", () => {
    expect(instructionalTrackAssetStorageKey("d9428888-122b-4b9a-bc4c-9a9b5b31f5d2"))
      .toBe("learning/instructional-track/d9428888-122b-4b9a-bc4c-9a9b5b31f5d2");
    expect(() => instructionalTrackAssetStorageKey("../unscoped/object")).toThrow(
      /invalid instructional asset version/i,
    );
  });

  it("deduplicates and sorts asset usage while preserving every required use", () => {
    expect(buildTrackManifestUsages({
      presentations: [
        { assetVersionId: "asset-b", presentationKind: "alternate_language" },
        { assetVersionId: "asset-a", presentationKind: "primary" },
        { assetVersionId: "asset-a", presentationKind: "primary" },
      ],
      materials: [
        { assetVersionId: "asset-a", materialKind: "instruction" },
        { assetVersionId: "asset-b", materialKind: "practice" },
        { assetVersionId: null, materialKind: "reference" },
      ],
    })).toEqual([
      { assetVersionId: "asset-a", usageKind: "required_instruction" },
      { assetVersionId: "asset-b", usageKind: "accessibility" },
      { assetVersionId: "asset-b", usageKind: "supporting" },
    ]);
  });
});

describe("student-safe practice and stale submissions", () => {
  const definition = {
    instructions: "Solve each problem.",
    prompts: [{ key: "q1", text: "What is 2 + 2?" }],
  };

  it("returns an explicit student-facing projection", () => {
    const parsed = parseStudentPracticeDefinition(definition);
    expect(parsed).toEqual(definition);
    expect(parsed).not.toBe(definition);
  });

  it.each([
    { ...definition, solutions: ["4"] },
    { ...definition, prompts: [{ ...definition.prompts[0], answer: "4" }] },
    { ...definition, prompts: [definition.prompts[0], definition.prompts[0]] },
    { ...definition, instructions: "x".repeat(20_001) },
    null,
  ])("rejects private or malformed practice definition %j", (input) => {
    expect(() => parseStudentPracticeDefinition(input)).toThrow();
  });

  it("requires completed responses to exactly match published practice prompts", () => {
    const prompts = [{ key: "q1" }, { key: "q2" }];
    expect(recordedPracticeResponsesComplete(prompts, [
      { promptKey: "q2", response: "Another approach." },
      { promptKey: "q1", response: "First approach." },
    ])).toBe(true);
    expect(recordedPracticeResponsesComplete(prompts, [
      { promptKey: "q1", response: "First approach." },
    ])).toBe(false);
    expect(recordedPracticeResponsesComplete(prompts, [
      { promptKey: "q1", response: "First approach." },
      { promptKey: "q1", response: "First approach." },
    ])).toBe(false);
    expect(recordedPracticeResponsesComplete(prompts, [
      { promptKey: "q1", response: "First approach." },
      { promptKey: "q3", response: "Unknown activity." },
    ])).toBe(false);
    expect(recordedPracticeResponsesComplete(prompts, [
      { promptKey: "q1", response: "   " },
      { promptKey: "q2", response: "Another approach." },
    ])).toBe(false);
  });

  it("rejects a delayed practice submission after track switching", () => {
    const submission = {
      expectedRevision: 1,
      currentRevision: 2,
      currentTrackVersionId: "track-b",
      submittedTrackVersionId: "track-a",
      currentCourseVersionId: "course-v1",
      submittedCourseVersionId: "course-v1",
    };
    expect(() => assertCurrentPracticeSelection(submission)).toThrow(/selection changed/i);
    expect(() =>
      assertCurrentPracticeSelection({
        ...submission,
        expectedRevision: 2,
        submittedTrackVersionId: "track-a",
      }),
    ).toThrow(/current approved course and track/i);
    expect(() =>
      assertCurrentPracticeSelection({
        ...submission,
        expectedRevision: 2,
        submittedTrackVersionId: "track-b",
        submittedCourseVersionId: "course-v2",
      }),
    ).toThrow(/current approved course/i);
    expect(() =>
      assertCurrentPracticeSelection({
        ...submission,
        expectedRevision: 2,
        submittedTrackVersionId: "track-b",
      }),
    ).not.toThrow();
  });
});

describe("learner instructor transition decisions", () => {
  const selection = {
    current: { trackVersionId: "teacher-a", policyVersionId: "policy-1" },
    lastTrackVersionId: "teacher-a",
    requestedTrackVersionId: "teacher-a",
    policyVersionId: "policy-1",
    allowSwitching: false,
  };

  it("reuses a current teacher only under the same approved policy version", () => {
    expect(decideInstructionalTrackSelection(selection)).toBe("reuse");
    expect(decideInstructionalTrackSelection({
      ...selection,
      policyVersionId: "policy-2",
    })).toBe("create");
  });

  it("renews the same teacher without requiring presenter-switch permission", () => {
    expect(decideInstructionalTrackSelection({
      ...selection,
      current: null,
      policyVersionId: "policy-2",
    })).toBe("create");
  });

  it("rejects an unauthorized teacher switch, including with only historical selections", () => {
    expect(decideInstructionalTrackSelection({
      ...selection,
      requestedTrackVersionId: "teacher-b",
    })).toBe("switch_denied");
    expect(decideInstructionalTrackSelection({
      ...selection,
      current: null,
      requestedTrackVersionId: "teacher-b",
    })).toBe("switch_denied");
  });

  it("permits a teacher change only when the policy allows switching", () => {
    expect(decideInstructionalTrackSelection({
      ...selection,
      requestedTrackVersionId: "teacher-b",
      allowSwitching: true,
    })).toBe("create");
    expect(decideInstructionalTrackSelection({
      ...selection,
      current: null,
      lastTrackVersionId: null,
      requestedTrackVersionId: "teacher-b",
    })).toBe("create");
  });
});

describe("policy-scoped learner practice materials", () => {
  it("hides practice-only materials when the published policy disables practice", () => {
    expect(canAccessStudentTrackMaterial("practice", false)).toBe(false);
    expect(canAccessStudentTrackMaterial("practice", true)).toBe(true);
  });

  it("preserves normal instruction and reference assets regardless of practice settings", () => {
    expect(canAccessStudentTrackMaterial("instruction", false)).toBe(true);
    expect(canAccessStudentTrackMaterial("reference", false)).toBe(true);
    expect(canAccessStudentTrackMaterial("instruction", true)).toBe(true);
  });
});

describe("same Section, independently selected recorded teachers", () => {
  const sharedCourseLessons = [
    { id: "lesson-1", courseUnitId: "unit-1", title: "Foundations", lessonOrder: 1 },
    { id: "lesson-2", courseUnitId: "unit-1", title: "Application", lessonOrder: 2 },
  ];
  const teacherA = [{
    courseLessonId: "lesson-1",
    assetVersionId: "teacher-a-video",
    presentationKind: "primary",
    ordinal: 1,
    accessibilityNotes: {},
  }];
  const teacherB = [{
    courseLessonId: "lesson-1",
    assetVersionId: "teacher-b-video",
    presentationKind: "primary",
    ordinal: 1,
    accessibilityNotes: {},
  }];
  const learnerOneProgress = [{
    lessonId: "lesson-1",
    status: "completed",
    observedAt: new Date("2026-11-10T12:00:00Z"),
  }];
  const learnerTwoProgress = [{
    lessonId: "lesson-2",
    status: "in_progress",
    observedAt: new Date("2026-11-11T12:00:00Z"),
  }];

  it("shows different approved presenters without sharing lesson progress between learners", () => {
    const first = projectRecordedCourseLessons({
      lessons: sharedCourseLessons,
      progress: learnerOneProgress,
      presentations: teacherA,
    });
    const second = projectRecordedCourseLessons({
      lessons: sharedCourseLessons,
      progress: learnerTwoProgress,
      presentations: teacherB,
    });
    expect(first.map(lesson => lesson.id)).toEqual(second.map(lesson => lesson.id));
    expect(first[0]?.presentations[0]?.assetVersionId).toBe("teacher-a-video");
    expect(second[0]?.presentations[0]?.assetVersionId).toBe("teacher-b-video");
    expect(first[0]?.progress?.status).toBe("completed");
    expect(second[0]?.progress).toBeNull();
    expect(first[1]?.progress).toBeNull();
    expect(second[1]?.progress?.status).toBe("in_progress");
  });

  it("keeps a learner's official progress when changing recorded instructors", () => {
    const before = projectRecordedCourseLessons({
      lessons: sharedCourseLessons,
      progress: learnerOneProgress,
      presentations: teacherA,
    });
    const after = projectRecordedCourseLessons({
      lessons: sharedCourseLessons,
      progress: learnerOneProgress,
      presentations: teacherB,
    });
    expect(after.map(lesson => lesson.progress)).toEqual(before.map(lesson => lesson.progress));
    expect(after.map(lesson => lesson.id)).toEqual(before.map(lesson => lesson.id));
    expect(after[0]?.presentations[0]?.assetVersionId).toBe("teacher-b-video");
  });
});

describe("recorded instructor policy renewal eligibility", () => {
  const selected = { trackVersionId: "teacher-a", policyVersionId: "policy-old" };
  const approved = [
    { trackVersionId: "teacher-a", policyVersionId: "policy-new" },
    { trackVersionId: "teacher-b", policyVersionId: "policy-new" },
  ];

  it("prompts a learner to renew the same recorded instructor after policy replacement", () => {
    expect(recordedInstructorSelectionIsCurrent({ selection: selected, choices: approved })).toBe(false);
    expect(decideInstructionalTrackSelection({
      current: selected,
      lastTrackVersionId: selected.trackVersionId,
      requestedTrackVersionId: selected.trackVersionId,
      policyVersionId: "policy-new",
      allowSwitching: false,
    })).toBe("create");
    expect(recordedInstructorSelectionIsCurrent({
      selection: { ...selected, policyVersionId: "policy-new" },
      choices: approved,
    })).toBe(true);
  });

  it("does not open lessons before a teacher is selected", () => {
    expect(recordedInstructorSelectionIsCurrent({ selection: null, choices: approved })).toBe(false);
  });
});

describe("recorded practice answer provenance", () => {
  it("preserves the original prompt with each learner answer for review after teacher switching", () => {
    expect(snapshotRecordedPracticeAnswers(
      [{ key: "prompt-1", text: "Explain your first calculation" },
        { key: "prompt-2", text: "Show an alternate method" }],
      [{ promptKey: "prompt-1", response: "I multiplied both sides." },
        { promptKey: "prompt-2", response: "I used a diagram." }],
    )).toEqual([
      { promptKey: "prompt-1", promptText: "Explain your first calculation",
        response: "I multiplied both sides." },
      { promptKey: "prompt-2", promptText: "Show an alternate method",
        response: "I used a diagram." },
    ]);
  });
});
