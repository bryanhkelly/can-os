import { assertCapability,AuthorizationError } from "@/domain/command-context";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { writeAudit } from "@/platform/mutation";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and,eq } from "drizzle-orm";
import { z } from "zod";
async function authorizedTeacher(){
 const actor=await getCommandContext(getRequest());
 if(actor.role!=="teacher"||!actor.actorPersonId)throw new AuthorizationError("teacher identity");
 assertCapability(actor,"assignments:grade");
 if(!actor.scope.siteIds?.length)throw new AuthorizationError("teacher site membership");
 return actor;
}
/** Teacher-created section discussions using actual school records. */
export const createCourseDiscussion=createServerFn({method:"POST"})
.validator((input:unknown)=>z.object({sectionId:z.string().min(1),subject:z.string(),prompt:z.string()}).parse(input))
.handler(async({data})=>{
 const actor=await authorizedTeacher();
 const subject=data.subject.trim(),prompt=data.prompt.trim();
 if(subject.length<3||subject.length>160||prompt.length<3||prompt.length>5000)throw new Error("Discussion title or prompt outside allowed length");
 const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
 return db.transaction(async tx=>{
  const [assigned]=await tx.select({id:s.sectionTeachers.id}).from(s.sectionTeachers).where(and(eq(s.sectionTeachers.sectionId,data.sectionId),eq(s.sectionTeachers.personId,actor.actorPersonId!))).limit(1);
  if(!assigned)throw new Error("Teacher is not assigned to this section");
  const [site]=await tx.select({siteId:s.sections.siteId,programId:s.sections.programId}).from(s.sections).where(eq(s.sections.id,data.sectionId)).limit(1);
  if(!site?.siteId||!actor.scope.siteIds?.includes(site.siteId)||!actor.scope.programIds?.includes(site.programId))throw new AuthorizationError("discussion section site");
  const [thread]=await tx.insert(s.communicationThreads).values({subject,contextType:"section",contextId:data.sectionId,createdByPersonId:actor.actorPersonId!,metadata:{kind:"course_discussion",locked:false,graded:false}}).returning({id:s.communicationThreads.id});
  if(!thread)throw new Error("Unable to create discussion");
  await tx.insert(s.communicationMessages).values({threadId:thread.id,senderPersonId:actor.actorPersonId!,body:prompt,metadata:{kind:"prompt"}});
  await writeAudit(tx, {actorPersonId:actor.actorPersonId!,action:"discussion.create",resourceType:"communication_thread",resourceId:thread.id,after:{sectionId:data.sectionId,subject},context:{sessionId:actor.sessionId}});
  return {id:thread.id};
 });
});
export const setCourseDiscussionLock=createServerFn({method:"POST"})
.validator((input:unknown)=>z.object({threadId:z.string().min(1),locked:z.boolean()}).parse(input))
.handler(async({data})=>{
 const actor=await authorizedTeacher();
 const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
 return db.transaction(async tx=>{
  const [thread]=await tx.select({id:s.communicationThreads.id,contextId:s.communicationThreads.contextId,contextType:s.communicationThreads.contextType,metadata:s.communicationThreads.metadata}).from(s.communicationThreads).where(eq(s.communicationThreads.id,data.threadId)).for("update").limit(1);
  if(!thread||thread.contextType!=="section"||!thread.contextId||thread.metadata.kind!=="course_discussion")throw new Error("Discussion unavailable");
  const [assigned]=await tx.select({id:s.sectionTeachers.id}).from(s.sectionTeachers).where(and(eq(s.sectionTeachers.sectionId,thread.contextId),eq(s.sectionTeachers.personId,actor.actorPersonId!))).limit(1);
  if(!assigned)throw new Error("Teacher is not assigned to this section");
  const [site]=await tx.select({siteId:s.sections.siteId,programId:s.sections.programId}).from(s.sections).where(eq(s.sections.id,thread.contextId)).limit(1);
  if(!site?.siteId||!actor.scope.siteIds?.includes(site.siteId)||!actor.scope.programIds?.includes(site.programId))throw new AuthorizationError("discussion section scope");
  await tx.update(s.communicationThreads).set({metadata:{...thread.metadata,locked:data.locked},updatedAt:new Date()}).where(eq(s.communicationThreads.id,thread.id));
  await writeAudit(tx, {actorPersonId:actor.actorPersonId!,action:"discussion.lock",resourceType:"communication_thread",resourceId:thread.id,before:{locked:thread.metadata.locked===true},after:{locked:data.locked},context:{sessionId:actor.sessionId}});
  return {saved:true};
 });
});

export const moderateDiscussionMessage=createServerFn({method:"POST"})
.validator((input:unknown)=>z.object({messageId:z.string().min(1),hidden:z.boolean()}).parse(input))
.handler(async({data})=>{
 const actor=await authorizedTeacher();
 const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
 return db.transaction(async tx=>{
  const [message]=await tx.select({id:s.communicationMessages.id,threadId:s.communicationMessages.threadId,metadata:s.communicationMessages.metadata}).from(s.communicationMessages).where(eq(s.communicationMessages.id,data.messageId)).for("update").limit(1);
  if(!message||message.metadata.kind==="prompt")throw new Error("Post unavailable for moderation");
  const [thread]=await tx.select({contextId:s.communicationThreads.contextId,contextType:s.communicationThreads.contextType,metadata:s.communicationThreads.metadata}).from(s.communicationThreads).where(eq(s.communicationThreads.id,message.threadId)).limit(1);
  if(!thread||thread.contextType!=="section"||!thread.contextId||thread.metadata.kind!=="course_discussion")throw new Error("Discussion unavailable");
  const [assignment]=await tx.select({id:s.sectionTeachers.id}).from(s.sectionTeachers).where(and(eq(s.sectionTeachers.sectionId,thread.contextId),eq(s.sectionTeachers.personId,actor.actorPersonId!))).limit(1);
  if(!assignment)throw new Error("Teacher is not assigned to this section");
  const [site]=await tx.select({siteId:s.sections.siteId,programId:s.sections.programId}).from(s.sections).where(eq(s.sections.id,thread.contextId)).limit(1);
  if(!site?.siteId||!actor.scope.siteIds?.includes(site.siteId)||!actor.scope.programIds?.includes(site.programId))throw new AuthorizationError("discussion section scope");
  await tx.update(s.communicationMessages).set({metadata:{...message.metadata,hidden:data.hidden,moderatedBy:actor.actorPersonId!}}).where(eq(s.communicationMessages.id,message.id));
  await writeAudit(tx, {actorPersonId:actor.actorPersonId!,action:"discussion.moderate",resourceType:"communication_message",resourceId:message.id,before:{hidden:message.metadata.hidden===true},after:{hidden:data.hidden},context:{sessionId:actor.sessionId,threadId:message.threadId}});
  return {saved:true};
 });
});

export const createSyntheticCourseDiscussion=createCourseDiscussion;
export const setSyntheticCourseDiscussionLock=setCourseDiscussionLock;
export const moderateSyntheticDiscussionMessage=moderateDiscussionMessage;
