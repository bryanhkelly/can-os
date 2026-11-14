import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, desc, eq, gte, ilike, inArray, lt, or } from "drizzle-orm";
import { z } from "zod";
import { alias } from "drizzle-orm/pg-core";
import { accessibleClasses } from "@/modules/learning/class-access.server";
import type { Actor } from "@/modules/identity/actors.server";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { AuthorizationError, type CommandContext } from "@/domain/command-context";
import { studentAcademicTimeline } from "@/domain/student-academic-timeline";
import { personDisplayName } from "@/domain/person-name";
import { guardianRelationshipPredicate } from "@/domain/guardian-relationship";

/**
 * Staff directory authorization: teacher, registrar, specialist and counselor,
 * always scoped to their verified siteIds (resolved from DB grants, never caller claims).
 *
 * Visibility model (documented choice):
 * - Registrar: all students with an active section enrollment at scoped sites.
 * - Teacher: students actively enrolled in sections they teach (at scoped sites).
 * - Specialist/counselor: students at scoped sites. Support staff are routed site-wide
 *   (see support/support-referrals.functions.ts), so directory scope
 *   matches site scope rather than referral-only scope.
 *
 * Medical, discipline, and contact fields are never selected or returned.
 */

type StaffContext = CommandContext & { role: string };

const staffRoles = ["teacher", "registrar", "site_admin", "specialist", "counselor"] as const;
type StaffRole = (typeof staffRoles)[number];

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireStaffDirectoryContext(): Promise<StaffContext & { role: StaffRole; siteIds: string[] }> {
  const context = (await getCommandContext(getRequest())) as StaffContext;
  if (!staffRoles.includes(context.role as StaffRole)) {
    throw new AuthorizationError("staff directory role");
  }
  // Delegated academic teachers can have exact-Section authority without a
  // host Site grant. All teacher relationships are rechecked below.
  if (!context.actorPersonId || !(context.scope.siteIds?.length ||
      (context.role === "teacher" && context.scope.sectionIds?.length))) {
    throw new AuthorizationError("staff named Section or Site scope");
  }
  return { ...context, role: context.role as StaffRole, siteIds: context.scope.siteIds ?? [] };
}

type Db = Awaited<typeof import("@/db/client")>["db"];
type Schema = typeof import("@/db/schema");

/**
 * Student profile IDs visible to this caller at their scoped sites.
 * Teachers are additionally constrained to sections they teach.
 */
async function visibleStudentProfileIds(
  db: Db,
  s: Schema,
  context: { role: StaffRole; actorPersonId: string; siteIds: string[]; programIds: string[]; teacherSectionIds: string[] },
): Promise<string[]> {
  const conditions = [
    eq(s.enrollments.kind, "section"),
    eq(s.enrollments.status, "active"),
    inArray(s.sections.siteId, context.siteIds),
    inArray(s.sections.programId, context.programIds),
  ];
  if (context.role === "teacher") {
    if (!context.teacherSectionIds.length) return [];
    const activeProgram = alias(s.enrollments, "staff_directory_active_program");
    const rows = await db
      .select({ studentProfileId: s.enrollments.studentProfileId })
      .from(s.enrollments)
      .innerJoin(s.sections, eq(s.sections.id, s.enrollments.sectionId))
      .innerJoin(s.terms, eq(s.terms.id, s.sections.termId))
      .innerJoin(activeProgram, and(
        eq(activeProgram.studentProfileId, s.enrollments.studentProfileId),
        eq(activeProgram.programId, s.sections.programId),
        eq(activeProgram.schoolYearId, s.terms.schoolYearId),
        eq(activeProgram.kind, "program"), eq(activeProgram.status, "active"),
      ))
      .where(and(eq(s.enrollments.kind, "section"),eq(s.enrollments.status, "active"),
        eq(s.enrollments.programId, s.sections.programId),
        eq(s.enrollments.schoolYearId, s.terms.schoolYearId),
        inArray(s.sections.id, context.teacherSectionIds)));
    return [...new Set(rows.map(row => row.studentProfileId))];
  }
  const rows = await db
    .select({ studentProfileId: s.enrollments.studentProfileId })
    .from(s.enrollments)
    .innerJoin(s.sections, eq(s.sections.id, s.enrollments.sectionId))
    .where(and(...conditions));
  return [...new Set(rows.map((row) => row.studentProfileId))];
}

/**
 * Count published/closed, past-due assessments in each student's active sections
 * whose latest submission attempt is still "assigned" (or never started).
 */
async function missingWorkCounts(
  db: Db,
  s: Schema,
  profileIds: string[],
  permittedSectionIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>(profileIds.map((id) => [id, 0]));
  if (!profileIds.length || !permittedSectionIds.length) return counts;
  const roster = await db
    .select({ studentProfileId: s.enrollments.studentProfileId, sectionId: s.enrollments.sectionId })
    .from(s.enrollments)
    .where(
      and(
        inArray(s.enrollments.studentProfileId, profileIds),
        inArray(s.enrollments.sectionId, permittedSectionIds),
        eq(s.enrollments.kind, "section"),
        eq(s.enrollments.status, "active"),
      ),
    );
  const sectionIds = [...new Set(roster.map((row) => row.sectionId).filter((id): id is string => !!id))];
  if (!sectionIds.length) return counts;
  const now = new Date();
  const due = await db
    .select({ id: s.assessments.id, sectionId: s.assessments.sectionId })
    .from(s.assessments)
    .where(
      and(
        inArray(s.assessments.sectionId, sectionIds),
        inArray(s.assessments.status, ["published", "closed"]),
        lt(s.assessments.dueAt, now),
      ),
    );
  if (!due.length) return counts;
  const submissions = await db
    .select({
      assessmentId: s.submissions.assessmentId,
      studentProfileId: s.submissions.studentProfileId,
      status: s.submissions.status,
      attemptNumber: s.submissions.attemptNumber,
    })
    .from(s.submissions)
    .where(
      and(
        inArray(s.submissions.assessmentId, due.map((row) => row.id)),
        inArray(s.submissions.studentProfileId, profileIds),
      ),
    );
  const latest = new Map<string, (typeof submissions)[number]>();
  for (const sub of submissions) {
    const key = `${sub.assessmentId}:${sub.studentProfileId}`;
    const prev = latest.get(key);
    if (!prev || sub.attemptNumber > prev.attemptNumber) latest.set(key, sub);
  }
  const sectionsByProfile = new Map<string, Set<string>>();
  for (const row of roster) {
    const set = sectionsByProfile.get(row.studentProfileId) ?? new Set<string>();
    if (row.sectionId) set.add(row.sectionId);
    sectionsByProfile.set(row.studentProfileId, set);
  }
  for (const assessment of due) {
    for (const [profileId, studentSections] of sectionsByProfile) {
      if (!studentSections.has(assessment.sectionId)) continue;
      const sub = latest.get(`${assessment.id}:${profileId}`);
      if (!sub || sub.status === "assigned" || sub.status === "returned") {
        counts.set(profileId, (counts.get(profileId) ?? 0) + 1);
      }
    }
  }
  return counts;
}

export const searchStudents = createServerFn({ method: "GET" })
  .validator((value: unknown) =>
    z.object({ query: z.string().trim().max(100).optional() }).parse(value ?? {}),
  )
  .handler(async ({ data }) => {
    const context = await requireStaffDirectoryContext();
    const teacherSectionIds = context.role === "teacher"
      ? (await accessibleClasses(context as Actor)).map(section => section.id) : [];
    const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
    const profileIds = await visibleStudentProfileIds(db, s, {
      role: context.role,
      actorPersonId: context.actorPersonId!,
      siteIds: context.siteIds,
      programIds: context.scope.programIds??[],
      teacherSectionIds,
    });
    if (!profileIds.length) return { students: [] };
    const query = data.query?.trim();
    const nameFilter = query
      ? or(
          ilike(s.people.legalFirstName, `%${query}%`),
          ilike(s.people.legalLastName, `%${query}%`),
          ilike(s.people.preferredName, `%${query}%`),
        )
      : undefined;
    const rows = await db
      .select({
        profileId: s.studentProfiles.id,
        personId: s.people.id,
        legalFirstName: s.people.legalFirstName,
        legalLastName: s.people.legalLastName,
        preferredName: s.people.preferredName,
        gradeLevel: s.studentProfiles.gradeLevel,
      })
      .from(s.studentProfiles)
      .innerJoin(s.people, eq(s.people.id, s.studentProfiles.personId))
      .where(and(inArray(s.studentProfiles.id, profileIds), nameFilter))
      .orderBy(s.people.legalLastName, s.people.legalFirstName)
      .limit(50);
    if (!rows.length) return { students: [] };
    const ids = rows.map((row) => row.profileId);
    const permittedSectionIds = context.role === "teacher" ? teacherSectionIds :
      (await db.select({id:s.sections.id}).from(s.sections)
        .where(and(inArray(s.sections.siteId,context.siteIds),
          inArray(s.sections.programId,context.scope.programIds??[]))))
          .map(section=>section.id);
    const activeEnrollments = await db
      .select({ studentProfileId: s.enrollments.studentProfileId, sectionId: s.enrollments.sectionId })
      .from(s.enrollments)
      .where(
        and(
          inArray(s.enrollments.studentProfileId, ids),
          inArray(s.enrollments.sectionId,permittedSectionIds),
          eq(s.enrollments.kind, "section"),
          eq(s.enrollments.status, "active"),
        ),
      );
    const sectionCounts = new Map<string, Set<string>>();
    for (const row of activeEnrollments) {
      const set = sectionCounts.get(row.studentProfileId) ?? new Set<string>();
      if (row.sectionId) set.add(row.sectionId);
      sectionCounts.set(row.studentProfileId, set);
    }
    const missing = await missingWorkCounts(db, s, ids, permittedSectionIds);
    return {
      students: rows.map((row) => ({
        personId: row.personId,
        name: personDisplayName(row),
        gradeLevel: row.gradeLevel,
        activeSectionCount: sectionCounts.get(row.profileId)?.size ?? 0,
        openMissingWorkCount: missing.get(row.profileId) ?? 0,
      })),
    };
  });

export const getStudent360 = createServerFn({ method: "GET" })
  .validator((value: unknown) =>
    z.object({ studentPersonId: z.string().min(1) }).parse(value),
  )
  .handler(async ({ data }) => {
    const context = await requireStaffDirectoryContext();
    if (!uuidPattern.test(data.studentPersonId)) {
      throw new AuthorizationError("student identifier");
    }
    const teacherSectionIds = context.role === "teacher"
      ? (await accessibleClasses(context as Actor)).map(section => section.id) : [];
    const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
    const [profile] = await db
      .select({
        id: s.studentProfiles.id,
        personId: s.people.id,
        legalFirstName: s.people.legalFirstName,
        legalLastName: s.people.legalLastName,
        preferredName: s.people.preferredName,
        gradeLevel: s.studentProfiles.gradeLevel,
      })
      .from(s.studentProfiles)
      .innerJoin(s.people, eq(s.people.id, s.studentProfiles.personId))
      .where(eq(s.studentProfiles.personId, data.studentPersonId))
      .limit(1);
    if (!profile) throw new AuthorizationError("student profile");

    // Per-student authorization: teacher-of-a-shared-section, or registrar/specialist
    // with the student actively enrolled at a scoped site.
    const activeProgram = alias(s.enrollments, "staff_360_active_program");
    const activeSections = await db
      .select({ sectionId: s.sections.id, sectionTitle: s.sections.title, siteId: s.sections.siteId })
      .from(s.enrollments)
      .innerJoin(s.sections, eq(s.sections.id, s.enrollments.sectionId))
      .innerJoin(s.terms, eq(s.terms.id, s.sections.termId))
      .innerJoin(activeProgram, and(
        eq(activeProgram.studentProfileId, s.enrollments.studentProfileId),
        eq(activeProgram.programId, s.sections.programId),
        eq(activeProgram.schoolYearId, s.terms.schoolYearId),
        eq(activeProgram.kind, "program"), eq(activeProgram.status, "active"),
      ))
      .where(and(
        eq(s.enrollments.studentProfileId, profile.id),
        eq(s.enrollments.kind, "section"),eq(s.enrollments.status, "active"),
        eq(s.enrollments.programId, s.sections.programId),
        eq(s.enrollments.schoolYearId, s.terms.schoolYearId),
        context.role === "teacher"
          ? inArray(s.sections.id, teacherSectionIds)
          : and(inArray(s.sections.siteId, context.siteIds),
              inArray(s.sections.programId,context.scope.programIds??[])),
      ));
    let authorized = activeSections.length > 0;
    let visibleSections = activeSections;
    if (context.role === "teacher") {
      const sectionIds = activeSections.map((row) => row.sectionId);
      const taught = sectionIds.length
        ? await db
            .select({ sectionId: s.sectionTeachers.sectionId })
            .from(s.sectionTeachers)
            .where(
              and(
                inArray(s.sectionTeachers.sectionId, sectionIds),
                eq(s.sectionTeachers.personId, context.actorPersonId!),
              ),
            )
        : [];
      authorized = taught.length > 0;
      const assignedSections=new Set(taught.map(row=>row.sectionId));
      visibleSections=activeSections.filter(row=>assignedSections.has(row.sectionId));
    }
    if (!authorized) throw new AuthorizationError("student staff relationship");

    const sectionIds = visibleSections.map((row) => row.sectionId);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [guardianRows, teacherRows, gradeRows, attendanceRows, actionRows, insightRows, referralRows, missing] =
      await Promise.all([
        db
          .select({
            personId: s.people.id,
            firstName: s.people.legalFirstName,
            lastName: s.people.legalLastName,
            preferredName: s.people.preferredName,
            relationshipLabel: s.guardianRelationships.relationshipLabel,
          })
          .from(s.guardianRelationships)
          .innerJoin(s.people, eq(s.people.id, s.guardianRelationships.guardianPersonId))
          .where(and(eq(s.people.active, true), guardianRelationshipPredicate({studentPersonId: profile.personId, access: "academic"}))),
        sectionIds.length
          ? db
              .select({
                sectionId: s.sectionTeachers.sectionId,
                personId: s.people.id,
                firstName: s.people.legalFirstName,
                lastName: s.people.legalLastName,
                preferredName: s.people.preferredName,
              })
              .from(s.sectionTeachers)
              .innerJoin(s.people, eq(s.people.id, s.sectionTeachers.personId))
              .where(inArray(s.sectionTeachers.sectionId, sectionIds))
          : [],
        sectionIds.length
          ? db
              .select({
                sectionId: s.sectionGrades.sectionId,
                letterGrade: s.sectionGrades.letterGrade,
                percentage: s.sectionGrades.percentage,
                finalizedAt: s.sectionGrades.finalizedAt,
              })
              .from(s.sectionGrades)
              .where(
                and(
                  eq(s.sectionGrades.studentProfileId, profile.id),
                  inArray(s.sectionGrades.sectionId, sectionIds),
                  eq(s.sectionGrades.status, "finalized"),
                ),
              )
              .orderBy(desc(s.sectionGrades.finalizedAt))
          : [],
        db
          .select({
            status: s.attendanceEvents.status,
            expectedAt: s.attendanceEvents.expectedAt,
            sectionTitle: s.sections.title,
          })
          .from(s.attendanceEvents)
          .leftJoin(s.sections, eq(s.sections.id, s.attendanceEvents.sectionId))
          .where(
            and(
              eq(s.attendanceEvents.studentProfileId, profile.id),
              ...(context.role==="teacher"?[]:[
                inArray(s.attendanceEvents.siteId,context.siteIds),
                inArray(s.attendanceEvents.programId,context.scope.programIds??[]),
              ]),
              ...(context.role==="teacher"?[inArray(s.attendanceEvents.sectionId,sectionIds)]:[]),
              inArray(s.attendanceEvents.status, ["absent", "tardy"]),
              gte(s.attendanceEvents.expectedAt, thirtyDaysAgo),
            ),
          )
          .orderBy(desc(s.attendanceEvents.expectedAt)),
        db
          .select({
            id: s.actions.id,
            type: s.actions.type,
            title: s.actions.title,
            status: s.actions.status,
            priority: s.actions.priority,
            dueAt: s.actions.dueAt,
            createdAt: s.actions.createdAt,
          })
          .from(s.actions)
          .where(
            and(
              eq(s.actions.subjectType, "student_profile"),
              eq(s.actions.subjectId, profile.id),
              ...(context.role==="teacher"?[]:[
                inArray(s.actions.siteId,context.siteIds),
                inArray(s.actions.programId,context.scope.programIds??[]),
              ]),
              ...(context.role==="teacher"?[
                inArray(s.actions.sectionId,sectionIds),
                inArray(s.actions.type,["academic_intervention","guardian_grade_follow_up"]),
              ]:[]),
              inArray(s.actions.status, ["open", "in_progress", "waiting"]),
            ),
          )
          .orderBy(desc(s.actions.createdAt))
          .limit(25),
        db
          .select({
            id: s.insights.id,
            type: s.insights.type,
            title: s.insights.title,
            createdAt: s.insights.createdAt,
          })
          .from(s.insights)
          .where(
            and(
              eq(s.insights.subjectType, "student_profile"),
              eq(s.insights.subjectId, profile.id),
              ...(context.role==="teacher"?[]:[
                inArray(s.insights.siteId,context.siteIds),
                inArray(s.insights.programId,context.scope.programIds??[]),
              ]),
              ...(context.role==="teacher"?[inArray(s.insights.sectionId,sectionIds)]:[]),
            ),
          )
          .orderBy(desc(s.insights.createdAt))
          .limit(5),
        context.role==="teacher"?Promise.resolve([] as Array<{
          id:string;title:string;stage:string;category:string;createdAt:Date;
        }>):db
          .select({
            id: s.actions.id,
            title: s.actions.title,
            stage: s.supportReferrals.stage,
            category: s.supportReferrals.category,
            createdAt: s.actions.createdAt,
          })
          .from(s.actions)
          .innerJoin(s.supportReferrals, eq(s.supportReferrals.actionId, s.actions.id))
          .where(
            and(
              eq(s.actions.type, "support_referral"),
              eq(s.actions.subjectType, "student_profile"),
              eq(s.actions.subjectId, profile.id),
              inArray(s.actions.siteId,context.siteIds),
              inArray(s.actions.programId,context.scope.programIds??[]),
            ),
          )
          .orderBy(desc(s.actions.createdAt))
          .limit(25),
        missingWorkCounts(db, s, [profile.id],sectionIds),
      ]);

    const latestGradeBySection = new Map<string, (typeof gradeRows)[number]>();
    for (const grade of gradeRows) {
      if (!latestGradeBySection.has(grade.sectionId)) latestGradeBySection.set(grade.sectionId, grade);
    }
    const teachersBySection = new Map<string, { personId: string; name: string }[]>();
    for (const row of teacherRows) {
      const teachers = teachersBySection.get(row.sectionId) ?? [];
      teachers.push({
        personId: row.personId,
        name: personDisplayName({ legalFirstName: row.firstName, legalLastName: row.lastName, preferredName: row.preferredName }),
      });
      teachersBySection.set(row.sectionId, teachers);
    }

    return {
      viewerRole: context.role,
      identity: {
        personId: profile.personId,
        name: personDisplayName(profile),
        gradeLevel: profile.gradeLevel,
      },
      timeline: studentAcademicTimeline({
        sections:visibleSections.map(row=>({sectionId:row.sectionId,title:row.sectionTitle})),
        grades:gradeRows,attendance:attendanceRows,actions:actionRows,
      }),
      guardians: guardianRows.map((row) => ({
        personId: row.personId,
        name: personDisplayName({ legalFirstName: row.firstName, legalLastName: row.lastName, preferredName: row.preferredName }),
        relationshipLabel: row.relationshipLabel,
      })),
      sections: visibleSections.map((row) => ({
        sectionId: row.sectionId,
        title: row.sectionTitle,
        teachers: teachersBySection.get(row.sectionId) ?? [],
        teacherNames: (teachersBySection.get(row.sectionId) ?? []).map(teacher => teacher.name),
      })),
      academics: {
        sections: visibleSections.map((row) => {
          const grade = latestGradeBySection.get(row.sectionId);
          return {
            sectionId: row.sectionId,
            title: row.sectionTitle,
            letterGrade: grade?.letterGrade ?? null,
            percentage: grade?.percentage ?? null,
            finalizedAt: grade?.finalizedAt?.toISOString() ?? null,
          };
        }),
        openMissingWorkCount: missing.get(profile.id) ?? 0,
      },
      attendance: {
        absenceCount: attendanceRows.filter((row) => row.status === "absent").length,
        tardyCount: attendanceRows.filter((row) => row.status === "tardy").length,
        recentEvents: attendanceRows.slice(0, 10).map((row) => ({
          status: row.status,
          expectedAt: row.expectedAt.toISOString(),
          sectionTitle: row.sectionTitle ?? null,
        })),
      },
      openActions: actionRows.map((row) => ({
        id: row.id,
        type: row.type,
        title: row.title,
        status: row.status,
        priority: row.priority,
        dueAt: row.dueAt?.toISOString() ?? null,
      })),
      insights: insightRows.map((row) => ({
        id: row.id,
        type: row.type,
        title: row.title,
        createdAt: row.createdAt.toISOString(),
      })),
      supportReferrals: referralRows
        .filter((row) => row.stage !== "closed")
        .map((row) => ({
          id: row.id,
          title: row.title,
          stage: row.stage,
          category: row.category,
          createdAt: row.createdAt.toISOString(),
        })),
    };
  });

export const listTeachers = createServerFn({ method: "GET" })
  .validator((value: unknown) =>
    z.object({ query: z.string().trim().max(100).optional() }).parse(value ?? {}),
  )
  .handler(async ({ data }) => {
    const context = await requireStaffDirectoryContext();
    const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
    const query = data.query?.trim();
    const nameFilter = query
      ? or(
          ilike(s.people.legalFirstName, `%${query}%`),
          ilike(s.people.legalLastName, `%${query}%`),
          ilike(s.people.preferredName, `%${query}%`),
        )
      : undefined;
    const rows = await db
      .select({
        personId: s.people.id,
        legalFirstName: s.people.legalFirstName,
        legalLastName: s.people.legalLastName,
        preferredName: s.people.preferredName,
        sectionId: s.sections.id,
        sectionTitle: s.sections.title,
      })
      .from(s.sectionTeachers)
      .innerJoin(s.people, eq(s.people.id, s.sectionTeachers.personId))
      .innerJoin(
        s.sections,
        and(eq(s.sections.id, s.sectionTeachers.sectionId), inArray(s.sections.siteId, context.siteIds)),
      )
      .where(nameFilter)
      .orderBy(s.people.legalLastName, s.people.legalFirstName)
      .limit(500);
    if (!rows.length) return { teachers: [] };
    const teacherMap = new Map<string, { personId: string; name: string; sections: Map<string, string> }>();
    for (const row of rows) {
      const entry =
        teacherMap.get(row.personId) ?? {
          personId: row.personId,
          name: personDisplayName(row),
          sections: new Map<string, string>(),
        };
      entry.sections.set(row.sectionId, row.sectionTitle);
      teacherMap.set(row.personId, entry);
    }
    const sectionIds = [...new Set(rows.map((row) => row.sectionId))];
    const enrollmentRows = sectionIds.length
      ? await db
          .select({ sectionId: s.enrollments.sectionId, studentProfileId: s.enrollments.studentProfileId })
          .from(s.enrollments)
          .where(
            and(
              inArray(s.enrollments.sectionId, sectionIds),
              eq(s.enrollments.kind, "section"),
              eq(s.enrollments.status, "active"),
            ),
          )
      : [];
    const studentsBySection = new Map<string, Set<string>>();
    for (const row of enrollmentRows) {
      if (!row.sectionId) continue;
      const set = studentsBySection.get(row.sectionId) ?? new Set<string>();
      set.add(row.studentProfileId);
      studentsBySection.set(row.sectionId, set);
    }
    return {
      teachers: [...teacherMap.values()].map((entry) => {
        const studentIds = new Set<string>();
        for (const sectionId of entry.sections.keys()) {
          for (const id of studentsBySection.get(sectionId) ?? []) studentIds.add(id);
        }
        return {
          personId: entry.personId,
          name: entry.name,
          sections: [...entry.sections.values()],
          studentCount: studentIds.size,
        };
      }),
    };
  });
