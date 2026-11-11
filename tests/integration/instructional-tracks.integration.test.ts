import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as s from "../../src/db/schema";
import { eq } from "drizzle-orm";
import type { Actor } from "../../src/modules/identity/actors.server";
import { roleCapabilities } from "../../src/domain/access-context";
import { createInstructionalTrackDraft, readInstructionalTrackDraft, saveInstructionalTrackDraft,
  submitInstructionalTrack, reviewInstructionalTrack, publishInstructionalTrack, withdrawInstructionalTrack } from "../../src/modules/learning/instructional-track-authoring.server";
import { listStudentInstructionalTracks, selectStudentInstructionalTrack, getSelectedLessonInstruction,
  recordStudentPracticeProgress, readStudentPracticeHistory } from "../../src/modules/learning/student-instructional-tracks.server";

const state = vi.hoisted(() => ({ database: null as unknown }));
vi.mock("@/db/client", () => ({ db: new Proxy({}, { get(_target, key) {
  const database = state.database as Record<PropertyKey, unknown>;
  const value = database[key]; return typeof value === "function" ? value.bind(database) : value;
} }) }));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: vi.fn() }));

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const request = () => crypto.randomUUID();
const programId = id(3), sectionId = id(8), courseVersionId = id(10);
const future = new Date(Date.now() + 365 * 86400000);
const providerId = id(1), siteId = id(2);
let pg: PGlite;
let database: ReturnType<typeof drizzle<typeof s>>;
let trackA: { versionId: string; activityId: string };
let trackB: { versionId: string; activityId: string };
const envBefore = { ...process.env };

function actor(n: number, role: Actor["role"]): Actor {
  return { actorPersonId: id(n), accountId: id(n + 100), grantId: id(n + 200), sessionId: id(n + 300),
    role, grantSiteId: role.startsWith("academic_content") ? null : siteId,
    capabilities: new Set(roleCapabilities[role]), scope: { organizationIds: [providerId], siteIds: [siteId], programIds: [programId] } };
}
const authorA = actor(20, "academic_content_creator"), authorB = actor(21, "academic_content_creator");
const reviewer = actor(22, "academic_content_reviewer"), studentA = actor(23, "student"), studentB = actor(24, "student");
const guardian = actor(25, "guardian");
const policy = { authoringEnabled: true, studentChoiceEnabled: true, practiceEnabled: true, deliveryEnabled: true,
  selectionPolicy: "student", allowSwitching: true };

async function publishFixture(author: Actor, n: number, label: string) {
  const draft = await createInstructionalTrackDraft(author, { programId, courseVersionId, requestId: request(), title: `Algebra with ${label}`, slug: `algebra-${label.toLowerCase()}` });
  await database.insert(s.documents).values({ id: id(n), subjectType: "course_template_version", subjectId: courseVersionId,
    category: "instructional_track_rights", fileName: "Synthetic test evidence", storageProvider: "test_fixture", storageKey: `test/${label}`,
    expiresAt: future, verifiedAt: new Date(), verifiedByPersonId: reviewer.actorPersonId, uploadedByPersonId: author.actorPersonId,
    metadata: { producerOrganizationId: providerId, presenterPersonId: author.actorPersonId } });
  await database.insert(s.curriculumResources).values([
    { id: id(n+1), ownerOrganizationId: providerId, kind: "document", title: "Test-only rights evidence", documentId: id(n), licenseCode: "synthetic_test_fixture" },
    { id: id(n+2), ownerOrganizationId: providerId, kind: "video", title: `Recording ${label}`, url: `https://media.example.test/${label}.mp4`,
      licenseCode: "synthetic_test_fixture", metadata: { audience: "student" } },
    { id: id(n+3), ownerOrganizationId: providerId, kind: "transcript", title: `Transcript ${label}`, url: `https://media.example.test/${label}.txt`,
      licenseCode: "synthetic_test_fixture", metadata: { audience: "student" } },
  ]);
  const saved = await saveInstructionalTrackDraft(author, { programId, versionId: draft.versionId, requestId: request(), expectedRevision: draft.revision,
    rightsEvidenceResourceId: id(n+1), rightsExpiresAt: future.toISOString(),
    lessons: ["l1", "l2"].map(publisherLessonId => ({ publisherLessonId, resourceId: id(n+2), transcriptResourceId: id(n+3), captionResourceId: null, placement: "primary", sequence: 0 })),
    activities: [{ publisherLessonId: "l1", activityKey: "p1", title: `Practice ${label}`, kind: "practice_problem_set",
      body: { instructions: `Practice using ${label}'s approach.`, prompts: [{ key: "q1", text: "Solve 2 + 2" }] }, resourceId: null,
      recommendationLevel: "suggested", sequence: 0, estimatedMinutes: 10,
      privateSolutions: [{ promptKey: "q1", answer: "SECRET-FOUR", explanation: "PRIVATE-SCORING-EXPLANATION" }], feedbackRelease: "never" }],
  });
  await submitInstructionalTrack(author, { programId, versionId: draft.versionId, requestId: request(), expectedRevision: saved.revision });
  for (const criterion of ["academic", "rights", "accessibility", "safety"] as const)
    await reviewInstructionalTrack(reviewer, { programId, versionId: draft.versionId, requestId: request(), expectedRevision: saved.revision,
      criterion, decision: "approved", rationale: "Synthetic test-only independent approval." });
  await publishInstructionalTrack(reviewer, { programId, versionId: draft.versionId, requestId: request(), expectedRevision: saved.revision });
  const [activity] = await database.select().from(s.instructionalTrackActivities).where(eq(s.instructionalTrackActivities.trackVersionId, draft.versionId));
  return { versionId: draft.versionId, activityId: activity!.id };
}

async function academicSnapshot() {
  const result: Record<string, unknown> = {};
  for (const name of ["sections", "enrollments", "assessments", "submissions", "lesson_progress"])
    result[name] = (await pg.query(`select to_jsonb(t) as row from ${name} t order by id`)).rows;
  return JSON.stringify(result);
}
const select = (student: Actor, track: typeof trackA, revision = 0, requestId = request()) =>
  selectStudentInstructionalTrack(student, { sectionId, sectionEnrollmentId: student === studentA ? id(40) : id(41), trackVersionId: track.versionId, expectedRevision: revision, requestId });

beforeAll(async () => {
  for (const name of ["AUTHORING", "CHOICE", "PRACTICE", "DELIVERY"]) process.env[`CAN_INSTRUCTIONAL_TRACK_${name}_ENABLED`] = "true";
  pg = new PGlite();
  const empty = generateDrizzleJson({}); const schema = generateDrizzleJson(s, empty.id);
  await pg.exec((await generateMigration(empty, schema)).join("\n"));
  const migration = readFileSync("drizzle/0079_instructional_tracks_and_practice.sql", "utf8");
  await pg.exec("-- Content is sealed at submission." + migration.split("-- Content is sealed at submission.")[1]);
  database = drizzle(pg, { schema: s }); state.database = database;
  await database.insert(s.organizations).values({ id: providerId, type: "can_network", name: "Synthetic academic provider", slug: "synthetic-provider" });
  await database.insert(s.sites).values({ id: siteId, organizationId: providerId, name: "Synthetic site", slug: "site" });
  await database.insert(s.jurisdictions).values({ id: id(4), code: "TEST", name: "Test jurisdiction" });
  await database.insert(s.programs).values({ id: programId, organizationId: providerId, siteId, jurisdictionId: id(4), type: "full_school",
    name: "Synthetic program", slug: "program", academicProviderOrganizationId: providerId, hostOrganizationId: providerId,
    gradeRange: { min: "9", max: "12" }, metadata: { instructionalTracks: policy } });
  await database.insert(s.gradeScales).values({ id: id(5), owningOrganizationId: providerId, name: "Test scale", version: 1, configuration: { entries: [] } });
  await database.insert(s.schoolYears).values({ id: id(6), organizationId: providerId, programId, siteId, key: "2026", name: "Test year",
    startsOn: "2026-08-01", endsOn: "2027-07-01", gradeScaleId: id(5) });
  await database.insert(s.terms).values({ id: id(7), schoolYearId: id(6), key: "fall", name: "Fall", sequence: 1, startsOn: "2026-08-01", endsOn: "2026-12-31" });
  await database.insert(s.courseTemplates).values({ id: id(9), owningOrganizationId: providerId, code: "ALG1", title: "Algebra I", subject: "Math" });
  await database.insert(s.courseTemplateVersions).values({ id: courseVersionId, courseTemplateId: id(9), version: 1, status: "published", publishedAt: new Date(),
    curriculum: { learning: { version: 1, syllabus: "Algebra", modules: [{ id: "m1", title: "Module", lessons: ["l1", "l2"].map(id => ({ id, title: id, body: "Canonical lesson", resources: [] })) }], resources: [] } } });
  await database.insert(s.sections).values({ id: sectionId, programId, siteId, courseTemplateVersionId: courseVersionId, code: "ALG1-A", title: "Algebra I", termId: id(7) });
  for (const member of [authorA, authorB, reviewer, studentA, studentB, guardian]) {
    await database.insert(s.people).values({ id: member.actorPersonId, legalFirstName: member.role, legalLastName: member.actorPersonId.slice(-2), email: `${member.actorPersonId}@example.test` });
    await database.insert(s.accessAccounts).values({ id: member.accountId, emailNormalized: `${member.actorPersonId}@example.test`, emailVerifiedAt: new Date() });
    await database.insert(s.accountPersonGrants).values({ id: member.grantId, personId: member.actorPersonId, accountId: member.accountId, role: member.role,
      organizationId: providerId, siteId: member.grantSiteId });
    await database.insert(s.memberships).values({ personId: member.actorPersonId, organizationId: providerId });
    if (member.role.startsWith("academic_content")) await database.insert(s.roleAssignments).values({ personId: member.actorPersonId, roleKey: member.role,
      organizationId: providerId, capabilities: [...member.capabilities], metadata: { courseTemplateVersionIds: [courseVersionId] } });
  }
  for (const [i, student] of [studentA, studentB].entries()) {
    await database.insert(s.studentProfiles).values({ id: id(30+i), personId: student.actorPersonId });
    await database.insert(s.enrollments).values([
      { id: id(42+i), studentProfileId: id(30+i), organizationId: providerId, programId, schoolYearId: id(6), kind: "program", status: "active" },
      { id: id(40+i), studentProfileId: id(30+i), organizationId: providerId, programId, schoolYearId: id(6), sectionId, kind: "section", status: "active" },
    ]);
    await database.insert(s.lessonProgress).values({ sectionId, courseTemplateVersionId: courseVersionId, studentProfileId: id(30+i), lessonId: "l1", completedAt: new Date() });
  }
  await database.insert(s.guardianRelationships).values({ guardianPersonId: guardian.actorPersonId, studentPersonId: studentA.actorPersonId,
    relationshipLabel: "Test guardian", canViewAcademics: true, canManageEnrollment: true, metadata: { verification: "verified" } });
  await database.insert(s.assessments).values({ id: id(50), sectionId, title: "Shared official assignment", status: "published", pointsPossible: "10", createdByPersonId: reviewer.actorPersonId });
  await database.insert(s.submissions).values({ id: id(51), assessmentId: id(50), studentProfileId: id(30), score: "8" });
  trackA = await publishFixture(authorA, 60, "A"); trackB = await publishFixture(authorB, 70, "B");
}, 60000);
beforeEach(async () => { await pg.exec("TRUNCATE student_practice_progress, student_instructional_selections, audit_events, domain_events CASCADE"); });
afterAll(async () => { for (const name of ["AUTHORING", "CHOICE", "PRACTICE", "DELIVERY"]) {
  const key = `CAN_INSTRUCTIONAL_TRACK_${name}_ENABLED`; if (envBefore[key] === undefined) delete process.env[key]; else process.env[key] = envBefore[key];
} await pg?.close(); });

describe("recorded-instructor workflow against isolated PostgreSQL", () => {
  it("serves different recordings/practice in one Section without leaking private solutions or changing academic records", async () => {
    const before = await academicSnapshot();
    expect((await listStudentInstructionalTracks(studentA, { sectionId })).tracks).toHaveLength(2);
    await select(studentA, trackA); await select(studentB, trackB);
    const a = await getSelectedLessonInstruction(studentA, { sectionId, publisherLessonId: "l1" });
    const b = await getSelectedLessonInstruction(studentB, { sectionId, publisherLessonId: "l1" });
    expect(a.recordings[0]?.media.url).not.toBe(b.recordings[0]?.media.url);
    expect(a.practice[0]?.title).toBe("Practice A"); expect(b.practice[0]?.title).toBe("Practice B");
    expect(JSON.stringify([a,b])).not.toMatch(/SECRET-FOUR|PRIVATE-SCORING|privateSolutions|rights_evidence|storageKey/);
    expect(await academicSnapshot()).toBe(before);
  });
  it("preserves practice and canonical records on switching, rejects late writes and does not double-count retries", async () => {
    const before = await academicSnapshot(); const chosen = await select(studentA, trackA);
    const progress = { sectionId, sectionEnrollmentId: id(40), trackActivityId: trackA.activityId, expectedRevision: chosen.revision,
      action: "attempt" as const, requestId: request() };
    const result = await recordStudentPracticeProgress(studentA, progress);
    expect(await recordStudentPracticeProgress(studentA, progress)).toEqual(result);
    expect(result.attemptCount).toBe(1);
    await recordStudentPracticeProgress(studentA, { ...progress, action: "complete", requestId: request() });
    const switched = await select(studentA, trackB, chosen.revision);
    expect(switched.revision).toBe(chosen.revision + 1);
    await expect(recordStudentPracticeProgress(studentA, { ...progress, requestId: request() })).rejects.toThrow();
    const history = await readStudentPracticeHistory(studentA, { sectionId });
    expect(history.history[0]?.status).toBe("completed");
    const lesson = await getSelectedLessonInstruction(studentA, { sectionId, publisherLessonId: "l1" });
    expect(lesson.practice[0]?.progress).toBeNull(); expect(await academicSnapshot()).toBe(before);
    expect((await database.select().from(s.auditEvents)).length).toBe(4);
    expect((await database.select().from(s.domainEvents)).length).toBe(4);
  });
  it("rejects mismatched enrollment, stale choice and an idempotency key reused with different input", async () => {
    const requestId = request(); const chosen = await select(studentA, trackA, 0, requestId);
    await expect(select(studentA, trackB, chosen.revision, requestId)).rejects.toThrow("different input");
    await expect(select(studentA, trackB, 0)).rejects.toThrow("selection changed");
    await expect(selectStudentInstructionalTrack(studentA, { sectionId, sectionEnrollmentId: id(41), trackVersionId: trackA.versionId, expectedRevision: 0, requestId: request() })).rejects.toThrow();
    expect((await listStudentInstructionalTracks(studentA, { sectionId })).current?.versionId).toBe(trackA.versionId);
  });
  it("denies content producers, unrelated guardians and guardians submitting student practice", async () => {
    expect(roleCapabilities.academic_content_creator).not.toContain("assignments:create");
    expect(roleCapabilities.academic_content_reviewer).not.toContain("assignments:grade");
    await expect(listStudentInstructionalTracks(authorA, { sectionId })).rejects.toThrow();
    await expect(listStudentInstructionalTracks(guardian, { sectionId, studentPersonId: studentB.actorPersonId })).rejects.toThrow();
    await expect(recordStudentPracticeProgress(guardian, { sectionId, sectionEnrollmentId: id(40), trackActivityId: trackA.activityId,
      expectedRevision: 1, action: "complete", requestId: request() })).rejects.toThrow();
  });
  it("honors guardian selection policy independently of academic-view permission", async () => {
    await database.update(s.programs).set({ metadata: { instructionalTracks: { ...policy, selectionPolicy: "guardian" } } }).where(eq(s.programs.id, programId));
    try {
      await expect(select(studentA, trackA)).rejects.toThrow();
      await database.update(s.guardianRelationships).set({ canManageEnrollment: false });
      await expect(selectStudentInstructionalTrack(guardian, { sectionId, studentPersonId: studentA.actorPersonId,
        sectionEnrollmentId: id(40), trackVersionId: trackA.versionId, expectedRevision: 0, requestId: request() })).rejects.toThrow();
      await database.update(s.guardianRelationships).set({ canManageEnrollment: true });
      const selected = await selectStudentInstructionalTrack(guardian, { sectionId, studentPersonId: studentA.actorPersonId,
        sectionEnrollmentId: id(40), trackVersionId: trackA.versionId, expectedRevision: 0, requestId: request() });
      expect(selected.revision).toBe(1);
    } finally { await database.update(s.programs).set({ metadata: { instructionalTracks: policy } }).where(eq(s.programs.id, programId)); }
  });
  it("saves incomplete drafts but refuses to submit missing lesson coverage or publish without reviews", async () => {
    const draft = await createInstructionalTrackDraft(authorA, { programId, courseVersionId, requestId: request(), title: "Incomplete test", slug: "incomplete-test" });
    const saved = await saveInstructionalTrackDraft(authorA, { programId, versionId: draft.versionId, requestId: request(), expectedRevision: draft.revision,
      rightsEvidenceResourceId: null, rightsExpiresAt: null, lessons: [], activities: [] });
    await expect(submitInstructionalTrack(authorA, { programId, versionId: draft.versionId, requestId: request(), expectedRevision: saved.revision })).rejects.toThrow();
    await expect(publishInstructionalTrack(reviewer, { programId, versionId: draft.versionId, requestId: request(), expectedRevision: saved.revision })).rejects.toThrow();
    expect((await readInstructionalTrackDraft(authorA, { programId, versionId: draft.versionId })).version.status).toBe("draft");
    await expect(readInstructionalTrackDraft(authorB, { programId, versionId: draft.versionId })).rejects.toThrow();
  });
  it("denies revoked grants and inactive Program enrollment", async () => {
    await database.update(s.accountPersonGrants).set({ active: false }).where(eq(s.accountPersonGrants.id, studentA.grantId));
    try { await expect(listStudentInstructionalTracks(studentA, { sectionId })).rejects.toThrow(); }
    finally { await database.update(s.accountPersonGrants).set({ active: true }).where(eq(s.accountPersonGrants.id, studentA.grantId)); }
    await database.update(s.enrollments).set({ status: "withdrawn" }).where(eq(s.enrollments.id, id(42)));
    try { await expect(listStudentInstructionalTracks(studentA, { sectionId })).rejects.toThrow(); }
    finally { await database.update(s.enrollments).set({ status: "active" }).where(eq(s.enrollments.id, id(42))); }
  });
  it("serializes competing selections and retains exactly one current selection", async () => {
    const before = await academicSnapshot();
    const outcomes = await Promise.allSettled([select(studentA, trackA), select(studentA, trackB)]);
    expect(outcomes.filter(o => o.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(o => o.status === "rejected")).toHaveLength(1);
    expect((await database.select().from(s.studentInstructionalSelections)).filter(r => !r.supersededAt)).toHaveLength(1);
    expect(await academicSnapshot()).toBe(before);
  });
  it("rechecks explicit course delegation and presenter revocation rather than trusting profiles or old actors", async () => {
    await database.update(s.roleAssignments).set({ capabilities: [] }).where(eq(s.roleAssignments.personId, authorA.actorPersonId));
    try {
      await expect(createInstructionalTrackDraft(authorA, { programId, courseVersionId, requestId: request(), title: "Denied", slug: "denied" })).rejects.toThrow();
      expect((await listStudentInstructionalTracks(studentA, { sectionId })).tracks.some(t => t.versionId === trackA.versionId)).toBe(false);
    } finally {
      await database.update(s.roleAssignments).set({ capabilities: [...authorA.capabilities] }).where(eq(s.roleAssignments.personId, authorA.actorPersonId));
    }
  });
  it("invalidates content after a resource change rather than serving an unreviewed URL", async () => {
    const chosen = await select(studentA, trackA);
    await database.update(s.curriculumResources).set({ url: "https://media.example.test/changed.mp4" }).where(eq(s.curriculumResources.id, id(62)));
    try {
      await expect(getSelectedLessonInstruction(studentA, { sectionId, publisherLessonId: "l1" })).rejects.toThrow();
      expect((await listStudentInstructionalTracks(studentA, { sectionId })).tracks.some(t => t.versionId === chosen.trackVersionId)).toBe(false);
    } finally { await database.update(s.curriculumResources).set({ url: "https://media.example.test/A.mp4" }).where(eq(s.curriculumResources.id, id(62))); }
  });
  it("disables content operations through independent feature flags", async () => {
    process.env.CAN_INSTRUCTIONAL_TRACK_CHOICE_ENABLED = "false";
    try { await expect(listStudentInstructionalTracks(studentA, { sectionId })).rejects.toThrow(); }
    finally { process.env.CAN_INSTRUCTIONAL_TRACK_CHOICE_ENABLED = "true"; }
  });
  it("withdraws unsafe media while keeping historical practice evidence, even when authoring is disabled", async () => {
    const before = await academicSnapshot(); const chosen = await select(studentA, trackB);
    await recordStudentPracticeProgress(studentA, { sectionId, sectionEnrollmentId: id(40), trackActivityId: trackB.activityId,
      expectedRevision: chosen.revision, action: "complete", requestId: request() });
    process.env.CAN_INSTRUCTIONAL_TRACK_AUTHORING_ENABLED = "false";
    try { await withdrawInstructionalTrack(reviewer, { programId, versionId: trackB.versionId, requestId: request(),
      kind: "urgent_safety", legacyAccessUntil: null, reason: "Synthetic urgent withdrawal scenario." }); }
    finally { process.env.CAN_INSTRUCTIONAL_TRACK_AUTHORING_ENABLED = "true"; }
    await expect(getSelectedLessonInstruction(studentA, { sectionId, publisherLessonId: "l1" })).rejects.toThrow();
    expect((await readStudentPracticeHistory(studentA, { sectionId })).history[0]?.status).toBe("completed");
    expect(await academicSnapshot()).toBe(before);
  });
});
