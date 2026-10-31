import {activateSectionEnrollment} from "./section-allocation.service";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { admissionOffers, applications, courseTemplateVersions, enrollments, programs, schoolYears, sections, sites, terms } from "@/db/schema";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { hasAccessibleFirstLesson } from "@/domain/first-class-lesson";
import { verifiedTeacherSectionIds } from "./verified-section-teachers.server";
import { staffedPublishedSectionIds } from "./instructional-section-readiness.server";
import { getSectionRegistrationPolicy } from "@/modules/learning/section-registration-policy-service";
import { canAddStudentToSection } from "@/domain/section-registration-window";

async function registrar() {
  const actor = await getCommandContext(getRequest());
  if (actor.role !== "registrar" || !actor.actorPersonId)
    throw new AuthorizationError("registrar course placement");
  assertCapability(actor, "enrollment.activate");
  return actor;
}
const uuid = z.string().uuid();
function canPlaceInProgram(actor:Awaited<ReturnType<typeof registrar>>,
 program:{id:string;organizationId:string;siteId:string|null}){
 return !!actor.scope.organizationIds?.includes(program.organizationId) &&
  (actor.scope.programIds===undefined||actor.scope.programIds.includes(program.id)) &&
  (actor.scope.siteIds===undefined||
   (!!program.siteId&&actor.scope.siteIds.includes(program.siteId)));
}

export const listEnrollmentPlacements = createServerFn({ method: "GET" })
 .validator((v: unknown) => z.object({ applicationId: uuid }).parse(v))
 .handler(async ({ data }) => {
   const actor = await registrar();
   const [app] = await db.select({ programId: applications.programId,
     studentProfileId: applications.studentProfileId,
     organizationId:programs.organizationId,siteId:programs.siteId })
     .from(applications).innerJoin(programs,eq(programs.id,applications.programId))
     .where(eq(applications.id, data.applicationId)).limit(1);
   if (!app || !canPlaceInProgram(actor,{id:app.programId,organizationId:app.organizationId,siteId:app.siteId}))
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
     siteTimezone:sites.timezone,yearTimezone:schoolYears.timezone,
     curriculumStatus:courseTemplateVersions.status,
     curriculum:courseTemplateVersions.curriculum })
     .from(sections).innerJoin(terms, eq(terms.id, sections.termId))
     .innerJoin(schoolYears,eq(schoolYears.id,terms.schoolYearId))
     .leftJoin(sites,eq(sites.id,sections.siteId))
     .innerJoin(courseTemplateVersions,eq(courseTemplateVersions.id,sections.courseTemplateVersionId))
     .where(and(eq(sections.programId, app.programId), eq(sections.active, true),
       inArray(terms.schoolYearId, yearIds)));
   // One canonical source of live teacher identity for both placement
   // preview and the atomic placement command. Also project the independent
   // CAN/church operating agreement and published first-lesson gate.
   const sectionIds=rows.map(row=>row.id);
   const staffedIds=await verifiedTeacherSectionIds(sectionIds,db);
   const readyIds=await staffedPublishedSectionIds(sectionIds,db);
   // A published, staffed class can still have no available seat or have
   // passed add/drop. Mirror those mandatory enrollment guards before
   // offering it to a registrar; the write transaction is authoritative.
   const occupancy=sectionIds.length?await db.select({
     sectionId:enrollments.sectionId,
     count:sql<number>`count(*)::int`,
   }).from(enrollments).where(and(
     inArray(enrollments.sectionId,sectionIds),
     eq(enrollments.kind,"section"),eq(enrollments.status,"active"),
   )).groupBy(enrollments.sectionId):[];
   const occupied=new Map(occupancy.map(row=>[row.sectionId,row.count]));
   const policies=await Promise.all(rows.map(async row=>({
     id:row.id,policy:await getSectionRegistrationPolicy(row.id,db),
   })));
   const policyBySection=new Map(policies.map(row=>[row.id,row.policy]));
   const now=new Date();
   const enrolled = await db.select({ sectionId: enrollments.sectionId }).from(enrollments)
     .where(and(eq(enrollments.studentProfileId, app.studentProfileId),
       eq(enrollments.kind, "section"), eq(enrollments.status, "active")));
   const assigned = new Set(enrolled.map(e => e.sectionId));
   return { active: active.length>0, sections: rows.filter(s => actor.scope.siteIds===undefined ||
      (!!s.siteId&&actor.scope.siteIds.includes(s.siteId))).map(s => ({
     id: s.id, title: s.title, code: s.code, enrolled: assigned.has(s.id),
     staffed: staffedIds.has(s.id),
     curriculumReady:s.curriculumStatus==="published" && hasAccessibleFirstLesson(s.curriculum),
     readyForPlacement:readyIds.has(s.id) &&
       !!policyBySection.get(s.id) && canAddStudentToSection({
         addDropEndsOn:policyBySection.get(s.id)!.addDropEndsOn,
         enrollmentCapacity:policyBySection.get(s.id)!.enrollmentCapacity,
         occupiedSeats:occupied.get(s.id)??0,
         timezone:s.siteTimezone??s.yearTimezone,now,
       }),
   })) };
 });

export const placeEnrolledStudent = createServerFn({ method: "POST" })
 .validator((v: unknown) => z.object({ applicationId: uuid, sectionId: uuid }).parse(v))
 .handler(async ({ data }) => {
   const actor = await registrar();
   return db.transaction(async tx => {
     const [app] = await tx.select({ studentProfileId: applications.studentProfileId,
       programId: applications.programId,organizationId:programs.organizationId,siteId:programs.siteId })
       .from(applications).innerJoin(programs,eq(programs.id,applications.programId))
       .where(eq(applications.id, data.applicationId)).limit(1);
     if (!app || !canPlaceInProgram(actor,{id:app.programId,organizationId:app.organizationId,siteId:app.siteId}))
       throw new AuthorizationError("placement program scope");
     const [section] = await tx.select({ id: sections.id, programId: sections.programId,
       schoolYearId: terms.schoolYearId, siteId: sections.siteId,
       organizationId: programs.organizationId })
       .from(sections).innerJoin(terms, eq(terms.id, sections.termId))
       .innerJoin(programs, eq(programs.id, sections.programId))
       .where(and(eq(sections.id, data.sectionId), eq(sections.active, true))).limit(1);
     if (!section || section.programId !== app.programId ||
       (actor.scope.siteIds!==undefined &&
        (!section.siteId||!actor.scope.siteIds.includes(section.siteId))))
       throw new AuthorizationError("section placement scope");
     return activateSectionEnrollment(tx,{studentProfileId:app.studentProfileId,
       sectionId:section.id,actor,source:"registrar_placement",applicationId:data.applicationId});
   });
 });
