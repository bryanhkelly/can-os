import {createServerFn} from "@tanstack/react-start";
import {and,eq} from "drizzle-orm";
import {assertSyntheticMutation} from "@/modules/student-experience/demo-write-gate";
const DEMO_TEACHER="f1000000-0000-4000-8000-000000000006";
/** Private-only creation of synthetic ungraded section discussions. */
export const createSyntheticCourseDiscussion=createServerFn({method:"POST"})
.validator((input:{sectionId:string;subject:string;prompt:string})=>input)
.handler(async({data})=>{
 assertSyntheticMutation("teacher");
 const subject=data.subject.trim(),prompt=data.prompt.trim();
 if(subject.length<3||subject.length>160||prompt.length<3||prompt.length>5000)throw new Error("Discussion title or prompt outside allowed length");
 const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
 return db.transaction(async tx=>{
  const [assigned]=await tx.select({id:s.sectionTeachers.id}).from(s.sectionTeachers).where(and(eq(s.sectionTeachers.sectionId,data.sectionId),eq(s.sectionTeachers.personId,DEMO_TEACHER))).limit(1);
  if(!assigned)throw new Error("Teacher is not assigned to this section");
  const [thread]=await tx.insert(s.communicationThreads).values({subject,contextType:"section",contextId:data.sectionId,createdByPersonId:DEMO_TEACHER,metadata:{synthetic:true,kind:"course_discussion",locked:false,graded:false}}).returning({id:s.communicationThreads.id});
  if(!thread)throw new Error("Unable to create discussion");
  await tx.insert(s.communicationMessages).values({threadId:thread.id,senderPersonId:DEMO_TEACHER,body:prompt,metadata:{synthetic:true,kind:"prompt"}});
  return {id:thread.id};
 });
});
export const setSyntheticCourseDiscussionLock=createServerFn({method:"POST"})
.validator((input:{threadId:string;locked:boolean})=>input)
.handler(async({data})=>{
 assertSyntheticMutation("teacher");
 const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
 return db.transaction(async tx=>{
  const [thread]=await tx.select({id:s.communicationThreads.id,contextId:s.communicationThreads.contextId,contextType:s.communicationThreads.contextType,metadata:s.communicationThreads.metadata}).from(s.communicationThreads).where(eq(s.communicationThreads.id,data.threadId)).for("update").limit(1);
  if(!thread||thread.contextType!=="section"||!thread.contextId||thread.metadata.synthetic!==true||thread.metadata.kind!=="course_discussion")throw new Error("Discussion unavailable");
  const [assigned]=await tx.select({id:s.sectionTeachers.id}).from(s.sectionTeachers).where(and(eq(s.sectionTeachers.sectionId,thread.contextId),eq(s.sectionTeachers.personId,DEMO_TEACHER))).limit(1);
  if(!assigned)throw new Error("Teacher is not assigned to this section");
  await tx.update(s.communicationThreads).set({metadata:{...thread.metadata,locked:data.locked},updatedAt:new Date()}).where(eq(s.communicationThreads.id,thread.id));
  return {saved:true};
 });
});
