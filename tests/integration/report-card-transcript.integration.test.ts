import { and, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import * as s from "@/db/schema";
import {
  correctSectionGrade,
  getStudentReportCard,
  getStudentTranscript,
  issueTranscript,
} from "@/modules/learning/report-cards.functions";
import { createAcademicTimeFixture } from "./helpers/academic-time";

const state = vi.hoisted(() => ({
  context: null as {
    actorPersonId: string | null;
    role: string;
    capabilities: Set<string>;
    scope: { organizationIds: string[]; siteIds: string[]; programIds: string[] };
    requestId: string;
  } | null,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator() { return this; },
    handler(callback: unknown) { return callback; },
  }),
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => new Request("http://localhost"),
}));
vi.mock("@/modules/identity/command-context.server", () => ({
  getCommandContext: async () => {
    if (!state.context) throw new Error("Test actor is required");
    return state.context;
  },
}));

const integration = process.env.DATABASE_URL ? describe : describe.skip;

integration("GF25 report card and transcript", () => {
  it("preserves an issued transcript snapshot when an authorized teacher corrects a finalized grade", async () => {
    if (process.env.APP_ENV !== "test" || process.env.CAN_TEST_DB_WRITES_ENABLED !== "true") {
      throw new Error("Disposable test branch required");
    }

    const suffix = crypto.randomUUID().slice(0, 8);
    const [jurisdiction] = await db.insert(s.jurisdictions).values({
      code: `gf25-${suffix}`,
      name: `GF25 Jurisdiction ${suffix}`,
    }).returning();
    const [host] = await db.insert(s.organizations).values({
      type: "christian_school",
      name: `GF25 School ${suffix}`,
      slug: `gf25-school-${suffix}`,
    }).returning();
    const [issuer] = await db.insert(s.organizations).values({
      type: "can_network",
      name: `GF25 Credit Issuer ${suffix}`,
      slug: `gf25-issuer-${suffix}`,
    }).returning();
    const [site] = await db.insert(s.sites).values({
      organizationId: host!.id,
      name: "Main",
      slug: `gf25-main-${suffix}`,
    }).returning();
    const [program] = await db.insert(s.programs).values({
      organizationId: host!.id,
      siteId: site!.id,
      jurisdictionId: jurisdiction!.id,
      type: "full_school",
      status: "active",
      name: "GF25 Program",
      slug: `gf25-program-${suffix}`,
      gradeRange: { min: "9", max: "12" },
      academicProviderOrganizationId: host!.id,
      creditIssuingOrganizationId: issuer!.id,
    }).returning();
    const academicTime = await createAcademicTimeFixture({
      organizationId: host!.id,
      siteId: site!.id,
      programId: program!.id,
      suffix,
    });
    const [teacher, registrar, student, guardian, unrelatedGuardian] = await db.insert(s.people).values([
      { legalFirstName: "Teacher", legalLastName: suffix },
      { legalFirstName: "Registrar", legalLastName: suffix },
      { legalFirstName: "Student", legalLastName: suffix },
      { legalFirstName: "Guardian", legalLastName: suffix },
      { legalFirstName: "Unrelated", legalLastName: suffix },
    ]).returning();
    const [profile] = await db.insert(s.studentProfiles).values({
      personId: student!.id,
      gradeLevel: "10",
    }).returning();
    await db.insert(s.guardianRelationships).values({
      guardianPersonId: guardian!.id,
      studentPersonId: student!.id,
      relationshipLabel: "parent",
      canViewAcademics: true,
    });
    const [course] = await db.insert(s.courseTemplates).values({
      owningOrganizationId: host!.id,
      code: `GF25-${suffix}`,
      title: "Transcript Course",
      subject: "Science",
    }).returning();
    const [version] = await db.insert(s.courseTemplateVersions).values({
      courseTemplateId: course!.id,
      version: 1,
      status: "published",
    }).returning();
    const [section] = await db.insert(s.sections).values({
      programId: program!.id,
      siteId: site!.id,
      courseTemplateVersionId: version!.id,
      termId: academicTime.term.id,
      code: `GF25-${suffix}`,
      title: "Transcript Course",
      metadata: { credits: 1 },
    }).returning();
    await db.insert(s.sectionTeachers).values({
      sectionId: section!.id,
      personId: teacher!.id,
    });
    const [grade] = await db.insert(s.sectionGrades).values({
      sectionId: section!.id,
      studentProfileId: profile!.id,
      gradingPeriodId: academicTime.gradingPeriod.id,
      termId: academicTime.term.id,
      status: "finalized",
      score: "95",
      percentage: "95",
      letterGrade: "A",
      gradeScaleId: academicTime.gradeScale.id,
      finalizedByPersonId: teacher!.id,
      finalizedAt: new Date(),
    }).returning();

    const scope = {
      organizationIds: [host!.id, issuer!.id],
      siteIds: [site!.id],
      programIds: [program!.id],
    };
    state.context = {
      actorPersonId: teacher!.id,
      role: "teacher",
      capabilities: new Set(["assignments:grade"]),
      scope,
      requestId: `gf25-${suffix}`,
    };
    const gradeCorrection = {
      sectionGradeId: grade!.id,
      percentage: 84,
      reason: "Verified scoring error",
    };

    state.context = {
      ...state.context,
      actorPersonId: unrelatedGuardian!.id,
      role: "guardian",
      capabilities: new Set(["student:related-read"]),
    };
    await expect(getStudentReportCard({ data: { studentPersonId: student!.id } }))
      .rejects.toThrow("guardian academic relationship");

    state.context = {
      ...state.context,
      actorPersonId: registrar!.id,
      role: "registrar",
      capabilities: new Set(["enrollment:manage"]),
    };
    const { issuanceId } = await issueTranscript({
      data: { studentPersonId: student!.id, purpose: "Official transcript" },
    });
    const [issuance] = await db.select().from(s.transcriptIssuances)
      .where(eq(s.transcriptIssuances.id, issuanceId));
    expect(issuance!.issuingOrganizationId).toBe(issuer!.id);
    expect(issuance!.snapshot.rows).toEqual([
      expect.objectContaining({ letterGrade: "A", creditsEarned: 1 }),
    ]);

    state.context = {
      ...state.context,
      actorPersonId: teacher!.id,
      role: "teacher",
      capabilities: new Set(["assignments:grade"]),
    };
    await correctSectionGrade({ data: gradeCorrection });

    state.context = {
      ...state.context,
      actorPersonId: student!.id,
      role: "student",
      capabilities: new Set(["student:read"]),
    };
    const reportCard = await getStudentReportCard({ data: {} });
    expect(reportCard.grades).toEqual([
      expect.objectContaining({ sectionGradeId: grade!.id, percentage: "84.00", letterGrade: "B" }),
    ]);
    const transcript = await getStudentTranscript({ data: {} });
    expect(transcript.rows).toEqual([
      expect.objectContaining({ sectionGradeId: grade!.id, letterGrade: "B", creditsEarned: 1 }),
    ]);
    expect(transcript.issuances).toEqual([
      expect.objectContaining({ id: issuanceId, issuingOrganization: issuer!.name }),
    ]);
    const [persistedIssuance] = await db.select().from(s.transcriptIssuances)
      .where(eq(s.transcriptIssuances.id, issuanceId));
    expect(persistedIssuance!.snapshot.rows).toEqual([
      expect.objectContaining({ letterGrade: "A", percentage: "95.00" }),
    ]);

    state.context = {
      ...state.context,
      actorPersonId: guardian!.id,
      role: "guardian",
      capabilities: new Set(["student:related-read"]),
    };
    await expect(getStudentTranscript({ data: { studentPersonId: student!.id } }))
      .resolves.toMatchObject({ rows: [expect.objectContaining({ letterGrade: "B" })] });

    const corrections = await db.select().from(s.auditEvents).where(and(
      eq(s.auditEvents.resourceType, "section_grade"),
      eq(s.auditEvents.resourceId, grade!.id),
      eq(s.auditEvents.action, "grade.correction"),
    ));
    expect(corrections).toHaveLength(1);
  });
});
