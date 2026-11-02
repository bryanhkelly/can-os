import { and, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import * as s from "@/db/schema";
import {
  correctSectionGrade,
  finalizeSectionGrades,
  getStudentReportCard,
  getStudentTranscript,
  issueTranscript,
  listTranscriptIssuanceCandidates,
} from "@/modules/learning/report-cards.functions";
import { createAcademicTimeFixture } from "./helpers/academic-time";
import { summarizeRecordedTranscriptCredits } from "@/domain/recorded-credit-summary";

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
    const [teacher, registrar, student, finalizationStudent, guardian, unrelatedGuardian] = await db.insert(s.people).values([
      { legalFirstName: "Teacher", legalLastName: suffix },
      { legalFirstName: "Registrar", legalLastName: suffix },
      { legalFirstName: "Student", legalLastName: suffix },
      { legalFirstName: "Finalization", legalLastName: suffix },
      { legalFirstName: "Guardian", legalLastName: suffix },
      { legalFirstName: "Unrelated", legalLastName: suffix },
    ]).returning();
    const [profile, finalizationProfile] = await db.insert(s.studentProfiles).values([
      { personId: student!.id, gradeLevel: "10" },
      { personId: finalizationStudent!.id, gradeLevel: "10" },
    ]).returning();
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
    await db.insert(s.enrollments).values([profile!, finalizationProfile!].flatMap(studentProfile =>
      (["program", "section"] as const).map(kind => ({
        studentProfileId: studentProfile.id, kind, status: "active" as const,
        organizationId: host!.id, programId: program!.id,
        sectionId: kind === "section" ? section!.id : null,
        schoolYearId: academicTime.schoolYear.id,
      }))));
    const [assessment] = await db.insert(s.assessments).values({
      sectionId: section!.id,
      title: "Quarter assessment",
      status: "published",
      pointsPossible: "100",
      dueAt: new Date("2027-09-01T12:00:00.000Z"),
      createdByPersonId: teacher!.id,
    }).returning();
    await db.insert(s.submissions).values([profile!, finalizationProfile!].map(studentProfile => ({
      assessmentId: assessment!.id,
      studentProfileId: studentProfile.id,
      status: "graded" as const,
      score: "84",
      graderPersonId: teacher!.id,
    })));
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
    state.context = {
      ...state.context,
      actorPersonId: registrar!.id,
      role: "registrar",
      capabilities: new Set(["enrollment:manage"]),
    };
    await expect(listTranscriptIssuanceCandidates({ data: { query: "St" } }))
      .resolves.toMatchObject({
        candidates: [expect.objectContaining({
          studentPersonId: student!.id,
          issuer: { id: issuer!.id, name: issuer!.name },
          multipleIssuers: false,
        })],
      });
    await expect(listTranscriptIssuanceCandidates({ data: { query: "S" } }))
      .resolves.toEqual({ candidates: [] });
    const gradeCorrection = {
      sectionGradeId: grade!.id,
      percentage: 84,
      reason: "Verified scoring error",
    };
    state.context = {
      ...state.context,
      actorPersonId: teacher!.id,
      role: "teacher",
      capabilities: new Set(["assignments:grade"]),
    };
    // A stale Section record must not finalize a withdrawn Program learner.
    await db.update(s.enrollments).set({status:"withdrawn"}).where(and(
      eq(s.enrollments.studentProfileId,finalizationProfile!.id),
      eq(s.enrollments.kind,"program"),
    ));
    await expect(finalizeSectionGrades({data:{
      sectionId:section!.id,gradingPeriodId:academicTime.gradingPeriod.id,
    }})).resolves.toEqual({finalized:0,skipped:1});
    await db.update(s.enrollments).set({status:"active"}).where(and(
      eq(s.enrollments.studentProfileId,finalizationProfile!.id),
      eq(s.enrollments.kind,"program"),
    ));
    const concurrentFinalizations = await Promise.all([0,1].map(()=>
      finalizeSectionGrades({data:{
        sectionId:section!.id,gradingPeriodId:academicTime.gradingPeriod.id,
      }})));
    expect(concurrentFinalizations.map(result=>result.finalized).sort()).toEqual([0,1]);
    expect(concurrentFinalizations.map(result=>result.skipped).sort()).toEqual([1,2]);
    await expect(finalizeSectionGrades({ data: {
      sectionId: section!.id,
      gradingPeriodId: academicTime.gradingPeriod.id,
    } })).resolves.toEqual({ finalized: 0, skipped: 2 });
    const [finalized] = await db.select().from(s.sectionGrades).where(and(
      eq(s.sectionGrades.studentProfileId, finalizationProfile!.id),
      eq(s.sectionGrades.sectionId, section!.id),
      eq(s.sectionGrades.gradingPeriodId, academicTime.gradingPeriod.id),
    ));
    expect(finalized).toMatchObject({
      status: "finalized",
      percentage: "84.00",
      letterGrade: "B",
    });
    const publishedNotices = await db.select().from(s.notifications).where(and(
      eq(s.notifications.recipientPersonId, finalizationStudent!.id),
      eq(s.notifications.type, "report_card_published"),
      eq(s.notifications.resourceId, finalized!.id),
    ));
    expect(publishedNotices).toHaveLength(1);

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
    // A host registrar can read the school's own student records, but cannot
    // impersonate the independently named CAN credit issuer.
    state.context = {
      ...state.context,
      scope: { ...scope, organizationIds: [host!.id] },
    };
    await expect(issueTranscript({
      data: { studentPersonId: student!.id, purpose: "Unauthorized external issuer" },
    })).rejects.toThrow("verified credit-issuer organization grant");
    const unauthorizedIssuances = await db.select({id:s.transcriptIssuances.id})
      .from(s.transcriptIssuances).where(eq(s.transcriptIssuances.studentProfileId,profile!.id));
    expect(unauthorizedIssuances).toHaveLength(0);
    state.context = { ...state.context, scope };

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

    // A transcript is an academic record even when course credit units have
    // not been configured. Add a finalized course with unknown credits to
    // the SAME student, program, school and issuing institution.
    const [uncreditedSection] = await db.insert(s.sections).values({
      programId: program!.id,
      siteId: site!.id,
      courseTemplateVersionId: version!.id,
      termId: academicTime.term.id,
      code: `GF25-NOCREDIT-${suffix}`,
      title: "Course With Credits Pending",
      metadata: {},
    }).returning();
    await db.insert(s.enrollments).values({
      studentProfileId: profile!.id,
      kind: "section",
      status: "active",
      organizationId: host!.id,
      programId: program!.id,
      sectionId: uncreditedSection!.id,
      schoolYearId: academicTime.schoolYear.id,
    });
    await db.insert(s.sectionGrades).values({
      sectionId: uncreditedSection!.id,
      studentProfileId: profile!.id,
      gradingPeriodId: academicTime.gradingPeriod.id,
      termId: academicTime.term.id,
      status: "finalized",
      score: "87",
      percentage: "87",
      letterGrade: "B",
      gradeScaleId: academicTime.gradeScale.id,
      finalizedByPersonId: teacher!.id,
      finalizedAt: new Date(),
    });
    state.context = {
      ...state.context,
      actorPersonId: student!.id,
      role: "student",
      capabilities: new Set(["student:read"]),
    };
    const academicHistory = await getStudentTranscript({ data: {} });
    const creditReview = summarizeRecordedTranscriptCredits(academicHistory.rows);
    expect(creditReview.byIssuer).toEqual([
      expect.objectContaining({
        issuerId: issuer!.id,
        issuerName: issuer!.name,
        earnedUnits: 1, attemptedUnits: 1,
        incompleteEntries: 1, conflictingEntries: 0,
        subjects: [expect.objectContaining({
          subject: "Science", earnedUnits: 1, attemptedUnits: 1,
          incompleteEntries: 1,
        })],
      }),
    ]);
    expect(creditReview.graduationStatus).toBe("not_evaluated");
    expect(creditReview.diplomaAuthorized).toBe(false);
    expect(academicHistory.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({sectionId: section!.id, subject: "Science", terminalPeriod:true}),
      expect.objectContaining({sectionId: uncreditedSection!.id, subject: "Science", terminalPeriod:true}),
    ]));
    expect(academicHistory.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ sectionId: section!.id, creditsEarned: 1 }),
      expect.objectContaining({
        sectionId: uncreditedSection!.id,
        sectionTitle: "Course With Credits Pending",
        letterGrade: "B",
        creditConfigured: false,
        creditsAttempted: null,
        creditsEarned: null,
      }),
    ]));
    state.context = {
      ...state.context,
      actorPersonId: registrar!.id,
      role: "registrar",
      capabilities: new Set(["enrollment:manage"]),
    };
    const withUnknownCredit = await issueTranscript({
      data: { studentPersonId: student!.id, purpose: "Transcript with unrecorded credits" },
    });
    const [issuedWithUnknown] = await db.select().from(s.transcriptIssuances)
      .where(eq(s.transcriptIssuances.id, withUnknownCredit.issuanceId));
    expect(issuedWithUnknown!.issuingOrganizationId).toBe(issuer!.id);
    expect(issuedWithUnknown!.snapshot.unrecordedCreditRows).toBe(1);
    expect(issuedWithUnknown!.snapshot.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sectionId: uncreditedSection!.id,
        creditsAttempted: null,
        creditsEarned: null,
        letterGrade: "B",
      }),
    ]));
    // The earlier issued transcript is still the immutable original snapshot.
    const [originalSnapshot] = await db.select().from(s.transcriptIssuances)
      .where(eq(s.transcriptIssuances.id, issuanceId));
    expect(originalSnapshot!.snapshot.rows).toHaveLength(1);
    expect(originalSnapshot!.snapshot.rows).toEqual([
      expect.objectContaining({ creditsEarned: 1, letterGrade: "A" }),
    ]);

    const corrections = await db.select().from(s.auditEvents).where(and(
      eq(s.auditEvents.resourceType, "section_grade"),
      eq(s.auditEvents.resourceId, grade!.id),
      eq(s.auditEvents.action, "grade.correction"),
    ));
    expect(corrections).toHaveLength(1);
  });
});
