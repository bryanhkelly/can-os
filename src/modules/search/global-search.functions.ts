import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { requireActor, actorSiteIds, type Actor } from "@/modules/identity/actors.server";

export type SearchHit = {
  id: string;
  label: string;
  sub: string;
  to: string;
};

export type WorkspaceSearchResults = {
  connected: boolean;
  courses: SearchHit[];
  assignments: SearchHit[];
  students: SearchHit[];
  messages: SearchHit[];
};

const EMPTY: WorkspaceSearchResults = {
  connected: true,
  courses: [],
  assignments: [],
  students: [],
  messages: [],
};

const ALL_ROLES = ["student", "teacher", "guardian", "registrar", "specialist"] as const;

function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, "");
}

function displayName(person: {
  preferredName: string | null;
  legalFirstName: string;
  legalLastName: string;
}): string {
  return person.preferredName ?? `${person.legalFirstName} ${person.legalLastName}`;
}

function day(value: Date | null | undefined): string {
  return value ? value.toISOString().slice(0, 10) : "";
}

async function searchCourses(actor: Actor, like: string): Promise<SearchHit[]> {
  if (actor.role !== "student" && actor.role !== "teacher") return [];
  const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
  const siteIds = actor.scope.siteIds ?? [];

  if (actor.role === "student") {
    const rows = await db
      .select({ id: s.sections.id, title: s.sections.title, code: s.sections.code })
      .from(s.sections)
      .innerJoin(
        s.enrollments,
        and(
          eq(s.enrollments.sectionId, s.sections.id),
          eq(s.enrollments.kind, "section"),
          eq(s.enrollments.status, "active"),
        ),
      )
      .innerJoin(
        s.studentProfiles,
        and(
          eq(s.studentProfiles.id, s.enrollments.studentProfileId),
          eq(s.studentProfiles.personId, actor.actorPersonId),
        ),
      )
      .where(
        and(
          ilike(s.sections.title, like),
          siteIds.length ? inArray(s.sections.siteId, siteIds) : undefined,
        ),
      )
      .limit(5);
    return rows.map((row) => ({
      id: `course-${row.id}`,
      label: row.title,
      sub: row.code,
      to: "/student/courses",
    }));
  }

  const rows = await db
    .select({ id: s.sections.id, title: s.sections.title, code: s.sections.code })
    .from(s.sections)
    .innerJoin(
      s.sectionTeachers,
      and(
        eq(s.sectionTeachers.sectionId, s.sections.id),
        eq(s.sectionTeachers.personId, actor.actorPersonId),
      ),
    )
    .where(
      and(
        ilike(s.sections.title, like),
        siteIds.length ? inArray(s.sections.siteId, siteIds) : undefined,
      ),
    )
    .limit(5);
  return rows.map((row) => ({
    id: `course-${row.id}`,
    label: row.title,
    sub: row.code,
    to: "/teacher/gradebook",
  }));
}

async function searchAssignments(actor: Actor, like: string): Promise<SearchHit[]> {
  if (actor.role !== "student" && actor.role !== "teacher") return [];
  const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
  const siteIds = actor.scope.siteIds ?? [];

  const scopeJoin =
    actor.role === "student"
      ? {
          from: s.enrollments,
          on: and(
            eq(s.enrollments.sectionId, s.sections.id),
            eq(s.enrollments.kind, "section"),
            eq(s.enrollments.status, "active"),
          ),
          profileJoin: true as const,
        }
      : {
          from: s.sectionTeachers,
          on: and(
            eq(s.sectionTeachers.sectionId, s.sections.id),
            eq(s.sectionTeachers.personId, actor.actorPersonId),
          ),
          profileJoin: false as const,
        };

  let query = db
    .select({
      id: s.assessments.id,
      title: s.assessments.title,
      dueAt: s.assessments.dueAt,
      sectionTitle: s.sections.title,
    })
    .from(s.assessments)
    .innerJoin(s.sections, eq(s.sections.id, s.assessments.sectionId))
    .innerJoin(scopeJoin.from, scopeJoin.on)
    .$dynamic();

  if (scopeJoin.profileJoin) {
    query = query.innerJoin(
      s.studentProfiles,
      and(
        eq(s.studentProfiles.id, s.enrollments.studentProfileId),
        eq(s.studentProfiles.personId, actor.actorPersonId),
      ),
    );
  }

  const rows = await query
    .where(
      and(
        ilike(s.assessments.title, like),
        inArray(s.assessments.status, ["published", "closed"]),
        siteIds.length ? inArray(s.sections.siteId, siteIds) : undefined,
      ),
    )
    .orderBy(desc(s.assessments.dueAt))
    .limit(5);

  return rows.map((row) => ({
    id: `assignment-${row.id}`,
    label: row.title,
    sub: row.dueAt ? `${row.sectionTitle} · due ${day(row.dueAt)}` : row.sectionTitle,
    to: actor.role === "student" ? "/student/assignments" : "/teacher/gradebook",
  }));
}

async function searchStudents(actor: Actor, like: string): Promise<SearchHit[]> {
  if (actor.role === "student") return [];
  const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);

  const nameMatch = or(
    ilike(s.people.legalFirstName, like),
    ilike(s.people.legalLastName, like),
    ilike(s.people.preferredName, like),
  );

  let rows: Array<{
    personId: string;
    preferredName: string | null;
    legalFirstName: string;
    legalLastName: string;
    gradeLevel: string | null;
    synthetic: unknown;
  }> = [];

  if (actor.role === "guardian") {
    rows = await db
      .select({
        personId: s.people.id,
        preferredName: s.people.preferredName,
        legalFirstName: s.people.legalFirstName,
        legalLastName: s.people.legalLastName,
        gradeLevel: s.studentProfiles.gradeLevel,
        synthetic: s.people.metadata,
      })
      .from(s.guardianRelationships)
      .innerJoin(s.people, eq(s.people.id, s.guardianRelationships.studentPersonId))
      .innerJoin(s.studentProfiles, eq(s.studentProfiles.personId, s.people.id))
      .where(
        and(
          eq(s.guardianRelationships.guardianPersonId, actor.actorPersonId),
          eq(s.guardianRelationships.canViewAcademics, true),
          nameMatch,
        ),
      )
      .limit(8);
  } else if (actor.role === "teacher") {
    rows = await db
      .select({
        personId: s.people.id,
        preferredName: s.people.preferredName,
        legalFirstName: s.people.legalFirstName,
        legalLastName: s.people.legalLastName,
        gradeLevel: s.studentProfiles.gradeLevel,
        synthetic: s.people.metadata,
      })
      .from(s.sectionTeachers)
      .innerJoin(
        s.enrollments,
        and(
          eq(s.enrollments.sectionId, s.sectionTeachers.sectionId),
          eq(s.enrollments.kind, "section"),
          eq(s.enrollments.status, "active"),
        ),
      )
      .innerJoin(s.studentProfiles, eq(s.studentProfiles.id, s.enrollments.studentProfileId))
      .innerJoin(s.people, eq(s.people.id, s.studentProfiles.personId))
      .where(and(eq(s.sectionTeachers.personId, actor.actorPersonId), nameMatch))
      .limit(8);
  } else {
    const siteIds = actorSiteIds(actor);
    rows = await db
      .select({
        personId: s.people.id,
        preferredName: s.people.preferredName,
        legalFirstName: s.people.legalFirstName,
        legalLastName: s.people.legalLastName,
        gradeLevel: s.studentProfiles.gradeLevel,
        synthetic: s.people.metadata,
      })
      .from(s.enrollments)
      .innerJoin(s.sections, eq(s.sections.id, s.enrollments.sectionId))
      .innerJoin(s.studentProfiles, eq(s.studentProfiles.id, s.enrollments.studentProfileId))
      .innerJoin(s.people, eq(s.people.id, s.studentProfiles.personId))
      .where(
        and(
          eq(s.enrollments.status, "active"),
          inArray(s.sections.siteId, siteIds),
          nameMatch,
        ),
      )
      .limit(8);
  }

  const seen = new Set<string>();
  const hits: SearchHit[] = [];
  for (const row of rows) {
    if (seen.has(row.personId)) continue;
    seen.add(row.personId);
    if ((row.synthetic as Record<string, unknown>)?.synthetic !== true) continue;
    hits.push({
      id: `student-${row.personId}`,
      label: displayName(row),
      sub: row.gradeLevel ? `Grade ${row.gradeLevel}` : "Student",
      to:
        actor.role === "guardian"
          ? "/guardian/academics"
          : `/staff/students/${row.personId}`,
    });
    if (hits.length >= 5) break;
  }
  return hits;
}

async function searchMessages(actor: Actor, like: string): Promise<SearchHit[]> {
  const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
  const rows = await db
    .select({
      id: s.communicationThreads.id,
      subject: s.communicationThreads.subject,
      lastMessageAt: s.communicationThreads.lastMessageAt,
    })
    .from(s.communicationThreads)
    .innerJoin(
      s.communicationParticipants,
      and(
        eq(s.communicationParticipants.threadId, s.communicationThreads.id),
        eq(s.communicationParticipants.participantId, actor.actorPersonId),
      ),
    )
    .where(ilike(s.communicationThreads.subject, like))
    .orderBy(desc(s.communicationThreads.lastMessageAt))
    .limit(5);
  return rows.map((row) => ({
    id: `thread-${row.id}`,
    label: row.subject,
    sub: row.lastMessageAt ? `Last message ${day(row.lastMessageAt)}` : "Thread",
    to: "/messages",
  }));
}

/**
 * Prototype-grade global search over canonical data. Every group is derived
 * from the verified session's role and scope — the palette is a view over
 * authorized state, never a separate access path.
 */
export const searchWorkspace = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ query: z.string().max(100) }).parse(data))
  .handler(async ({ data }): Promise<WorkspaceSearchResults> => {
    const actor = await requireActor(ALL_ROLES);
    setResponseHeader("Cache-Control", "no-store");
    if (!process.env.DATABASE_URL) return { ...EMPTY, connected: false };

    const term = escapeLike(data.query.trim());
    if (term.length < 2) return EMPTY;
    const like = `%${term}%`;

    const [courses, assignments, students, messages] = await Promise.all([
      searchCourses(actor, like),
      searchAssignments(actor, like),
      searchStudents(actor, like),
      searchMessages(actor, like),
    ]);

    return { connected: true, courses, assignments, students, messages };
  });
