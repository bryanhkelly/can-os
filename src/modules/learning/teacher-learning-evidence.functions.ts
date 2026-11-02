import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { accessibleClasses } from "./class-access.server";
import type { Actor } from "@/modules/identity/actors.server";

/**
 * Staff-facing evidence slice: only active students in sections currently
 * assigned to the signed-in teacher. Absence of telemetry is never a
 * disengagement diagnosis; actions remain teacher-reviewed.
 */
export const getTeacherLearningEvidence = createServerFn({ method: "GET" }).handler(async () => {
  setResponseHeader("Cache-Control", "private, no-store");
  const actor = await getCommandContext(getRequest());
  if (actor.role !== "teacher" || !actor.actorPersonId)
    throw new AuthorizationError("verified assigned teacher");
  assertCapability(actor, "teacher:read");
  if (!(actor.scope.siteIds?.length && actor.scope.programIds?.length) &&
      !actor.scope.sectionIds?.length)
    throw new AuthorizationError("named class teaching scope");
  const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
  // The same named Section authorization drives Teacher Today, class
  // workspaces and learning evidence; CAN institutional teachers never
  // receive the church's unrelated programs or student rosters.
  const assigned=(await accessibleClasses(actor as Actor)).slice(0,100)
    .map(row=>({sectionId:row.id,sectionTitle:row.title}));
  const sectionIds = assigned.map(row => row.sectionId);
  if (!sectionIds.length) return { students: [], truncated: false, note: "No currently assigned sections." };
  const activeProgram=alias(s.enrollments,"teacher_evidence_program_membership");
  const roster = await db.select({
    sectionId: s.enrollments.sectionId,
    studentProfileId: s.studentProfiles.id, studentPersonId: s.studentProfiles.personId,
    firstName: s.people.legalFirstName, lastName: s.people.legalLastName,
  }).from(s.enrollments)
    .innerJoin(s.sections,eq(s.sections.id,s.enrollments.sectionId))
    .innerJoin(s.terms,eq(s.terms.id,s.sections.termId))
    .innerJoin(activeProgram,and(
      eq(activeProgram.studentProfileId,s.enrollments.studentProfileId),
      eq(activeProgram.programId,s.sections.programId),
      eq(activeProgram.schoolYearId,s.terms.schoolYearId),
      eq(activeProgram.kind,"program"),eq(activeProgram.status,"active"),
    ))
    .innerJoin(s.studentProfiles, eq(s.studentProfiles.id, s.enrollments.studentProfileId))
    .innerJoin(s.people, eq(s.people.id, s.studentProfiles.personId))
    .where(and(inArray(s.enrollments.sectionId, sectionIds),
      eq(s.enrollments.programId,s.sections.programId),
      eq(s.enrollments.schoolYearId,s.terms.schoolYearId),
      eq(s.enrollments.kind, "section"), eq(s.enrollments.status, "active")))
    .limit(501);
  const selected = roster.filter(
    (row): row is typeof row & { sectionId: string } => row.sectionId !== null,
  ).slice(0, 500);
  const ids = [...new Set(selected.map(r => r.studentProfileId))];
  const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const evidence = ids.length ? await db.select({
    id: s.learningActivityEvents.id,
    sectionId: s.learningActivityEvents.sectionId,
    studentProfileId: s.learningActivityEvents.studentProfileId,
    receivedAt: s.learningActivityEvents.receivedAt,
    estimatedActiveMs: s.learningActivityEvents.estimatedActiveMs,
  }).from(s.learningActivityEvents)
    .where(and(inArray(s.learningActivityEvents.sectionId, sectionIds),
      inArray(s.learningActivityEvents.studentProfileId, ids),
      gte(s.learningActivityEvents.receivedAt, from)))
    .orderBy(desc(s.learningActivityEvents.receivedAt)).limit(3001) : [];
  const latest = new Map<string, { count: number; lastAt: Date; latestEventId: string; estimatedMs: number }>();
  for (const row of evidence.slice(0, 3000)) {
    const key = row.sectionId + ":" + row.studentProfileId;
    const current = latest.get(key);
    if (current) {
      current.count++;
      current.estimatedMs += row.estimatedActiveMs;
    } else {
      latest.set(key, { count: 1, lastAt: row.receivedAt, latestEventId: row.id, estimatedMs: row.estimatedActiveMs });
    }
  }
  const titles = new Map(assigned.map(row => [row.sectionId, row.sectionTitle]));
  const students = selected.map(row => {
    const activity = latest.get(row.sectionId + ":" + row.studentProfileId);
    return {
      sectionId: row.sectionId, sectionTitle: titles.get(row.sectionId) ?? "Class",
      studentProfileId: row.studentProfileId, studentPersonId: row.studentPersonId,
      studentName: row.firstName + " " + row.lastName,
      observedEvents7d: activity?.count ?? 0,
      latestObservedAt: activity?.lastAt.toISOString() ?? null,
      latestEventId: activity?.latestEventId ?? null,
      estimatedActiveMs7d: activity?.estimatedMs ?? 0,
    };
  });
  return {
    students,
    truncated: roster.length > 500 || evidence.length > 3000 || assigned.length === 100,
    note: "Observed CAN OS interactions, not a measure of attendance, comprehension or overall study time. External/offline work may not be instrumented.",
  };
});
