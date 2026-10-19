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
vi.mock("@/db/client", () => ({ db: { select: state.select } }));
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
  submittedAt: new Date("2030-01-01"), status: "submitted",
};
const document = { id: documentId, fileName: "essay.pdf", storageKey, verifiedAt: new Date("2030-01-01") };

beforeEach(() => {
  state.context = {
    role: "teacher", actorPersonId: "teacher", capabilities: new Set(["assignments:grade"]),
    scope: { siteIds: ["site"], programIds: ["program"] },
  };
  state.rows = [
    [{ sectionId: "section" }], [{ siteId: "site", programId: "program" }], [submission], [document],
    [{ id: submissionId, attemptNumber: 2, status: "submitted", score: null, submittedAt: submission.submittedAt }],
  ];
  state.conditions = [];
  state.sign.mockReset().mockReturnValue("https://private.example/signed");
  state.select.mockReset().mockImplementation(() => ({
    from() { return this; }, innerJoin() { return this; }, orderBy() { return this; },
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
      responseText: "My submitted essay", attemptNumber: 2, submittedAt: "2030-01-01T00:00:00.000Z",
      attachments: [{ id: documentId, fileName: "essay.pdf" }],
      attempts: [{ id: submissionId, attemptNumber: 2, status: "submitted", score: null, submittedAt: "2030-01-01T00:00:00.000Z" }],
    });
    expect(state.sign).not.toHaveBeenCalled();
  });
  it.each(["student", "guardian", "registrar"])("denies the %s role", async role => {
    state.context.role = role;
    await expect(getSubmissionReview({ data: { submissionId } })).rejects.toThrow(AuthorizationError);
    expect(state.sign).not.toHaveBeenCalled();
  });
  it("denies a teacher who does not teach the submission's section", async () => {
    state.rows[1] = [];
    await expect(getSubmissionReview({ data: { submissionId } })).rejects.toThrow(/assigned teacher/);
  });
  it.each([{ siteId: "other", programId: "program" }, { siteId: "site", programId: "other" }])(
    "denies sections outside the verified delivery scope: %j", async section => {
      state.rows[1] = [section];
      await expect(getSubmissionReview({ data: { submissionId } })).rejects.toThrow(AuthorizationError);
    },
  );
  it("requires the grading capability even when the teaching relationship exists", async () => {
    state.context.capabilities.clear();
    await expect(getSubmissionReview({ data: { submissionId } })).rejects.toThrow(/assignments:grade/);
  });
  it("rejects missing and sectionless submissions", async () => {
    state.rows[0] = [{ sectionId: null }];
    await expect(getSubmissionReview({ data: { submissionId } })).rejects.toThrow(/submission section/);
  });
  it("does not expose a student's unsubmitted response", async () => {
    state.rows[2] = [{ ...submission, status: "in_progress" }];
    await expect(getSubmissionReview({ data: { submissionId } })).rejects.toThrow(/submitted work/);
  });
  it("constrains document lookup to linked IDs, the assessment, category, student owner and private provider", async () => {
    await getSubmissionReview({ data: { submissionId } });
    const condition = state.conditions[3];
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
    state.rows[3] = [invalid];
    await expect(getTeacherSubmissionAttachment({ data: { submissionId, documentId } })).rejects.toThrow(AuthorizationError);
    expect(state.sign).not.toHaveBeenCalled();
  });
  it("does not sign a document that was not returned by the authorized attachment query", async () => {
    state.rows[3] = [];
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
