import {createServerFn} from "@tanstack/react-start";
import {getRequest} from "@tanstack/react-start/server";
import {getCommandContext} from "@/modules/identity/command-context.server";
import {assertCapability,AuthorizationError} from "@/domain/command-context";
import {and,eq} from "drizzle-orm";
import {assertSyntheticMutation} from "@/modules/student-experience/demo-write-gate";
import {isValidDiscussionPost} from "@/domain/course-discussions";
import { z } from "zod";
/** Private synthetic-only write. Never infer permissions from a browser-selected persona. */
export const postSyntheticDiscussionMessage=createServerFn({method:"POST"})
.validator((input:unknown)=>z.object({threadId:z.string().min(1),body:z.string(),parentMessageId:z.string().min(1).nullish()}).parse(input))
.handler(async({data})=>{
 assertSyntheticMutation("student");
 const actor=await getCommandContext(getRequest());
 if(actor.role!=="student"||!actor.actorPersonId)throw new AuthorizationError("demo student identity");
 assertCapability(actor,"assignments:submit");
 const actorPersonId=actor.actorPersonId;
 if(!actorPersonId)throw new AuthorizationError("student identity");
 if(!actor.scope.siteIds?.length)throw new AuthorizationError("student site membership");
 if(!isValidDiscussionPost(data.body))throw new Error("Message must contain 1–5,000 characters");
 if(!/^[0-9a-f-]{36}$/i.test(data.threadId))throw new Error("Invalid discussion");
 const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
 return db.transaction(async tx=>{
  const [thread]=await tx.select({id:s.communicationThreads.id,contextType:s.communicationThreads.contextType,contextId:s.communicationThreads.contextId,metadata:s.communicationThreads.metadata}).from(s.communicationThreads).where(eq(s.communicationThreads.id,data.threadId)).for("update").limit(1);
  if(!thread||thread.contextType!=="section"||!thread.contextId||thread.metadata?.synthetic!==true||thread.metadata?.kind!=="course_discussion")throw new Error("Discussion not available");
  if(thread.metadata?.locked===true)throw new Error("Discussion is locked");
  const [profile]=await tx.select({id:s.studentProfiles.id}).from(s.studentProfiles).where(eq(s.studentProfiles.personId,actorPersonId)).limit(1);
  if(!profile)throw new AuthorizationError("student profile");
  const [enrolled]=await tx.select({id:s.enrollments.id}).from(s.enrollments).where(and(eq(s.enrollments.studentProfileId,profile.id),eq(s.enrollments.sectionId,thread.contextId),eq(s.enrollments.kind,"section"),eq(s.enrollments.status,"active"))).limit(1);
  if(!enrolled)throw new Error("Student is not enrolled in this section");
  const [section]=await tx.select({siteId:s.sections.siteId}).from(s.sections).where(eq(s.sections.id,thread.contextId)).limit(1);
  if(!section?.siteId||!actor.scope.siteIds?.includes(section.siteId))throw new AuthorizationError("discussion section site");
  if(data.parentMessageId){
   const [parent]=await tx.select({id:s.communicationMessages.id,metadata:s.communicationMessages.metadata}).from(s.communicationMessages).where(and(eq(s.communicationMessages.id,data.parentMessageId),eq(s.communicationMessages.threadId,thread.id))).limit(1);
   if(!parent||parent.metadata?.synthetic!==true||parent.metadata?.hidden===true)throw new Error("Reply target is unavailable");
  }
  const [created]=await tx.insert(s.communicationMessages).values({threadId:thread.id,senderPersonId:actorPersonId,body:data.body.trim(),metadata:{synthetic:true,...(data.parentMessageId?{parentMessageId:data.parentMessageId}:{})}}).returning({id:s.communicationMessages.id});
  if(!created)throw new Error("Unable to create discussion response");
  await tx.update(s.communicationThreads).set({lastMessageAt:new Date(),updatedAt:new Date()}).where(eq(s.communicationThreads.id,thread.id));
  await tx.insert(s.auditEvents).values({actorPersonId:actor.actorPersonId,action:"discussion.post",resourceType:"communication_message",resourceId:created.id,after:{threadId:thread.id,parentMessageId:data.parentMessageId??null},context:{synthetic:true}});
  return {id:created.id};
 });
});
