import { eq,inArray,and } from "drizzle-orm";
import { db } from "@/db/client";
import {
 assessments, courseTemplateVersions, enrollments, sectionTeachers, submissions,
} from "@/db/schema";
import { readClassContent } from "@/domain/class-content";
import { summarizeCurriculumJourney, type JourneyClassEvidence } from "@/domain/curriculum-journey-readiness";
import type { Actor } from "@/modules/identity/actors.server";
import { readMarketplace } from "./curriculum-marketplace.server";

/**
 * Read-only school-scoped operational evidence. This deliberately cannot
 * claim that a browser flow passed. Roles and program access are checked
 * by the same underlying marketplace authority as install/adopt.
 */
export async function readCurriculumJourneyReadiness(actor:Actor,programId:string) {
 const market=await readMarketplace(actor,programId);
 const entitled=market.packs.filter(p=>p.entitlement==="active");
 const adopted=entitled.filter(p=>p.adoption?.status==="active"&&p.adoption.versionId===p.versionId);
 const allowedVersions=new Set(adopted.flatMap(pack=>pack.courses.map(c=>c.courseVersionId)));
 const relevant=market.sections.filter(s=>allowedVersions.has(s.courseVersionId));
 const sectionIds=relevant.map(s=>s.id);
 if(!sectionIds.length){
  const evidence={installedPacks:new Set(entitled.map(p=>p.id)).size,
   adoptedPacks:new Set(adopted.map(p=>p.id)).size,
   adoptedCourseVersions:allowedVersions.size,classes:[] as JourneyClassEvidence[]};
  return {program:market.program,classes:evidence.classes,totals:summarizeCurriculumJourney(evidence)};
 }
 const versions=await db.select({id:courseTemplateVersions.id,status:courseTemplateVersions.status,
  curriculum:courseTemplateVersions.curriculum})
   .from(courseTemplateVersions)
   .where(inArray(courseTemplateVersions.id,[...new Set(relevant.map(s=>s.courseVersionId))]));
 const teacherRows=await db.select({sectionId:sectionTeachers.sectionId,personId:sectionTeachers.personId})
   .from(sectionTeachers).where(inArray(sectionTeachers.sectionId,sectionIds));
 const enrollmentRows=await db.select({sectionId:enrollments.sectionId,
  studentProfileId:enrollments.studentProfileId})
   .from(enrollments).where(and(inArray(enrollments.sectionId,sectionIds),
    eq(enrollments.kind,"section"),eq(enrollments.status,"active")));
 const assessmentRows=await db.select({id:assessments.id,sectionId:assessments.sectionId})
   .from(assessments).where(and(inArray(assessments.sectionId,sectionIds),
    inArray(assessments.status,["published","closed"])));
 const assessmentIds=assessmentRows.map(a=>a.id);
 const responseRows=assessmentIds.length?await db.select({
  assessmentId:submissions.assessmentId,status:submissions.status,
 })
   .from(submissions).where(inArray(submissions.assessmentId,assessmentIds)):[];
 const classes:JourneyClassEvidence[]=relevant.map(section=>{
  const v=versions.find(v=>v.id===section.courseVersionId);
  const content=v?.status==="published"?readClassContent(v.curriculum):null;
  const ids=new Set(assessmentRows.filter(a=>a.sectionId===section.id).map(a=>a.id));
  return {
   id:section.id,title:section.title,code:section.code,courseVersionId:section.courseVersionId,
   publishedLessonCount:content?.modules.reduce((n,m)=>n+m.lessons.length,0)??0,
   teacherCount:new Set(teacherRows.filter(t=>t.sectionId===section.id).map(t=>t.personId)).size,
   studentCount:new Set(enrollmentRows.filter(e=>e.sectionId===section.id).map(e=>e.studentProfileId)).size,
   assignedAssessmentCount:ids.size,
   submittedAttemptCount:responseRows.filter(r=>ids.has(r.assessmentId) &&
    ["submitted","graded","returned"].includes(r.status)).length,
   gradedAttemptCount:responseRows.filter(r=>ids.has(r.assessmentId)&&r.status==="graded").length,
  };
 });
 const evidence={installedPacks:new Set(entitled.map(p=>p.id)).size,
  adoptedPacks:new Set(adopted.map(p=>p.id)).size,
  adoptedCourseVersions:allowedVersions.size,classes};
 return {program:market.program,classes,totals:summarizeCurriculumJourney(evidence)};
}
