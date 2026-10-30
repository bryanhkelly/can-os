import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {getCommandContext} from "@/modules/identity/command-context.server";
import {AuthorizationError,assertCapability} from "@/domain/command-context";
import {and,eq,inArray,desc,sql} from "drizzle-orm";
import {discussionTree} from "@/domain/course-discussions";
import {publisherLessonChoices} from "@/domain/publisher-course-references";

/** Teacher-specific read model. Never load teacher pages via student-only commands. */
export const getTeacherCourseDiscussions=createServerFn({method:"GET"}).handler(async()=>{
 const actor=await getCommandContext(getRequest());
 setResponseHeader("Cache-Control","private, no-store");
 if(actor.role!=="teacher"||!actor.actorPersonId||!actor.scope.siteIds?.length)throw new AuthorizationError("teacher discussion access");
 assertCapability(actor,"discussions:moderate");
 const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
 const sections=await db.select({id:s.sections.id,title:s.sections.title,siteId:s.sections.siteId,
  curriculum:s.courseTemplateVersions.curriculum,contentStatus:s.courseTemplateVersions.status})
  .from(s.sectionTeachers).innerJoin(s.sections,eq(s.sections.id,s.sectionTeachers.sectionId))
  .innerJoin(s.courseTemplateVersions,eq(s.courseTemplateVersions.id,s.sections.courseTemplateVersionId))
  .where(and(eq(s.sectionTeachers.personId,actor.actorPersonId),inArray(s.sections.siteId,actor.scope.siteIds),
   inArray(s.sections.programId,actor.scope.programIds??[]),eq(s.sections.active,true)));
 if(!sections.length)return {sections:[],threads:[]};
 const sectionIds=sections.map(x=>x.id);
 const rows=await db.select({id:s.communicationThreads.id,subject:s.communicationThreads.subject,contextId:s.communicationThreads.contextId,metadata:s.communicationThreads.metadata})
  .from(s.communicationThreads)
  .where(and(eq(s.communicationThreads.contextType,"section"),inArray(s.communicationThreads.contextId,sectionIds),
   sql`${s.communicationThreads.metadata}->>'kind' = 'course_discussion'`))
  .orderBy(desc(s.communicationThreads.createdAt)).limit(100);
 const allowed=rows.filter(row=>row.metadata.kind==="course_discussion");
 if(!allowed.length)return {sections:sections.map(x=>({id:x.id,title:x.title,curriculumLessons:publisherLessonChoices(x.curriculum,x.contentStatus)})),threads:[]};
 const messages=await db.select({id:s.communicationMessages.id,threadId:s.communicationMessages.threadId,body:s.communicationMessages.body,senderPersonId:s.communicationMessages.senderPersonId,sentAt:s.communicationMessages.sentAt,metadata:s.communicationMessages.metadata})
  .from(s.communicationMessages).where(inArray(s.communicationMessages.threadId,allowed.map(x=>x.id)))
  .orderBy(s.communicationMessages.sentAt).limit(1000);
 return {
  sections:sections.map(x=>({id:x.id,title:x.title,curriculumLessons:publisherLessonChoices(x.curriculum,x.contentStatus)})),
  threads:allowed.map(thread=>({
   id:thread.id,subject:thread.subject,sectionId:thread.contextId,locked:thread.metadata.locked===true,
   curriculumLessonId:typeof thread.metadata.curriculumLessonId==="string"?thread.metadata.curriculumLessonId:null,
   messages:discussionTree(messages.filter(m=>m.threadId===thread.id).map(m=>({
    id:m.id,body:m.metadata.hidden===true?"[Message hidden by teacher]":m.body,
    hidden:m.metadata.hidden===true,createdAt:m.sentAt.toISOString(),
    canModerate:m.metadata.kind!=="prompt",
    authorLabel:m.senderPersonId===actor.actorPersonId?"You":"Participant",
    parentMessageId:typeof m.metadata.parentMessageId==="string"?m.metadata.parentMessageId:null
   })))
  }))
 };
});
