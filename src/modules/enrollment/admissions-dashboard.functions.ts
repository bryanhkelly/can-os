import { createServerFn } from "@tanstack/react-start";
import { and, count, desc, eq, inArray, ne } from "drizzle-orm";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { operationsSelectionSchema, resolveOperationsSelection } from "@/modules/operations/operations-scope.server";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import { pipelineStages, type AdmissionsStage } from "@/domain/admissions-pipeline";
import { z } from "zod";

const pageSize = 40;
const admissionsDashboardInputSchema = operationsSelectionSchema.extend({
  applicationId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  stage: z.enum(["lead", "inquiry", "application", "eligibility", "accepted", "declined", "withdrawn"]).optional(),
}).strict();

type AdmissionsSummary = {
  total: number;
  awaitingDecision: number;
  missingRequirements: number;
  byStage: { stage: AdmissionsStage; count: number }[];
};

/** Verified registrars see authorized applications, with exact detail separate from the bounded list. */
export const getAdmissionsDashboard = createServerFn({ method: "GET" })
  .validator((value: unknown) => admissionsDashboardInputSchema.parse(value ?? {}))
  .handler(async ({ data }) => {
    const actor = await getCommandContext(getRequest());
    setResponseHeader("Cache-Control", "private, no-store");
    if (actor.role !== "registrar" || !actor.actorPersonId || !actor.scope.organizationIds?.length) {
      throw new AuthorizationError("registrar admissions dashboard");
    }
    assertCapability(actor, "enrollment.decide");
    const scoped = await resolveOperationsSelection(actor, data);
    const emptySummary: AdmissionsSummary = {
      total: 0,
      awaitingDecision: 0,
      missingRequirements: 0,
      byStage: pipelineStages.map(stage => ({ stage, count: 0 })),
    };
    if (!process.env.DATABASE_URL) {
      return {
        rows: [],
        detail: null,
        summary: emptySummary,
        page: data.page,
        pageSize,
        filteredTotal: 0,
        hasMore: false,
      };
    }
    if (!scoped.programIds.length) {
      return {
        rows: [],
        detail: null,
        summary: emptySummary,
        page: data.page,
        pageSize,
        filteredTotal: 0,
        hasMore: false,
      };
    }

    const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
    const stageCounts = await db.select({
      stage: s.applications.stage,
      count: count(),
    }).from(s.applications)
      .where(inArray(s.applications.programId, scoped.programIds))
      .groupBy(s.applications.stage);
    const countByStage = new Map(stageCounts.map(row => [row.stage, row.count]));
    const total = stageCounts.reduce((sum, row) => sum + row.count, 0);
    const [requirementsCount] = await db.select({ count: count() })
      .from(s.applications)
      .innerJoin(s.journeys, and(
        eq(s.journeys.participantType, "application"),
        eq(s.journeys.participantId, s.applications.id),
      ))
      .innerJoin(s.journeyRequirements, eq(s.journeyRequirements.journeyId, s.journeys.id))
      .where(and(
        inArray(s.applications.programId, scoped.programIds),
        eq(s.journeyRequirements.blocking, true),
        ne(s.journeyRequirements.status, "complete"),
      ));

    const summary: AdmissionsSummary = {
      total,
      awaitingDecision: (countByStage.get("application") ?? 0) + (countByStage.get("eligibility") ?? 0),
      missingRequirements: requirementsCount?.count ?? 0,
      byStage: pipelineStages.map(stage => ({ stage, count: countByStage.get(stage) ?? 0 })),
    };
    const filteredTotal = data.stage ? countByStage.get(data.stage) ?? 0 : total;
    const lastPage = Math.max(1, Math.ceil(filteredTotal / pageSize));
    const page = Math.min(data.page, lastPage);

    const applicationSelection = {
      id: s.applications.id,
      stage: s.applications.stage,
      submittedAt: s.applications.submittedAt,
      program: s.programs.name,
      programId: s.applications.programId,
      studentProfileId: s.applications.studentProfileId,
      studentPersonId: s.studentProfiles.personId,
      siteId: s.programs.siteId,
      organizationId: s.programs.organizationId,
      firstName: s.people.legalFirstName,
      lastName: s.people.legalLastName,
      preferredName: s.people.preferredName,
      metadata: s.applications.metadata,
    };
    const records = data.applicationId
      ? await db.select(applicationSelection)
        .from(s.applications)
        .innerJoin(s.programs, eq(s.applications.programId, s.programs.id))
        .innerJoin(s.studentProfiles, eq(s.studentProfiles.id, s.applications.studentProfileId))
        .innerJoin(s.people, eq(s.people.id, s.studentProfiles.personId))
        .where(and(
          inArray(s.applications.programId, scoped.programIds),
          eq(s.applications.id, data.applicationId),
        ))
        .limit(1)
      : await db.select(applicationSelection)
        .from(s.applications)
        .innerJoin(s.programs, eq(s.applications.programId, s.programs.id))
        .innerJoin(s.studentProfiles, eq(s.studentProfiles.id, s.applications.studentProfileId))
        .innerJoin(s.people, eq(s.people.id, s.studentProfiles.personId))
        .where(and(
          inArray(s.applications.programId, scoped.programIds),
          data.stage ? eq(s.applications.stage, data.stage) : undefined,
        ))
        .orderBy(desc(s.applications.updatedAt), desc(s.applications.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

    if (!records.length) {
      return {
        rows: [],
        detail: null,
        summary,
        page,
        pageSize,
        filteredTotal,
        hasMore: page < lastPage,
      };
    }

    const ids = records.map(record => record.id);
    const profileIds = [...new Set(records.map(record => record.studentProfileId))];
    const journeys = await db.select({
      id: s.journeys.id,
      participantId: s.journeys.participantId,
    }).from(s.journeys).where(and(
      eq(s.journeys.participantType, "application"),
      inArray(s.journeys.participantId, ids),
    ));
    const offers = await db.select({
      id: s.admissionOffers.id,
      applicationId: s.admissionOffers.applicationId,
      status: s.admissionOffers.status,
      expiresAt: s.admissionOffers.expiresAt,
      schoolYearId: s.admissionOffers.schoolYearId,
      createdAt: s.admissionOffers.createdAt,
    }).from(s.admissionOffers).where(inArray(s.admissionOffers.applicationId, ids));
    const enrollmentRows = await db.select({
      studentProfileId: s.enrollments.studentProfileId,
      programId: s.enrollments.programId,
      schoolYearId: s.enrollments.schoolYearId,
      status: s.enrollments.status,
      kind: s.enrollments.kind,
    }).from(s.enrollments).where(inArray(s.enrollments.studentProfileId, profileIds));
    const accessConsents = await db.select({
      applicationId: s.studentAccessConsents.applicationId,
      status: s.studentAccessConsents.status,
    }).from(s.studentAccessConsents).where(inArray(s.studentAccessConsents.applicationId, ids));
    const accessByApplication = new Map(accessConsents.map(consent => [consent.applicationId, consent.status]));
    // An approved consent remains historical after a revocation. Use the actual currently active student-only grant.
    const availableGrants = await db.select({
      applicationId: s.studentAccessConsents.applicationId,
      personId: s.accountPersonGrants.personId,
      organizationId: s.accountPersonGrants.organizationId,
      siteId: s.accountPersonGrants.siteId,
    }).from(s.studentAccessConsents)
      .innerJoin(s.accessAccounts, eq(s.accessAccounts.emailNormalized, s.studentAccessConsents.studentEmail))
      .innerJoin(s.accountPersonGrants, eq(s.accountPersonGrants.accountId, s.accessAccounts.id))
      .where(and(
        inArray(s.studentAccessConsents.applicationId, ids),
        eq(s.studentAccessConsents.status, "approved"),
        eq(s.accessAccounts.disabled, false),
        eq(s.accountPersonGrants.active, true),
        eq(s.accountPersonGrants.role, "student"),
      ));
    const requirements = journeys.length
      ? await db.select({
        journeyId: s.journeyRequirements.journeyId,
        status: s.journeyRequirements.status,
        blocking: s.journeyRequirements.blocking,
      }).from(s.journeyRequirements)
        .where(inArray(s.journeyRequirements.journeyId, journeys.map(journey => journey.id)))
      : [];

    const rows = records.map(record => {
      const applicationJourneys = journeys.filter(journey => journey.participantId === record.id);
      return {
        id: record.id,
        studentName: `${record.preferredName ?? record.firstName} ${record.lastName}`,
        programId: record.programId,
        program: record.program,
        stage: record.stage,
        disposition: record.metadata.admissionsDisposition === "waitlisted" ? "waitlisted" : null,
        activeSectionCount: enrollmentRows.filter(enrollment =>
          enrollment.studentProfileId === record.studentProfileId &&
          enrollment.programId === record.programId &&
          enrollment.kind === "section" &&
          enrollment.status === "active" &&
          enrollmentRows.some(programEnrollment =>
            programEnrollment.studentProfileId === record.studentProfileId &&
            programEnrollment.programId === record.programId &&
            programEnrollment.kind === "program" &&
            programEnrollment.status === "active" &&
            programEnrollment.schoolYearId === enrollment.schoolYearId,
          ),
        ).length,
        studentAccessStatus: accessByApplication.get(record.id) === "approved" &&
          !availableGrants.some(grant =>
            grant.applicationId === record.id &&
            grant.personId === record.studentPersonId &&
            grant.organizationId === record.organizationId &&
            grant.siteId === record.siteId,
          )
          ? "access_unavailable"
          : accessByApplication.get(record.id) ?? "not_requested",
        submittedAt: record.submittedAt?.toISOString() ?? null,
        outstandingRequirements: requirements.filter(requirement =>
          requirement.blocking &&
          requirement.status !== "complete" &&
          applicationJourneys.some(journey => journey.id === requirement.journeyId),
        ).length,
        enrollments: enrollmentRows.filter(enrollment =>
          enrollment.studentProfileId === record.studentProfileId &&
          enrollment.programId === record.programId &&
          enrollment.kind === "program" &&
          enrollment.status === "active",
        ).map(enrollment => ({ schoolYearId: enrollment.schoolYearId, status: enrollment.status })),
        offers: offers.filter(offer => offer.applicationId === record.id)
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
          .map(offer => ({
            id: offer.id,
            status: offer.status,
            expiresAt: offer.expiresAt?.toISOString() ?? null,
            schoolYearId: offer.schoolYearId,
          })),
      };
    });

    return {
      rows: data.applicationId ? [] : rows,
      detail: data.applicationId ? rows[0] ?? null : null,
      summary,
      page,
      pageSize,
      filteredTotal,
      hasMore: page < lastPage,
    };
  });

/** Counts every active program enrollment in the authorized school scope, including
 * students enrolled outside the admissions application workflow. */
export const getActiveEnrollmentCounts = createServerFn({ method: "GET" })
  .validator((value: unknown) => operationsSelectionSchema.parse(value ?? {}))
  .handler(async ({ data }) => {
    const actor = await getCommandContext(getRequest());
    setResponseHeader("Cache-Control", "private, no-store");
    if (actor.role !== "registrar" || !actor.actorPersonId || !actor.scope.organizationIds?.length) {
      throw new AuthorizationError("registrar enrollment totals");
    }
    assertCapability(actor, "enrollment.decide");
    const scoped = await resolveOperationsSelection(actor, data);
    if (!process.env.DATABASE_URL || !scoped.programIds.length) return [];
    const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
    const { countDistinct } = await import("drizzle-orm");
    return db.select({
      programId: s.enrollments.programId,
      activeStudents: countDistinct(s.enrollments.studentProfileId),
    }).from(s.enrollments)
      .where(and(
        inArray(s.enrollments.programId, scoped.programIds),
        eq(s.enrollments.kind, "program"),
        eq(s.enrollments.status, "active"),
      ))
      .groupBy(s.enrollments.programId);
  });
