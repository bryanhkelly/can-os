import {createServerFn} from "@tanstack/react-start";
import {getRequest} from "@tanstack/react-start/server";
import {getCommandContext} from "@/modules/identity/command-context.server";
import {AuthorizationError} from "@/domain/command-context";
import {and,eq,desc,sql} from "drizzle-orm";
import {assertSyntheticMutation,isSyntheticAccessEnabled} from "./demo-write-gate";
import {canAccessGroup,validateGroupInput,validateGroupPost,validateSession} from "@/domain/study-groups";
const SITE="f1000000-0000-4000-8000-000000000003";
async function groupActor(role:"student"|"teacher"){
 const actor=await getCommandContext(getRequest());
 if(actor.role!==role||!actor.actorPersonId||!actor.scope.siteIds?.includes(SITE))throw new AuthorizationError("study group "+role+" site access");
 return actor;
}
async function context(){const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);return {db,s};}
export const getStudyGroupAvailability=createServerFn({method:"GET"}).handler(async()=>({enabled:isSyntheticAccessEnabled()}));
export const listStudyGroups=createServerFn({method:"GET"}).handler(async()=>{
 assertSyntheticMutation("student");
 const actor=await groupActor("student");
 const {db,s}=await context();
 const rows=await db.select({id:s.studyGroups.id,title:s.studyGroups.title,description:s.studyGroups.description,kind:s.studyGroups.kind,capacity:s.studyGroups.maxMembers,requiresApproval:s.studyGroups.requiresApproval,facilitator:s.studyGroups.facilitatorPersonId,status:s.studyGroups.status,membership:s.studyGroupMemberships.status}).from(s.studyGroups)
 .leftJoin(s.studyGroupMemberships,and(eq(s.studyGroupMemberships.groupId,s.studyGroups.id),eq(s.studyGroupMemberships.personId,actor.actorPersonId!)))
 .where(and(eq(s.studyGroups.status,"active"),eq(s.studyGroups.siteId,SITE))).orderBy(desc(s.studyGroups.createdAt)).limit(100);
 return rows;
});
export const createStudyGroup=createServerFn({method:"POST"}).validator((x:{title:string;description:string;kind:"course"|"interest";maxMembers:number})=>x).handler(async({data})=>{
 assertSyntheticMutation("teacher");const actor=await groupActor("teacher");const valid=validateGroupInput(data);const {db,s}=await context();
 const [group]=await db.insert(s.studyGroups).values({...valid,siteId:SITE,facilitatorPersonId:actor.actorPersonId!,requiresApproval:true,visibility:"site",metadata:{synthetic:true,fixture:"gf26",createdByPersonId:actor.actorPersonId!}}).returning({id:s.studyGroups.id});
 if(!group)throw new Error('Group creation failed');return {id:group.id};
});
export const requestStudyGroupMembership=createServerFn({method:"POST"}).validator((x:{groupId:string})=>x).handler(async({data})=>{
 assertSyntheticMutation("student");const actor=await groupActor("student");const {db,s}=await context();
 return db.transaction(async tx=>{
 const [group]=await tx.select().from(s.studyGroups).where(and(eq(s.studyGroups.id,data.groupId),eq(s.studyGroups.status,"active"),eq(s.studyGroups.siteId,SITE))).for("update").limit(1);
 if(!group)throw new Error("Group unavailable");
 const [existing]=await tx.select({status:s.studyGroupMemberships.status}).from(s.studyGroupMemberships).where(and(eq(s.studyGroupMemberships.groupId,group.id),eq(s.studyGroupMemberships.personId,actor.actorPersonId!))).limit(1);
 if(existing?.status==="approved"||existing?.status==="pending")return {ok:true};
 await tx.insert(s.studyGroupMemberships).values({groupId:group.id,personId:actor.actorPersonId!,role:"student",status:"pending"}).onConflictDoUpdate({target:[s.studyGroupMemberships.groupId,s.studyGroupMemberships.personId],set:{status:"pending",reviewedByPersonId:null,joinedAt:null,updatedAt:new Date()}});
 await tx.insert(s.notifications).values({recipientPersonId:group.facilitatorPersonId,type:"study_group_membership_request",status:"unread",title:"Study group membership request",body:"A student has requested to join "+group.title+".",resourceType:"study_group",resourceId:group.id});
 return {ok:true};
 });
});
export const decideStudyGroupMembership=createServerFn({method:"POST"}).validator((x:{groupId:string;personId:string;approve:boolean})=>x).handler(async({data})=>{
 assertSyntheticMutation("teacher");const actor=await groupActor("teacher");const {db,s}=await context();
 return db.transaction(async tx=>{
 const [group]=await tx.select().from(s.studyGroups).where(and(eq(s.studyGroups.id,data.groupId),eq(s.studyGroups.facilitatorPersonId,actor.actorPersonId!),eq(s.studyGroups.siteId,SITE),eq(s.studyGroups.status,"active"))).for("update").limit(1);
 if(!group||data.personId===actor.actorPersonId!)throw new Error("Not authorized to approve");
 const [member]=await tx.select().from(s.studyGroupMemberships).where(and(eq(s.studyGroupMemberships.groupId,data.groupId),eq(s.studyGroupMemberships.personId,data.personId),eq(s.studyGroupMemberships.status,"pending"))).limit(1);
 if(!member)throw new Error("Pending membership not found");
 if(data.approve){
 const [count]=await tx.select({total:sql<number>`count(*)::int`}).from(s.studyGroupMemberships).where(and(eq(s.studyGroupMemberships.groupId,data.groupId),eq(s.studyGroupMemberships.status,"approved")));
 if((count?.total??0)>=group.maxMembers)throw new Error("Study group is full");
 }
 await tx.update(s.studyGroupMemberships).set({status:data.approve?"approved":"declined",reviewedByPersonId:actor.actorPersonId!,joinedAt:data.approve?new Date():null,updatedAt:new Date()}).where(eq(s.studyGroupMemberships.id,member.id));
 await tx.insert(s.notifications).values({recipientPersonId:data.personId,type:"study_group_membership_decision",status:"unread",title:data.approve?"Study group membership approved":"Study group membership declined",body:data.approve?"You can now participate in "+group.title+".":"Your request to join "+group.title+" was declined.",resourceType:"study_group",resourceId:group.id});
 await tx.insert(s.auditEvents).values({actorPersonId:actor.actorPersonId!,action:data.approve?"study_group.membership.approve":"study_group.membership.decline",resourceType:"study_group",resourceId:group.id,after:{personId:data.personId,status:data.approve?"approved":"declined"},context:{synthetic:true}});
 return {ok:true};
 });
});
export const leaveStudyGroup=createServerFn({method:"POST"}).validator((x:{groupId:string})=>x).handler(async({data})=>{
 assertSyntheticMutation("student");const actor=await groupActor("student");const {db,s}=await context();
 await db.update(s.studyGroupMemberships).set({status:"left",updatedAt:new Date()}).where(and(eq(s.studyGroupMemberships.groupId,data.groupId),eq(s.studyGroupMemberships.personId,actor.actorPersonId!)));return {ok:true};
});
export const getStudyGroupDetail=createServerFn({method:"GET"}).validator((x:{groupId:string})=>x).handler(async({data})=>{
 assertSyntheticMutation("student");
 const actor=await groupActor("student");
 const {db,s}=await context();
 const [group]=await db.select({id:s.studyGroups.id,title:s.studyGroups.title,description:s.studyGroups.description,kind:s.studyGroups.kind,status:s.studyGroups.status,siteId:s.studyGroups.siteId,programId:s.studyGroups.programId,sectionId:s.studyGroups.sectionId,facilitatorPersonId:s.studyGroups.facilitatorPersonId,maxMembers:s.studyGroups.maxMembers,requiresApproval:s.studyGroups.requiresApproval,createdAt:s.studyGroups.createdAt}).from(s.studyGroups).where(and(eq(s.studyGroups.id,data.groupId),eq(s.studyGroups.siteId,SITE))).limit(1);
 if(!group)throw new Error("Group unavailable");
 const [membership]=await db.select().from(s.studyGroupMemberships).where(and(eq(s.studyGroupMemberships.groupId,data.groupId),eq(s.studyGroupMemberships.personId,actor.actorPersonId!))).limit(1);
 const permitted=canAccessGroup((membership?.status??null) as "pending"|"approved"|"declined"|"left"|null,"student");
 if(!permitted)return {group,memberStatus:membership?.status??null,posts:[],sessions:[]};
 const [posts,sessions]=await Promise.all([
 db.select({id:s.studyGroupPosts.id,body:s.studyGroupPosts.body,createdAt:s.studyGroupPosts.createdAt,parentPostId:s.studyGroupPosts.parentPostId}).from(s.studyGroupPosts).where(and(eq(s.studyGroupPosts.groupId,data.groupId),eq(s.studyGroupPosts.hidden,false))).orderBy(desc(s.studyGroupPosts.createdAt)).limit(100),
 db.select({id:s.studyGroupSessions.id,title:s.studyGroupSessions.title,agenda:s.studyGroupSessions.agenda,startsAt:s.studyGroupSessions.startsAt,endsAt:s.studyGroupSessions.endsAt,cancelled:sql<boolean>`coalesce(${s.calendarEvents.metadata}->>'cancelled','false') = 'true'`}).from(s.studyGroupSessions).leftJoin(s.calendarEvents,and(eq(s.calendarEvents.sourceType,"study_group_session"),eq(s.calendarEvents.sourceId,s.studyGroupSessions.id))).where(eq(s.studyGroupSessions.groupId,data.groupId)).orderBy(s.studyGroupSessions.startsAt).limit(50)]);
 return {group,memberStatus:membership?.status??null,posts,sessions};
});
export const postStudyGroupMessage=createServerFn({method:"POST"}).validator((x:{groupId:string;body:string})=>x).handler(async({data})=>{
 assertSyntheticMutation("student");const actor=await groupActor("student");const body=validateGroupPost(data.body);const {db,s}=await context();
 const [membership]=await db.select().from(s.studyGroupMemberships).where(and(eq(s.studyGroupMemberships.groupId,data.groupId),eq(s.studyGroupMemberships.personId,actor.actorPersonId!),eq(s.studyGroupMemberships.status,"approved"))).limit(1);
 if(!membership)throw new Error("Approved membership required");
 const [post]=await db.insert(s.studyGroupPosts).values({groupId:data.groupId,body,authorPersonId:actor.actorPersonId!}).returning({id:s.studyGroupPosts.id});if(!post)throw new Error('Post creation failed');return {id:post.id};
});
export const scheduleStudyGroupSession=createServerFn({method:"POST"}).validator((x:{groupId:string;title:string;agenda:string;startsAt:string;endsAt:string})=>x).handler(async({data})=>{
 assertSyntheticMutation("teacher");const actor=await groupActor("teacher");const {start,end}=validateSession(data.startsAt,data.endsAt);const {db,s}=await context();
 const [group]=await db.select().from(s.studyGroups).where(and(eq(s.studyGroups.id,data.groupId),eq(s.studyGroups.facilitatorPersonId,actor.actorPersonId!),eq(s.studyGroups.siteId,SITE),eq(s.studyGroups.status,"active"))).limit(1);
 if(!group)throw new Error("Facilitator required");
 if(data.title.trim().length<3||data.title.length>120||data.agenda.length>2000)throw new Error("Invalid session details");
 return db.transaction(async tx=>{
 const [session]=await tx.insert(s.studyGroupSessions).values({groupId:data.groupId,title:data.title.trim(),agenda:data.agenda,startsAt:start,endsAt:end}).returning({id:s.studyGroupSessions.id});
 if(!session)throw new Error('Session creation failed');
 const [site]=await tx.select({organizationId:s.sites.organizationId,timezone:s.sites.timezone}).from(s.sites).where(eq(s.sites.id,group.siteId!)).limit(1);
 if(!site)throw new Error("Group site missing");
 await tx.insert(s.calendarEvents).values({
 type:"study_group",title:data.title.trim(),description:data.agenda,
 startsAt:start,endsAt:end,timezone:site.timezone,
 organizationId:site.organizationId,siteId:group.siteId,programId:group.programId,sectionId:group.sectionId,
 sourceType:"study_group_session",sourceId:session.id,createdByPersonId:actor.actorPersonId!,
 metadata:{synthetic:true,fixture:"gf26",groupId:group.id}
 });
 const members=await tx.select({personId:s.studyGroupMemberships.personId}).from(s.studyGroupMemberships)
  .where(and(eq(s.studyGroupMemberships.groupId,group.id),eq(s.studyGroupMemberships.status,"approved")));
 if(members.length){
  await tx.insert(s.notifications).values([...new Set(members.map(m=>m.personId))].map(personId=>({
   recipientPersonId:personId,
   type:"study_group_session_scheduled",
   title:"New study group session: "+data.title.trim(),
   body:"Scheduled start: "+start.toISOString(),
   resourceType:"study_group_session",
   resourceId:session.id
  })));
 }
 return session;
 });
});
export const reportStudyGroupPost=createServerFn({method:"POST"}).validator((x:{groupId:string;postId:string;reason:string})=>x).handler(async({data})=>{
 assertSyntheticMutation("student");const actor=await groupActor("student");const {db,s}=await context();
 if(data.reason.trim().length<5||data.reason.length>1000)throw new Error("Please provide a reason");
 return db.transaction(async tx=>{
 const [member]=await tx.select().from(s.studyGroupMemberships).where(and(eq(s.studyGroupMemberships.groupId,data.groupId),eq(s.studyGroupMemberships.personId,actor.actorPersonId!),eq(s.studyGroupMemberships.status,"approved"))).limit(1);
 const [post]=await tx.select().from(s.studyGroupPosts).where(and(eq(s.studyGroupPosts.groupId,data.groupId),eq(s.studyGroupPosts.id,data.postId),eq(s.studyGroupPosts.hidden,false))).for("update").limit(1);
 if(!member||!post)throw new Error("Cannot report this content");
 const [existing]=await tx.select({id:s.studyGroupReports.id}).from(s.studyGroupReports).where(and(eq(s.studyGroupReports.groupId,data.groupId),eq(s.studyGroupReports.postId,data.postId),eq(s.studyGroupReports.reporterPersonId,actor.actorPersonId!),eq(s.studyGroupReports.status,"open"))).limit(1);
 if(existing)return {ok:true,created:false};
 await tx.insert(s.studyGroupReports).values({groupId:data.groupId,postId:data.postId,reporterPersonId:actor.actorPersonId!,reason:data.reason.trim()});
 const [group]=await tx.select({facilitatorPersonId:s.studyGroups.facilitatorPersonId,title:s.studyGroups.title}).from(s.studyGroups).where(and(eq(s.studyGroups.id,data.groupId),eq(s.studyGroups.siteId,SITE),eq(s.studyGroups.status,"active"))).limit(1);
 if(!group)throw new Error("Group unavailable");
 await tx.insert(s.notifications).values({recipientPersonId:group.facilitatorPersonId,type:"study_group_report_submitted",status:"unread",title:"Study group content reported",body:"A post in "+group.title+" requires moderation.",resourceType:"study_group",resourceId:data.groupId});
 return {ok:true,created:true};
 });
});

export const listStudyGroupReviewQueue=createServerFn({method:"GET"}).handler(async()=>{
 assertSyntheticMutation("teacher");const actor=await groupActor("teacher");
 const {db,s}=await context();
 return db.select({groupId:s.studyGroups.id,groupTitle:s.studyGroups.title,personId:s.studyGroupMemberships.personId,personName:s.people.legalFirstName,status:s.studyGroupMemberships.status})
 .from(s.studyGroupMemberships)
 .innerJoin(s.studyGroups,and(eq(s.studyGroupMemberships.groupId,s.studyGroups.id),eq(s.studyGroups.facilitatorPersonId,actor.actorPersonId!),eq(s.studyGroups.siteId,SITE)))
 .innerJoin(s.people,eq(s.studyGroupMemberships.personId,s.people.id))
 .where(eq(s.studyGroupMemberships.status,"pending")).limit(100);
});
export const listStudyGroupReports=createServerFn({method:"GET"}).handler(async()=>{
 assertSyntheticMutation("teacher");const actor=await groupActor("teacher");
 const {db,s}=await context();
 return db.select({id:s.studyGroupReports.id,groupId:s.studyGroupReports.groupId,reason:s.studyGroupReports.reason,status:s.studyGroupReports.status,postId:s.studyGroupReports.postId})
 .from(s.studyGroupReports).innerJoin(s.studyGroups,and(eq(s.studyGroupReports.groupId,s.studyGroups.id),eq(s.studyGroups.facilitatorPersonId,actor.actorPersonId!),eq(s.studyGroups.siteId,SITE)))
 .where(eq(s.studyGroupReports.status,"open")).limit(100);
});
export const resolveStudyGroupReport=createServerFn({method:"POST"}).validator((x:{reportId:string;hidePost:boolean})=>x).handler(async({data})=>{
 assertSyntheticMutation("teacher");const actor=await groupActor("teacher");const {db,s}=await context();
 return db.transaction(async tx=>{
 const [report]=await tx.select({id:s.studyGroupReports.id,postId:s.studyGroupReports.postId,groupId:s.studyGroupReports.groupId,reporterPersonId:s.studyGroupReports.reporterPersonId})
 .from(s.studyGroupReports).innerJoin(s.studyGroups,and(eq(s.studyGroups.id,s.studyGroupReports.groupId),eq(s.studyGroups.facilitatorPersonId,actor.actorPersonId!),eq(s.studyGroups.siteId,SITE)))
 .where(and(eq(s.studyGroupReports.id,data.reportId),eq(s.studyGroupReports.status,"open"))).limit(1);
 if(!report)throw new Error("Open report not found");
 if(data.hidePost&&report.postId)await tx.update(s.studyGroupPosts).set({hidden:true,updatedAt:new Date()}).where(and(eq(s.studyGroupPosts.id,report.postId),eq(s.studyGroupPosts.groupId,report.groupId)));
 await tx.update(s.studyGroupReports).set({status:"resolved"}).where(eq(s.studyGroupReports.id,report.id));
 await tx.insert(s.notifications).values({recipientPersonId:report.reporterPersonId,type:"study_group_report_resolved",status:"unread",title:"Study group report reviewed",body:data.hidePost?"The reported post was hidden after review.":"Your report was reviewed by a facilitator.",resourceType:"study_group",resourceId:report.groupId});
 await tx.insert(s.auditEvents).values({actorPersonId:actor.actorPersonId!,action:"study_group.report.resolve",resourceType:"study_group_report",resourceId:report.id,after:{hidden:data.hidePost,groupId:report.groupId},context:{synthetic:true}});
 return {ok:true};
 });
});

export const rsvpStudyGroupSession=createServerFn({method:"POST"})
.validator((x:{sessionId:string;rsvp:"going"|"maybe"|"declined"})=>x).handler(async({data})=>{
 assertSyntheticMutation("student");const actor=await groupActor("student");
 if(!["going","maybe","declined"].includes(data.rsvp))throw new Error("Invalid RSVP");
 const {db,s}=await context();
 const [session]=await db.select({id:s.studyGroupSessions.id,groupId:s.studyGroupSessions.groupId})
 .from(s.studyGroupSessions).innerJoin(s.studyGroups,and(eq(s.studyGroups.id,s.studyGroupSessions.groupId),eq(s.studyGroups.siteId,SITE),eq(s.studyGroups.status,"active")))
 .where(eq(s.studyGroupSessions.id,data.sessionId)).limit(1);
 if(!session)throw new Error("Session not found");
 return db.transaction(async tx=>{
 const [calendar]=await tx.select({metadata:s.calendarEvents.metadata}).from(s.calendarEvents).where(and(eq(s.calendarEvents.sourceType,"study_group_session"),eq(s.calendarEvents.sourceId,session.id))).for("update").limit(1);
 if(!calendar||calendar.metadata.cancelled===true)throw new Error("Session is cancelled or missing its calendar event");
 const [member]=await tx.select({id:s.studyGroupMemberships.id}).from(s.studyGroupMemberships)
 .where(and(eq(s.studyGroupMemberships.groupId,session.groupId),eq(s.studyGroupMemberships.personId,actor.actorPersonId!),eq(s.studyGroupMemberships.status,"approved"))).limit(1);
 if(!member)throw new Error("Approved membership required");
 await tx.insert(s.studyGroupSessionAttendance).values({sessionId:session.id,personId:actor.actorPersonId!,rsvp:data.rsvp})
 .onConflictDoUpdate({target:[s.studyGroupSessionAttendance.sessionId,s.studyGroupSessionAttendance.personId],set:{rsvp:data.rsvp,updatedAt:new Date()}});
 return {ok:true};
 });
});
export const recordStudyGroupAttendance=createServerFn({method:"POST"})
.validator((x:{sessionId:string;personId:string;attended:boolean})=>x).handler(async({data})=>{
 assertSyntheticMutation("teacher");const actor=await groupActor("teacher");const {db,s}=await context();
 const [session]=await db.select({id:s.studyGroupSessions.id,groupId:s.studyGroupSessions.groupId}).from(s.studyGroupSessions)
 .innerJoin(s.studyGroups,and(eq(s.studyGroups.id,s.studyGroupSessions.groupId),eq(s.studyGroups.facilitatorPersonId,actor.actorPersonId!),eq(s.studyGroups.siteId,SITE)))
 .where(eq(s.studyGroupSessions.id,data.sessionId)).limit(1);
 if(!session)throw new Error("Not authorized for this session");
 return db.transaction(async tx=>{
 const [calendar]=await tx.select({metadata:s.calendarEvents.metadata}).from(s.calendarEvents).where(and(eq(s.calendarEvents.sourceType,"study_group_session"),eq(s.calendarEvents.sourceId,session.id))).for("update").limit(1);
 if(!calendar||calendar.metadata.cancelled===true)throw new Error("Cannot record attendance for a cancelled or unlinked session");
 const [member]=await tx.select({id:s.studyGroupMemberships.id}).from(s.studyGroupMemberships).where(and(eq(s.studyGroupMemberships.groupId,session.groupId),eq(s.studyGroupMemberships.personId,data.personId),eq(s.studyGroupMemberships.status,"approved"))).limit(1);
 if(!member)throw new Error("Attendance requires approved member");
 await tx.insert(s.studyGroupSessionAttendance).values({sessionId:data.sessionId,personId:data.personId,rsvp:"going",attended:data.attended,recordedByPersonId:actor.actorPersonId!})
 .onConflictDoUpdate({target:[s.studyGroupSessionAttendance.sessionId,s.studyGroupSessionAttendance.personId],set:{attended:data.attended,recordedByPersonId:actor.actorPersonId!,updatedAt:new Date()}});
 return {ok:true};
 });
});
export const listStudyGroupAttendance=createServerFn({method:"GET"})
.validator((x:{sessionId:string})=>x).handler(async({data})=>{
 assertSyntheticMutation("teacher");const actor=await groupActor("teacher");const {db,s}=await context();
 const [session]=await db.select({id:s.studyGroupSessions.id,groupId:s.studyGroupSessions.groupId}).from(s.studyGroupSessions)
 .innerJoin(s.studyGroups,and(eq(s.studyGroups.id,s.studyGroupSessions.groupId),eq(s.studyGroups.siteId,SITE),eq(s.studyGroups.facilitatorPersonId,actor.actorPersonId!)))
 .where(eq(s.studyGroupSessions.id,data.sessionId)).limit(1);
 if(!session)throw new Error("Access denied");
 // The roster includes every approved member, even when they never RSVP'd.
 // Attendance recording must not depend on having an existing RSVP row.
 return db.select({personId:s.studyGroupMemberships.personId,rsvp:s.studyGroupSessionAttendance.rsvp,attended:s.studyGroupSessionAttendance.attended})
 .from(s.studyGroupMemberships)
 .leftJoin(s.studyGroupSessionAttendance,and(eq(s.studyGroupSessionAttendance.personId,s.studyGroupMemberships.personId),eq(s.studyGroupSessionAttendance.sessionId,data.sessionId)))
 .where(and(eq(s.studyGroupMemberships.groupId,session.groupId),eq(s.studyGroupMemberships.status,"approved")));
});

/** Updates the session and its canonical calendar event in one transaction. */
export const reviseStudyGroupSession=createServerFn({method:"POST"})
.validator((x:{sessionId:string;action:"reschedule"|"cancel";startsAt?:string;endsAt?:string})=>x)
.handler(async({data})=>{
 assertSyntheticMutation("teacher");const actor=await groupActor("teacher");
 if(data.action!=="reschedule"&&data.action!=="cancel")throw new Error("Invalid session action");
 const {db,s}=await context();
 const times=data.action==="reschedule"?validateSession(data.startsAt??"",data.endsAt??""):null;
 return db.transaction(async tx=>{
  const [session]=await tx.select({id:s.studyGroupSessions.id,groupId:s.studyGroupSessions.groupId,startsAt:s.studyGroupSessions.startsAt,endsAt:s.studyGroupSessions.endsAt}).from(s.studyGroupSessions)
   .innerJoin(s.studyGroups,and(eq(s.studyGroups.id,s.studyGroupSessions.groupId),eq(s.studyGroups.facilitatorPersonId,actor.actorPersonId!),eq(s.studyGroups.siteId,SITE),eq(s.studyGroups.status,"active")))
   .where(eq(s.studyGroupSessions.id,data.sessionId)).for("update").limit(1);
  if(!session)throw new Error("Facilitator session not found");
  const [event]=await tx.select().from(s.calendarEvents).where(and(eq(s.calendarEvents.sourceType,"study_group_session"),eq(s.calendarEvents.sourceId,session.id))).for("update").limit(1);
  if(!event)throw new Error("Canonical calendar event missing");
  if(event.metadata.cancelled===true)throw new Error("Cancelled session cannot be changed");
  if(data.action==="reschedule"&&times!.start.getTime()===session.startsAt.getTime()&&times!.end.getTime()===session.endsAt.getTime())return {ok:true};
  if(data.action==="cancel"){
   await tx.update(s.calendarEvents).set({metadata:{...event.metadata,cancelled:true,cancelledAt:new Date().toISOString()},updatedAt:new Date()}).where(eq(s.calendarEvents.id,event.id));
  } else {
   await tx.update(s.studyGroupSessions).set({startsAt:times!.start,endsAt:times!.end,updatedAt:new Date()}).where(eq(s.studyGroupSessions.id,session.id));
   await tx.update(s.calendarEvents).set({startsAt:times!.start,endsAt:times!.end,updatedAt:new Date()}).where(eq(s.calendarEvents.id,event.id));
  }
  const members=await tx.select({personId:s.studyGroupMemberships.personId}).from(s.studyGroupMemberships).where(and(eq(s.studyGroupMemberships.groupId,session.groupId),eq(s.studyGroupMemberships.status,"approved")));
  if(members.length){
   const kind=data.action==="cancel"?"cancelled":"rescheduled";
   const when=times?.start.toISOString()??null;
   await tx.insert(s.notifications).values(members.map(m=>({
    recipientPersonId:m.personId,
    type:"study_group_session_"+kind,
    title:"Study group session "+kind,
    body:when?"Updated start: "+when:"The facilitator cancelled a scheduled study group session.",
    resourceType:"study_group_session",
    resourceId:session.id
   })));
  }
  await tx.insert(s.auditEvents).values({actorPersonId:actor.actorPersonId!,action:data.action==="cancel"?"synthetic.study_group.session.cancel":"synthetic.study_group.session.reschedule",resourceType:"study_group_session",resourceId:session.id,before:{startsAt:session.startsAt.toISOString(),endsAt:session.endsAt.toISOString()},after:data.action==="cancel"?{cancelled:true}:{startsAt:times!.start.toISOString(),endsAt:times!.end.toISOString()},context:{synthetic:true,calendarEventId:event.id}});
  return {ok:true};
 });
});
