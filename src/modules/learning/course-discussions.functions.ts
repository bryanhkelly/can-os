import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {getCommandContext} from "@/modules/identity/command-context.server";
import {assertCapability,AuthorizationError} from "@/domain/command-context";
import {and,eq,inArray,desc} from "drizzle-orm";
import {discussionTree} from "@/domain/course-discussions";
/** Read enrolled section discussions through verified student and program access. */
export const getCourseDiscussions=createServerFn({method:"GET"}).handler(async()=>{
 const actor=await getCommandContext(getRequest());
 setResponseHeader("Cache-Control","private, no-store");
 if(actor.role!=="student"||!actor.actorPersonId||!actor.scope.siteIds?.length)throw new AuthorizationError("student discussion access");
 assertCapability(actor,"assignments:submit");
 if(!process.env.DATABASE_URL)return [];
 const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
 const [profile]=await db.select({id:s.studentProfiles.id}).from(s.studentProfiles).where(eq(s.studentProfiles.personId,actor.actorPersonId)).limit(1);
 if(!profile)return [];
 const enrollments=await db.select({sectionId:s.enrollments.sectionId}).from(s.enrollments)
  .innerJoin(s.sections,eq(s.sections.id,s.enrollments.sectionId))
  .where(and(eq(s.enrollments.studentProfileId,profile.id),eq(s.enrollments.kind,"section"),eq(s.enrollments.status,"active"),inArray(s.sections.siteId,actor.scope.siteIds),inArray(s.sections.programId,actor.scope.programIds??[])));
 const sectionIds=enrollments.map(x=>x.sectionId).filter((x):x is string=>Boolean(x));
 if(!sectionIds.length)return [];
 const rows=await db.select({id:s.communicationThreads.id,subject:s.communicationThreads.subject,contextId:s.communicationThreads.contextId,metadata:s.communicationThreads.metadata,lastMessageAt:s.communicationThreads.lastMessageAt}).from(s.communicationThreads).where(and(eq(s.communicationThreads.contextType,"section"),inArray(s.communicationThreads.contextId,sectionIds))).orderBy(desc(s.communicationThreads.createdAt)).limit(40);
 const allowed=rows.filter(x=>x.metadata.kind==="course_discussion");
 if(!allowed.length)return [];
 const messages=await db.select({id:s.communicationMessages.id,threadId:s.communicationMessages.threadId,body:s.communicationMessages.body,senderPersonId:s.communicationMessages.senderPersonId,sentAt:s.communicationMessages.sentAt,metadata:s.communicationMessages.metadata}).from(s.communicationMessages).where(inArray(s.communicationMessages.threadId,allowed.map(x=>x.id))).orderBy(s.communicationMessages.sentAt).limit(250);
 return allowed.map(thread=>({id:thread.id,subject:thread.subject,sectionId:thread.contextId,locked:thread.metadata.locked===true,messages:discussionTree(messages.filter(m=>m.threadId===thread.id).map(m=>({id:m.id,body:m.metadata.hidden===true?"[Message hidden by teacher]":m.body,createdAt:m.sentAt.toISOString(),authorLabel:m.senderPersonId===actor.actorPersonId?"You":"Participant",parentMessageId:typeof m.metadata.parentMessageId==="string"?m.metadata.parentMessageId:null})))}));
});

/** Compatibility export until the remaining discussion routes are converged. */
export const getSyntheticCourseDiscussions=getCourseDiscussions;
