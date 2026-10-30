import { and, eq, inArray } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { db } from "@/db/client";
import { courseTemplates, courseTemplateVersions, enrollments, organizations,
  people, programs, sectionTeachers, sections, schoolYears, studentProfiles, terms } from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import { exportOneRoster12Roster, type OneRosterInput } from "@/domain/oneroster-roster";
import { zipRosterFiles } from "@/domain/oneroster-zip";
import { requireActor, recordAudit } from "@/modules/identity/actors.server";
import { emitEvent } from "@/platform/mutation";

import { EventTypes } from "@/domain/event-types";
/** Explicit verified registrar roster-export capability; a curriculum publisher
 * grant on its own never authorizes exporting personal student information. */
export const exportOneRosterBulkRoster = createServerFn({method:"POST"})
 .validator((input:unknown)=>z.object({programId:z.string().uuid()}).strict().parse(input))
 .handler(async({data})=>{
  setResponseHeader("Cache-Control","private, no-store");
  const actor=await requireActor(["registrar"],"registrations:approve");
  const [program]=await db.select({id:programs.id,name:programs.name,slug:programs.slug,
    organizationId:programs.organizationId,siteId:programs.siteId})
   .from(programs).where(eq(programs.id,data.programId)).limit(1);
  if(!program||!program.siteId||!actor.scope.organizationIds?.includes(program.organizationId)||
    !actor.scope.programIds?.includes(program.id)||
    !actor.scope.siteIds?.includes(program.siteId))
    throw new AuthorizationError("institutional registrar program, site and roster export scope");
  const [org]=await db.select({id:organizations.id,name:organizations.name})
    .from(organizations).where(eq(organizations.id,program.organizationId)).limit(1);
  if(!org)throw new AuthorizationError("school organization");
  const classRows=await db.select({
    id:sections.id,title:sections.title,code:sections.code,
    termId:sections.termId,courseId:courseTemplates.id,
    courseTitle:courseTemplates.title,courseCode:courseTemplates.code,
    courseSubject:courseTemplates.subject,
  }).from(sections)
    .innerJoin(courseTemplateVersions,eq(courseTemplateVersions.id,sections.courseTemplateVersionId))
    .innerJoin(courseTemplates,eq(courseTemplates.id,courseTemplateVersions.courseTemplateId))
    .where(and(eq(sections.programId,program.id),eq(sections.siteId,program.siteId),
      eq(sections.active,true))).limit(5001);
  if(classRows.length>5000)throw new Error("Large roster requires a scheduled export.");
  const sectionIds=classRows.map(s=>s.id),termIds=[...new Set(classRows.map(s=>s.termId))];
  const termRows=termIds.length?await db.select({
    id:terms.id,name:terms.name,startsOn:terms.startsOn,endsOn:terms.endsOn,
    schoolYearId:schoolYears.id,schoolYearName:schoolYears.name,
    schoolYearStarts:schoolYears.startsOn,schoolYearEnds:schoolYears.endsOn,
  }).from(terms).innerJoin(schoolYears,eq(schoolYears.id,terms.schoolYearId))
    .where(and(inArray(terms.id,termIds),
      eq(schoolYears.organizationId,program.organizationId),
      eq(schoolYears.siteId,program.siteId))):[];
  if(termRows.length!==termIds.length)throw new AuthorizationError("academic term and school-year scope");
  const [studentRows,teacherRows]=await Promise.all([
    sectionIds.length?db.select({
      id:enrollments.id,sectionId:enrollments.sectionId,personId:studentProfiles.personId,
      grade:studentProfiles.gradeLevel,givenName:people.legalFirstName,
      familyName:people.legalLastName,
    }).from(enrollments)
      .innerJoin(studentProfiles,eq(studentProfiles.id,enrollments.studentProfileId))
      .innerJoin(people,eq(people.id,studentProfiles.personId))
      .where(and(inArray(enrollments.sectionId,sectionIds),
        eq(enrollments.organizationId,program.organizationId),
        eq(enrollments.programId,program.id),eq(enrollments.kind,"section"),
        eq(enrollments.status,"active"))).limit(20001):Promise.resolve([]),
    sectionIds.length?db.select({
      id:sectionTeachers.id,sectionId:sectionTeachers.sectionId,personId:sectionTeachers.personId,
      givenName:people.legalFirstName,familyName:people.legalLastName,
    }).from(sectionTeachers).innerJoin(people,eq(people.id,sectionTeachers.personId))
      .where(inArray(sectionTeachers.sectionId,sectionIds)).limit(5001):Promise.resolve([]),
  ]);
  if(studentRows.length>20000||teacherRows.length>5000)throw new Error("Large roster requires a scheduled export.");
  if(studentRows.some(row=>!row.sectionId))throw new AuthorizationError("section-scoped active enrollment");
  const personMap=new Map<string,OneRosterInput["people"][number]>();
  for(const s of studentRows)personMap.set(s.personId,{id:s.personId,givenName:s.givenName,
    familyName:s.familyName,grade:s.grade});
  for(const t of teacherRows)if(!personMap.has(t.personId))personMap.set(t.personId,{
    id:t.personId,givenName:t.givenName,familyName:t.familyName,
  });
  const yearMap=new Map(termRows.map(t=>[t.schoolYearId,{
    id:t.schoolYearId,title:t.schoolYearName,type:"schoolYear" as const,
    startsOn:t.schoolYearStarts,endsOn:t.schoolYearEnds,
  }]));
  const roster:OneRosterInput={
    organization:org,
    sessions:[
      ...yearMap.values(),
      ...termRows.map(t=>({id:t.id,title:t.name,type:"term" as const,
        startsOn:t.startsOn,endsOn:t.endsOn,parentId:t.schoolYearId})),
    ],
    courses:[...new Map(classRows.map(row=>[row.courseId,{
      id:row.courseId,title:row.courseTitle,code:row.courseCode,subject:row.courseSubject,
    }])).values()],
    classes:classRows.map(row=>({id:row.id,title:row.title,code:row.code,
      courseId:row.courseId,termId:row.termId})),
    people:[...personMap.values()],
    registrations:[
      ...studentRows.map(row=>({id:row.id,classId:row.sectionId!,
        personId:row.personId,role:"student" as const})),
      ...teacherRows.map(row=>({id:row.id,classId:row.sectionId,
        personId:row.personId,role:"teacher" as const})),
    ],
  };
  const files=exportOneRoster12Roster(roster);
  const archive=zipRosterFiles(files);
  if(archive.byteLength>4*1024*1024)throw new Error("Roster export too large for direct download.");
  await db.transaction(async tx=>{
    await recordAudit(tx,actor,{action:"interop.oneroster.roster_export",
      resourceType:"program",resourceId:program.id,
      after:{classes:classRows.length,students:studentRows.length,teachers:teacherRows.length,
        format:"OneRoster CSV 1.2",fileCount:Object.keys(files).length},
      scope:{organizationId:program.organizationId,siteId:program.siteId,programId:program.id}});
    await emitEvent(tx,{eventType:EventTypes.OneRosterRosterExported,aggregateType:"program",
      aggregateId:program.id,actorPersonId:actor.actorPersonId,
      organizationId:program.organizationId,siteId:program.siteId,programId:program.id});
  });
  return {
    fileName:"CAN-OneRoster-1.2-"+program.slug.replace(/[^A-Za-z0-9_-]/g,"")+".zip",
    base64:Buffer.from(archive).toString("base64"),
    classes:classRows.length,students:studentRows.length,teachers:teacherRows.length,
    profile:"oneroster_1.2_roster_bulk" as const,
  };
 });
