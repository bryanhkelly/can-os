import {createServerFn} from "@tanstack/react-start";
import {and,eq,inArray,lt} from "drizzle-orm";
const TEACHER="f1000000-0000-4000-8000-000000000006";
const SITE="f1000000-0000-4000-8000-000000000003";

/** A real enrolled-roster queue restricted to synthetic students in the demo teacher's assigned sections. */
export const getSyntheticTeacherMissingWork=createServerFn({method:"GET"}).handler(async()=>{
 if(!process.env.DATABASE_URL)return {connected:false,items:[]};
 const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
 const assigned=await db.select({sectionId:s.sectionTeachers.sectionId}).from(s.sectionTeachers)
  .innerJoin(s.sections,and(eq(s.sections.id,s.sectionTeachers.sectionId),eq(s.sections.siteId,SITE)))
  .where(eq(s.sectionTeachers.personId,TEACHER));
 const sectionIds=[...new Set(assigned.map(x=>x.sectionId))];
 if(!sectionIds.length)return {connected:true,items:[]};
 const now=new Date();
 const due=await db.select({id:s.assessments.id,title:s.assessments.title,dueAt:s.assessments.dueAt,sectionId:s.assessments.sectionId,course:s.sections.title}).from(s.assessments)
  .innerJoin(s.sections,eq(s.sections.id,s.assessments.sectionId))
  .where(and(inArray(s.assessments.sectionId,sectionIds),inArray(s.assessments.status,["published","closed"]),lt(s.assessments.dueAt,now)));
 if(!due.length)return {connected:true,items:[]};
 const roster=await db.select({sectionId:s.enrollments.sectionId,studentId:s.studentProfiles.id,studentName:s.people.legalFirstName,studentLastName:s.people.legalLastName,studentSynthetic:s.people.metadata}).from(s.enrollments)
  .innerJoin(s.studentProfiles,eq(s.studentProfiles.id,s.enrollments.studentProfileId))
  .innerJoin(s.people,eq(s.people.id,s.studentProfiles.personId))
  .where(and(eq(s.enrollments.kind,"section"),eq(s.enrollments.status,"active"),inArray(s.enrollments.sectionId,sectionIds)));
 const eligible=roster.filter(x=>x.studentSynthetic.synthetic===true);
 const submissions=await db.select({assessmentId:s.submissions.assessmentId,studentId:s.submissions.studentProfileId,status:s.submissions.status,attempt:s.submissions.attemptNumber}).from(s.submissions).where(inArray(s.submissions.assessmentId,due.map(x=>x.id)));
 const latest=new Map<string,(typeof submissions)[number]>();
 for(const sub of submissions){const key=sub.assessmentId+":"+sub.studentId;const prev=latest.get(key);if(!prev||sub.attempt>prev.attempt)latest.set(key,sub);}
 const items=due.flatMap(a=>eligible.filter(student=>student.sectionId===a.sectionId).flatMap(student=>{
  const sub=latest.get(a.id+":"+student.studentId);
  if(sub&&sub.status!=="assigned")return [];
  return [{assessmentId:a.id,title:a.title,course:a.course,sectionId:a.sectionId,dueAt:a.dueAt!.toISOString(),studentProfileId:student.studentId,studentName:student.studentName+" "+student.studentLastName,status:sub?.status??"not_started"}];
 })).sort((a,b)=>a.dueAt.localeCompare(b.dueAt));
 return {connected:true,items};
});
