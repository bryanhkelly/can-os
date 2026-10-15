import {createServerFn} from "@tanstack/react-start";
import {and,eq,inArray,desc} from "drizzle-orm";
import {discussionTree} from "@/domain/course-discussions";
/** Read-only preview of explicitly synthetic discussions belonging to the demo student's enrolled sections. */
export const getSyntheticCourseDiscussions=createServerFn({method:"GET"}).handler(async()=>{
 if(!process.env.DATABASE_URL)return [];
 const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
 const enrollments=await db.select({sectionId:s.enrollments.sectionId}).from(s.enrollments).where(and(eq(s.enrollments.studentProfileId,"f1000000-0000-4000-8000-000000000007"),eq(s.enrollments.kind,"section"),eq(s.enrollments.status,"active")));
 const sectionIds=enrollments.map(x=>x.sectionId).filter((x):x is string=>Boolean(x));
 if(!sectionIds.length)return [];
 const rows=await db.select({id:s.communicationThreads.id,subject:s.communicationThreads.subject,contextId:s.communicationThreads.contextId,metadata:s.communicationThreads.metadata,lastMessageAt:s.communicationThreads.lastMessageAt}).from(s.communicationThreads).where(and(eq(s.communicationThreads.contextType,"section"),inArray(s.communicationThreads.contextId,sectionIds))).orderBy(desc(s.communicationThreads.createdAt)).limit(40);
 const allowed=rows.filter(x=>x.metadata.synthetic===true&&x.metadata.kind==="course_discussion");
 if(!allowed.length)return [];
 const messages=await db.select({id:s.communicationMessages.id,threadId:s.communicationMessages.threadId,body:s.communicationMessages.body,sentAt:s.communicationMessages.sentAt,metadata:s.communicationMessages.metadata}).from(s.communicationMessages).where(inArray(s.communicationMessages.threadId,allowed.map(x=>x.id))).orderBy(s.communicationMessages.sentAt).limit(250);
 return allowed.map(thread=>({id:thread.id,subject:thread.subject,sectionId:thread.contextId,messages:discussionTree(messages.filter(m=>m.threadId===thread.id&&m.metadata.synthetic===true).map(m=>({id:m.id,body:m.body,createdAt:m.sentAt.toISOString(),authorLabel:"Demo participant",parentMessageId:typeof m.metadata.parentMessageId==="string"?m.metadata.parentMessageId:null})))}));
});
