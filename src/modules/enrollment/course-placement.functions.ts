import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { applications, enrollments, programs, sections, terms, auditEvents, domainEvents } from "@/db/schema";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { assertCapability, AuthorizationError } from "@/domain/command-context";

async function registrar() {
  const actor = await getCommandContext(getRequest());
  if (actor.role !== "registrar" || !actor.actorPersonId)
    throw new AuthorizationError("registrar course placement");
  assertCapability(actor, "enrollment.activate");
  return actor;
}
const uuid = z.string().uuid();

export const listEnrollmentPlacements = createServerFn({ method: "GET" })
 .validator((v: unknown) => z.object({ applicationId: uuid }).parse(v))
 .handler(async ({ data }) => {
   const actor = await registrar();
   const [app] = await db.select({ programId: applications.programId,
     studentProfileId: applications.studentProfileId })
     .from(applications).where(eq(applications.id, data.applicationId)).limit(1);
   if (!app || !actor.scope.programIds?.includes(app.programId))
     throw new AuthorizationError("application placement");
   const active = await db.select({ schoolYearId: enrollments.schoolYearId })
     .from(enrollments).where(and(eq(enrollments.studentProfileId, app.studentProfileId),
       eq(enrollments.programId, app.programId), eq(enrollments.kind, "program"),
       eq(enrollments.status, "active")));
   const yearIds = active.map(e => e.schoolYearId).filter((id): id is string => !!id);
   if (!yearIds.length) return { active: false, sections: [] };
   const rows = await db.select({ id: sections.id, title: sections.title,
     code: sections.code, schoolYearId: terms.schoolYearId, siteId: sections.siteId })
     .from(sections).innerJoin(terms, eq(terms.id, sections.termId))
     .where(and(eq(sections.programId, app.programId), eq(sections.active, true),
       inArray(terms.schoolYearId, yearIds)));
   const enrolled = await db.select({ sectionId: enrollments.sectionId }).from(enrollments)
     .where(and(eq(enrollments.studentProfileId, app.studentProfileId),
       eq(enrollments.kind, "section"), eq(enrollments.status, "active")));
   const assigned = new Set(enrolled.map(e => e.sectionId));
   return { active: true, sections: rows.filter(s => !s.siteId ||
      actor.scope.siteIds?.includes(s.siteId)).map(s => ({
     id: s.id, title: s.title, code: s.code, enrolled: assigned.has(s.id),
   })) };
 });

export const placeEnrolledStudent = createServerFn({ method: "POST" })
 .validator((v: unknown) => z.object({ applicationId: uuid, sectionId: uuid }).parse(v))
 .handler(async ({ data }) => {
   const actor = await registrar();
   return db.transaction(async tx => {
     const [app] = await tx.select({ studentProfileId: applications.studentProfileId,
       programId: applications.programId }).from(applications)
       .where(eq(applications.id, data.applicationId)).limit(1);
     if (!app || !actor.scope.programIds?.includes(app.programId))
       throw new AuthorizationError("placement program scope");
     const [section] = await tx.select({ id: sections.id, programId: sections.programId,
       schoolYearId: terms.schoolYearId, siteId: sections.siteId,
       organizationId: programs.organizationId })
       .from(sections).innerJoin(terms, eq(terms.id, sections.termId))
       .innerJoin(programs, eq(programs.id, sections.programId))
       .where(and(eq(sections.id, data.sectionId), eq(sections.active, true))).limit(1);
     if (!section || section.programId !== app.programId ||
       (section.siteId && !actor.scope.siteIds?.includes(section.siteId)))
       throw new AuthorizationError("section placement scope");
     const [programEnrollment] = await tx.select({ id: enrollments.id })
       .from(enrollments).where(and(eq(enrollments.studentProfileId, app.studentProfileId),
         eq(enrollments.programId, app.programId),
         eq(enrollments.schoolYearId, section.schoolYearId),
         eq(enrollments.kind, "program"), eq(enrollments.status, "active"))).limit(1);
     if (!programEnrollment) throw new Error("Activate enrollment before assigning courses");
     const key = "placement:" + app.studentProfileId + ":" + section.id;
     await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
     const [existing] = await tx.select({ id: enrollments.id }).from(enrollments)
       .where(and(eq(enrollments.studentProfileId, app.studentProfileId),
         eq(enrollments.sectionId, section.id), eq(enrollments.kind, "section"),
         eq(enrollments.status, "active"))).limit(1);
     if (existing) return { enrollmentId: existing.id, created: false };
     const [record] = await tx.insert(enrollments).values({
       studentProfileId: app.studentProfileId, kind: "section", status: "active",
       organizationId: section.organizationId, programId: app.programId,
       sectionId: section.id, schoolYearId: section.schoolYearId, startedAt: new Date(),
     }).returning({ id: enrollments.id });
     if (!record) throw new Error("Course placement failed");
     await tx.insert(domainEvents).values({ eventType: "SectionEnrollmentActivated",
       aggregateType: "enrollment", aggregateId: record.id, actorPersonId: actor.actorPersonId,
       payload: { applicationId: data.applicationId, sectionId: section.id,
         studentProfileId: app.studentProfileId, programId: app.programId } });
     await tx.insert(auditEvents).values({ actorPersonId: actor.actorPersonId,
       action: "enrollment.section.assign", resourceType: "enrollment", resourceId: record.id,
       scope: { organizationId: section.organizationId, programId: app.programId, siteId: section.siteId },
       after: { sectionId: section.id, studentProfileId: app.studentProfileId, status: "active" } });
     return { enrollmentId: record.id, created: true };
   });
 });
