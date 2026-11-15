import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import { personDisplayName } from "@/domain/person-name";
import { requireActor, type Actor } from "@/modules/identity/actors.server";

/**
 * Site administration is distinct from the learner/teacher classroom service.
 * Never interpret a Site grant as permission to submit work, grade or access
 * student-private classroom activity.
 */
async function siteClassAdministrator(): Promise<Actor> {
  const actor = await requireActor(["site_admin"]);
  assertCapability(actor, "program.read");
  if (actor.grantSiteId === null || !(actor.scope.siteIds?.includes(actor.grantSiteId)) ||
      !actor.scope.organizationIds?.length) {
    throw new AuthorizationError("active school Site and Program administration");
  }
  return actor;
}

export const getClassesViewerRole = createServerFn({ method: "GET" }).handler(async () => {
  const actor = await requireActor(["student", "guardian", "teacher", "site_admin"]);
  return { role: actor.role };
});

export const getSiteAdminClasses = createServerFn({ method: "GET" }).handler(async () => {
  setResponseHeader("Cache-Control", "private, no-store");
  const actor = await siteClassAdministrator();
  const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
  const classes = await db.select({
    id: s.sections.id, title: s.sections.title, code: s.sections.code,
    siteId: s.sections.siteId, programId: s.sections.programId,
  }).from(s.sections).where(and(
    eq(s.sections.active, true),
    eq(s.sections.siteId, actor.grantSiteId!),
    inArray(s.sections.programId, actor.scope.programIds ?? []),
  )).orderBy(s.sections.title);
  return { classes };
});

export const getSiteAdminClassRoster = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ sectionId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const actor = await siteClassAdministrator();
    const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
    const [section] = await db.select({
      id: s.sections.id, title: s.sections.title, code: s.sections.code,
      programId: s.sections.programId, schoolYearId: s.terms.schoolYearId,
    }).from(s.sections)
      .innerJoin(s.terms, eq(s.terms.id, s.sections.termId))
      .where(and(
        eq(s.sections.id, data.sectionId),
        eq(s.sections.active, true),
        eq(s.sections.siteId, actor.grantSiteId!),
        inArray(s.sections.programId, actor.scope.programIds ?? []),
      )).limit(1);
    if (!section) throw new AuthorizationError("class at authorized Site");
    const programMembership = alias(s.enrollments, "admin_class_program_membership");
    const rows = await db.select({
      personId: s.studentProfiles.personId,
      firstName: s.people.legalFirstName,
      preferredName: s.people.preferredName,
      lastName: s.people.legalLastName,
    }).from(s.enrollments)
      .innerJoin(s.studentProfiles, eq(s.studentProfiles.id, s.enrollments.studentProfileId))
      .innerJoin(s.people, eq(s.people.id, s.studentProfiles.personId))
      .innerJoin(programMembership, and(
        eq(programMembership.studentProfileId, s.enrollments.studentProfileId),
        eq(programMembership.kind, "program"),
        eq(programMembership.status, "active"),
        eq(programMembership.programId, section.programId),
        eq(programMembership.schoolYearId, section.schoolYearId),
      ))
      .where(and(
        eq(s.enrollments.sectionId, section.id),
        eq(s.enrollments.kind, "section"),
        eq(s.enrollments.status, "active"),
        eq(s.enrollments.programId, section.programId),
        eq(s.enrollments.schoolYearId, section.schoolYearId),
      )).orderBy(s.people.legalLastName, s.people.legalFirstName);
    const students = [...new Map(rows.map(row => [row.personId, {
      personId: row.personId,
      name: personDisplayName({ preferredName: row.preferredName,
        legalFirstName: row.firstName, legalLastName: row.lastName }),
    }])).values()];
    return { section, students };
  });
