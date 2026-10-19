import { assertCapability,AuthorizationError } from "@/domain/command-context";
import { isValidDiscussionPost } from "@/domain/course-discussions";
import { EventTypes } from "@/domain/event-types";
import { emitEvent,writeAudit } from "@/platform/mutation";
import {classActor,authorizeClass} from "./class-access.server";
import { createServerFn } from "@tanstack/react-start";
import { and,eq } from "drizzle-orm";
import { z } from "zod";
/** Enrolled students and assigned teachers share the canonical discussion. */
export const postDiscussionMessage=createServerFn({method:"POST"})
.validator((input:unknown)=>z.object({threadId:z.string().uuid(),body:z.string(),parentMessageId:z.string().uuid().nullish()}).parse(input))
.handler(async({data})=>{
 const actor=await classActor();
 if(actor.role!=="student"&&actor.role!=="teacher")throw new AuthorizationError("class discussion participant");
 assertCapability(actor,actor.role==="teacher"?"discussions:moderate":"assignments:submit");
 const actorPersonId=actor.actorPersonId;
 if(!actorPersonId)throw new AuthorizationError("student identity");
 if(!actor.scope.siteIds?.length)throw new AuthorizationError("student site membership");
 if(!isValidDiscussionPost(data.body))throw new Error("Message must contain 1–5,000 characters");
 const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
 return db.transaction(async tx=>{
  const [thread]=await tx.select({id:s.communicationThreads.id,contextType:s.communicationThreads.contextType,contextId:s.communicationThreads.contextId,metadata:s.communicationThreads.metadata}).from(s.communicationThreads).where(eq(s.communicationThreads.id,data.threadId)).for("update").limit(1);
  if(!thread||thread.contextType!=="section"||!thread.contextId||thread.metadata?.kind!=="course_discussion")throw new Error("Discussion not available");
  if(thread.metadata?.locked===true)throw new Error("Discussion is locked");
  await authorizeClass(actor,thread.contextId,undefined,tx);
  if(data.parentMessageId){
   const [parent]=await tx.select({id:s.communicationMessages.id,metadata:s.communicationMessages.metadata}).from(s.communicationMessages).where(and(eq(s.communicationMessages.id,data.parentMessageId),eq(s.communicationMessages.threadId,thread.id))).limit(1);
   if(!parent||parent.metadata?.hidden===true)throw new Error("Reply target is unavailable");
  }
  const [created]=await tx.insert(s.communicationMessages).values({threadId:thread.id,senderPersonId:actorPersonId,body:data.body.trim(),metadata:{...(data.parentMessageId?{parentMessageId:data.parentMessageId}:{})}}).returning({id:s.communicationMessages.id});
  if(!created)throw new Error("Unable to create discussion response");
  await tx.update(s.communicationThreads).set({lastMessageAt:new Date(),updatedAt:new Date()}).where(eq(s.communicationThreads.id,thread.id));
  await writeAudit(tx, {actorPersonId:actor.actorPersonId,action:"discussion.post",resourceType:"communication_message",resourceId:created.id,after:{threadId:thread.id,parentMessageId:data.parentMessageId??null},context:{sessionId:actor.sessionId}});
  await emitEvent(tx,{eventType:EventTypes.CourseDiscussionMessagePosted,aggregateType:"communication_thread",aggregateId:thread.id,
   actorPersonId,payload:{messageId:created.id,sectionId:thread.contextId}});
  return {id:created.id};
 });
});

export const postSyntheticDiscussionMessage=postDiscussionMessage;
