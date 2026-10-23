import {activateSectionEnrollment} from "./section-allocation.service";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db/client";
import { accountPersonGrants, admissionOffers, applications, courseTemplateVersions, enrollments, people, programs, sections, sectionTeachers, terms } from "@/db/schema";
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
   const acceptedOffers=await db.select({schoolYearId:admissionOffers.schoolYearId})
     .from(admissionOffers).where(and(
       eq(admissionOffers.applicationId,data.applicationId),
       eq(admissionOffers.programId,app.programId),
       eq(admissionOffers.status,"accepted"),
     ));
   const yearIds = [...new Set([...active.map(e=>e.schoolYearId),
     ...acceptedOffers.map(offer=>offer.schoolYearId)].filter((id):id is string=>!!id))];
   if (!yearIds.length) return { active: false, sections: [] };
   const rows = await db.select({ id: sections.id, title: sections.title,
     code: sections.code, schoolYearId: terms.schoolYearId, siteId: sections.siteId,
     curriculumStatus:courseTemplateVersions.status })
     .from(sections).innerJoin(terms, eq(terms.id, sections.termId))
     .innerJoin(courseTemplateVersions,eq(courseTemplateVersions.id,sections.courseTemplateVersionId))
     .where(and(eq(sections.programId, app.programId), eq(sections.active, true),
       inArray(terms.schoolYearId, yearIds)));
   // UI previews only actual staffed options; a registered Teacher must have
   // an active named assignment and a current school/institution grant.
   const teachers=rows.length?await db.select({sectionId:sectionTeachers.sectionId})
     .from(sectionTeachers)
     .innerJoin(sections,eq(sections.id,sectionTeachers.sectionId))
     .innerJoin(programs,eq(programs.id,sections.programId))
     .innerJoin(people,eq(people.id,sectionTeachers.personId))
     .innerJoin(accountPersonGrants,and(
       eq(accountPersonGrants.personId,sectionTeachers.personId),
       eq(accountPersonGrants.role,"teacher"),eq(accountPersonGrants.active,true),
       or(eq(accountPersonGrants.organizationId,programs.organizationId),
          eq(accountPersonGrants.organizationId,programs.academicProviderOrganizationId)),
       or(isNull(accountPersonGrants.siteId),eq(accountPersonGrants.siteId,sections.siteId)),
     ))
     .where(and(inArray(sectionTeachers.sectionId,rows.map(row=>row.id)),
       eq(people.active,true))):[];
   const staffedIds=new Set(teachers.map(row=>row.sectionId));
   const enrolled = await db.select({ sectionId: enrollments.sectionId }).from(enrollments)
     .where(and(eq(enrollments.studentProfileId, app.studentProfileId),
       eq(enrollments.kind, "section"), eq(enrollments.status, "active")));
   const assigned = new Set(enrolled.map(e => e.sectionId));
   return { active: active.length>0, sections: rows.filter(s => !s.siteId ||
      actor.scope.siteIds?.includes(s.siteId)).map(s => ({
     id: s.id, title: s.title, code: s.code, enrolled: assigned.has(s.id),
     staffed: staffedIds.has(s.id), curriculumReady:s.curriculumStatus==="published",
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
     return activateSectionEnrollment(tx,{studentProfileId:app.studentProfileId,
       sectionId:section.id,actor,source:"registrar_placement",applicationId:data.applicationId});
   });
 });
