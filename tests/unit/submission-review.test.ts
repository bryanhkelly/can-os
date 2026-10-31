import { beforeEach, describe, expect, it, vi } from "vitest";
import { type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { getSubmissionReview, getTeacherSubmissionAttachment } from "@/modules/learning/gradebook.functions";
import { AuthorizationError } from "@/domain/command-context";

const state = vi.hoisted(() => ({
  context: {
    role: "teacher", actorPersonId: "teacher",
    capabilities: new Set(["assignments:grade"]),
    scope: { siteIds: ["site"], programIds: ["program"] },
  },
  rows: [] as unknown[][], conditions: [] as SQL[], select: vi.fn(), sign: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    parse: (value: unknown) => value,
    validator(parse: (value: unknown) => unknown) { this.parse = parse; return this; },
    handler(callback: (input: { data: unknown }) => unknown) {
      return (input: { data: unknown }) => callback({ data: this.parse(input.data) });
    },
  }),
}));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: vi.fn(), setResponseHeader: vi.fn() }));
vi.mock("@/modules/identity/command-context.server", () => ({ getCommandContext: async () => state.context }));
// authorizeClass now runs the canonical staffing eligibility reads (section,
// program ownership, staffing context, assignment, role, policies, claims);
// the fixture below supplies those rows instead of mocking eligibility away.
vi.mock("@/db/client", () => ({ db: { select: state.select, selectDistinctOn: state.select } }));
vi.mock("@neondatabase/serverless", () => ({ Pool: class {} }));
vi.mock("drizzle-orm/neon-serverless", () => ({ drizzle: () => ({ select: state.select }) }));
vi.mock("@/platform/storage/r2", () => ({ signPrivateObjectUrl: state.sign }));
vi.mock("@/platform/mutation", () => ({ emitEvent: vi.fn(), notify: vi.fn(), writeAudit: vi.fn() }));

const submissionId = "10000000-0000-4000-8000-000000000001";
const assessmentId = "20000000-0000-4000-8000-000000000001";
const documentId = "30000000-0000-4000-8000-000000000001";
const storageKey = `learning/assignment/${assessmentId}/${documentId}`;
const submission = {
  id: submissionId, assessmentId, studentProfileId: "profile", studentPersonId: "student",
  response: { text: "My submitted essay", attachments: [documentId] }, attemptNumber: 2,
  submittedAt: new Date("2030-01-01"), status: "submitted", score: null, feedback: null,
};
const document = { id: documentId, fileName: "essay.pdf", storageKey, verifiedAt: new Date("2030-01-01") };
// Canonical class-access rows: an active Section in the teacher's verified
// Site/Program delivery scope, hosted by its own academic provider (never an
// independent church-hosted CAN program, which would demand extra authority).
const classSection = { id: "section", siteId: "site", programId: "program" };
const providerProgram = { hostId: "provider", ownerId: "provider", academicProviderId: "provider" };
// Canonical staffing context: section, program and school-year scopes agree,
// and the instructional window is a nonempty increasing range.
const staffingSection = {
  id: "section", programId: "program", siteId: "site", active: true,
  organizationId: "provider", providerId: "provider", programSiteId: "site",
  yearOrganizationId: "provider", yearSiteId: "site", yearProgramId: "program",
  jurisdictionId: null, deliveryModel: "in_person",
  startsAt: new Date("2020-01-01T00:00:00.000Z"), endsAt: new Date("2040-01-01T00:00:00.000Z"),
  startsOn: "2020-01-01", endsOn: "2040-01-01", timezone: "UTC",
};
const sectionAssignment = { id: "assignment" };
const teacherRole = { id: "role" };
// A published qualification policy covering the evaluation instant, satisfied
// by one verified teaching credential claim.
const qualificationPolicy = {
  id: "rule", code: "teacher-credential",
  expression: { op: "credential", type: "teaching_certificate" }, evidencePolicy: {},
  versionFrom: null, versionThrough: null, appliesFrom: null, appliesThrough: null,
};
const verifiedClaim = {
  id: "claim", type: "teaching_certificate", issuer: null, jurisdiction: null,
  issuedAt: new Date("2020-01-01T00:00:00.000Z"), expiresAt: null,
  decision: "approve", verificationEventId: "event",
};

// Query consumption order for each review/attachment call.
const ROW = {
  submissionSection: 0, classSection: 1, providerProgram: 2, staffingSection: 3,
  sectionAssignment: 4, teacherRole: 5, qualificationPolicies: 6, qualificationClaims: 7,
  submission: 8, documents: 9, attempts: 10,
} as const;

beforeEach(() => {
  state.context = {
    role: "teacher", actorPersonId: "teacher", capabilities: new Set(["assignments:grade"]),
    scope: { siteIds: ["site"], programIds: ["program"] },
  };
  state.rows = [
    [{ sectionId: "section" }], [classSection], [providerProgram], [staffingSection],
    [sectionAssignment], [teacherRole], [qualificationPolicy], [verifiedClaim],
    [submission], [document],
    [{ id: submissionId, attemptNumber: 2, status: "submitted", score: null, submittedAt: submission.submittedAt }],
  ];
  state.conditions = [];
  state.sign.mockReset().mockReturnValue("https://private.example/signed");
  state.select.mockReset().mockImplementation(() => ({
    from() { return this; }, innerJoin() { return this; }, leftJoin() { return this; }, orderBy() { return this; },
    where(condition: SQL) { state.conditions.push(condition); return this; },
    limit: async () => state.rows.shift() ?? [],
    then(resolve: (rows: unknown[]) => unknown, reject: (error: unknown) => unknown) {
      return Promise.resolve(state.rows.shift() ?? []).then(resolve, reject);
    },
  }));
});

describe("teacher submission review boundary", () => {
  it("returns the real response, verified file metadata and attempt history without a signed URL", async () => {
    const result = await getSubmissionReview({ data: { submissionId } });
    expect(result).toEqual({
      score: null, feedbackComment: "",
      responseText: "My submitted essay", attemptNumber: 2, submittedAt: "2030-01-01T00:00:00.000Z",
      attachments: [{ id: documentId, fileName: "essay.pdf" }],
      attempts: [{ id: submissionId, attemptNumber: 2, status: "submitted", score: null, submittedAt: "2030-01-01T00:00:00.000Z" }],
    });
    expect(state.sign).not.toHaveBeenCalled();
  });
  it("returns a graded submission's score and teacher feedback without signing attachments", async () => {
    state.rows[ROW.submission] = [{ ...submission, status: "graded", score: "8.5", feedback: { comment: "Explain your evidence." } }];
    state.rows[ROW.attempts] = [{ id: submissionId, attemptNumber: 2, status: "graded", score: "8.5", submittedAt: submission.submittedAt }];
    const result = await getSubmissionReview({ data: { submissionId } });
    expect(result.score).toBe("8.5");
    expect(result.feedbackComment).toBe("Explain your evidence.");
    expect(result.attempts).toEqual([{ id: submissionId, attemptNumber: 2, status: "graded", score: "8.5", submittedAt: "2030-01-01T00:00:00.000Z" }]);
    expect(state.sign).not.toHaveBeenCalled();
  });
  it.each(["student", "guardian", "registrar"])("denies the %s role", async role => {
    state.context.role = role;
    await expect(getSubmissionReview({ data: { submissionId } })).rejects.toThrow(AuthorizationError);
    expect(state.sign).not.toHaveBeenCalled();
  });
  it("denies a teacher who does not teach the submission's section", async () => {
    state.rows[ROW.sectionAssignment] = [];
    await expect(getSubmissionReview({ data: { submissionId } })).rejects.toThrow(/assigned teacher/);
  });
  it.each([{ siteId: "other", programId: "program" }, { siteId: "site", programId: "other" }])(
    "denies sections outside the verified delivery scope: %j", async scope => {
      state.rows[ROW.classSection] = [{ ...classSection, ...scope }];
      await expect(getSubmissionReview({ data: { submissionId } })).rejects.toThrow(AuthorizationError);
    },
  );
  it("requires the grading capability even when the teaching relationship exists", async () => {
    state.context.capabilities.clear();
    await expect(getSubmissionReview({ data: { submissionId } })).rejects.toThrow(/assignments:grade/);
  });
  it("rejects missing and sectionless submissions", async () => {
    state.rows[ROW.submissionSection] = [{ sectionId: null }];
    await expect(getSubmissionReview({ data: { submissionId } })).rejects.toThrow(/submission section/);
  });
  it("does not expose a student's unsubmitted response", async () => {
    state.rows[ROW.submission] = [{ ...submission, status: "in_progress" }];
    await expect(getSubmissionReview({ data: { submissionId } })).rejects.toThrow(/submitted work/);
  });
  it("constrains document lookup to linked IDs, the assessment, category, student owner and private provider", async () => {
    await getSubmissionReview({ data: { submissionId } });
    const condition = state.conditions[ROW.documents];
    if (!condition) throw new Error("Missing document authorization predicate");
    const query = new PgDialect().sqlToQuery(condition);
    expect(query.params).toEqual([documentId, "assessment", assessmentId, "assignment_submission", "student", "cloudflare_r2"]);
    expect(query.sql).toContain('"documents"."uploaded_by_person_id"');
    expect(query.sql).toContain('"documents"."subject_id"');
    expect(query.sql).toContain('"documents"."verified_at" is not null');
    expect(query.sql).toContain('"documents"."expires_at" > now()');
  });
  it.each([
    { ...document, verifiedAt: null },
    { ...document, storageKey: `learning/assignment/other/${documentId}` },
  ])("does not sign unverified or wrong-assessment objects: %j", async invalid => {
    state.rows[ROW.documents] = [invalid];
    await expect(getTeacherSubmissionAttachment({ data: { submissionId, documentId } })).rejects.toThrow(AuthorizationError);
    expect(state.sign).not.toHaveBeenCalled();
  });
  it("does not sign a document that was not returned by the authorized attachment query", async () => {
    state.rows[ROW.documents] = [];
    await expect(getTeacherSubmissionAttachment({ data: { submissionId, documentId } })).rejects.toThrow(AuthorizationError);
    expect(state.sign).not.toHaveBeenCalled();
  });
  it("issues a 60-second URL only after repeating submission authorization", async () => {
    await expect(getTeacherSubmissionAttachment({ data: { submissionId, documentId } })).resolves.toEqual({ downloadUrl: "https://private.example/signed" });
    expect(state.sign).toHaveBeenCalledWith({ method: "GET", key: storageKey, keyPattern: expect.any(RegExp), expiresSeconds: 60 });
  });
  it("validates identifiers before any database query", async () => {
    expect(() => getTeacherSubmissionAttachment({ data: { submissionId: "invalid", documentId } })).toThrow();
    expect(state.select).not.toHaveBeenCalled();
  });
});
