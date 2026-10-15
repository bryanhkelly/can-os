import {createServerFn} from "@tanstack/react-start";
import {and,eq} from "drizzle-orm";
import {assertSyntheticMutation} from "@/modules/student-experience/demo-write-gate";
import {isValidDiscussionPost} from "@/domain/course-discussions";
const STUDENT_PROFILE="f1000000-0000-4000-8000-000000000007";
const STUDENT_PERSON="f1000000-0000-4000-8000-000000000005";
/** Private synthetic-only write. Never infer permissions from a browser-selected persona. */
export const postSyntheticDiscussionMessage=createServerFn({method:"POST"})
.validator((input:{threadId:string;body:string;parentMessageId?:string|null})=>input)
.handler(async({data})=>{
 assertSyntheticMutation("student");
 if(!isValidDiscussionPost(data.body))throw new Error("Message must contain 1–5,000 characters");
 if(!/^[0-9a-f-]{36}$/i.test(data.threadId))throw new Error("Invalid discussion");
 const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
 return db.transaction(async tx=>{
  const [thread]=await tx.select({id:s.communicationThreads.id,contextType:s.communicationThreads.contextType,contextId:s.communicationThreads.contextId,metadata:s.communicationThreads.metadata}).from(s.communicationThreads).where(eq(s.communicationThreads.id,data.threadId)).for("update").limit(1);
  if(!thread||thread.contextType!=="section"||!thread.contextId||thread.metadata.synthetic!==true||thread.metadata.kind!=="course_discussion")throw new Error("Discussion not available");
  if(thread.metadata.locked===true)throw new Error("Discussion is locked");
  const [enrolled]=await tx.select({id:s.enrollments.id}).from(s.enrollments).where(and(eq(s.enrollments.studentProfileId,STUDENT_PROFILE),eq(s.enrollments.sectionId,thread.contextId),eq(s.enrollments.kind,"section"),eq(s.enrollments.status,"active"))).limit(1);
  if(!enrolled)throw new Error("Student is not enrolled in this section");
  if(data.parentMessageId){
   const [parent]=await tx.select({id:s.communicationMessages.id}).from(s.communicationMessages).where(and(eq(s.communicationMessages.id,data.parentMessageId),eq(s.communicationMessages.threadId,thread.id))).limit(1);
   if(!parent)throw new Error("Reply target must belong to this discussion");
  }
  const [created]=await tx.insert(s.communicationMessages).values({threadId:thread.id,senderPersonId:STUDENT_PERSON,body:data.body.trim(),metadata:{synthetic:true,...(data.parentMessageId?{parentMessageId:data.parentMessageId}:{})}}).returning({id:s.communicationMessages.id});
  if(!created)throw new Error("Unable to create discussion response");
  await tx.update(s.communicationThreads).set({lastMessageAt:new Date(),updatedAt:new Date()}).where(eq(s.communicationThreads.id,thread.id));
  return {id:created.id};
 });
});
