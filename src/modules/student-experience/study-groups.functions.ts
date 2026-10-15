import {createServerFn} from "@tanstack/react-start";
import {and,eq,desc,sql} from "drizzle-orm";
import {assertSyntheticMutation} from "./demo-write-gate";
import {canAccessGroup,validateGroupInput,validateGroupPost,validateSession} from "@/domain/study-groups";
const STUDENT="f1000000-0000-4000-8000-000000000007";
const TEACHER="f1000000-0000-4000-8000-000000000006";
const SITE="f1000000-0000-4000-8000-000000000003";
async function context(){const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);return {db,s};}
export const listStudyGroups=createServerFn({method:"GET"}).handler(async()=>{
 const {db,s}=await context();
 const rows=await db.select({id:s.studyGroups.id,title:s.studyGroups.title,description:s.studyGroups.description,kind:s.studyGroups.kind,capacity:s.studyGroups.maxMembers,requiresApproval:s.studyGroups.requiresApproval,facilitator:s.studyGroups.facilitatorPersonId,status:s.studyGroups.status,membership:s.studyGroupMemberships.status}).from(s.studyGroups)
 .leftJoin(s.studyGroupMemberships,and(eq(s.studyGroupMemberships.groupId,s.studyGroups.id),eq(s.studyGroupMemberships.personId,STUDENT)))
 .where(and(eq(s.studyGroups.status,"active"),eq(s.studyGroups.siteId,SITE))).orderBy(desc(s.studyGroups.createdAt)).limit(100);
 return rows;
});
export const createStudyGroup=createServerFn({method:"POST"}).validator((x:{title:string;description:string;kind:"course"|"interest";maxMembers:number})=>x).handler(async({data})=>{
 assertSyntheticMutation("teacher");const valid=validateGroupInput(data);const {db,s}=await context();
 const [group]=await db.insert(s.studyGroups).values({...valid,siteId:SITE,facilitatorPersonId:TEACHER,requiresApproval:true,visibility:"site"}).returning({id:s.studyGroups.id});
 return {id:group.id};
});
export const requestStudyGroupMembership=createServerFn({method:"POST"}).validator((x:{groupId:string})=>x).handler(async({data})=>{
 assertSyntheticMutation("student");const {db,s}=await context();
 const [group]=await db.select().from(s.studyGroups).where(and(eq(s.studyGroups.id,data.groupId),eq(s.studyGroups.status,"active"),eq(s.studyGroups.siteId,SITE))).limit(1);
 if(!group)throw new Error("Group unavailable");
 await db.insert(s.studyGroupMemberships).values({groupId:group.id,personId:STUDENT,role:"student",status:"pending"}).onConflictDoUpdate({target:[s.studyGroupMemberships.groupId,s.studyGroupMemberships.personId],set:{status:"pending",updatedAt:new Date()}});return {ok:true};
});
export const decideStudyGroupMembership=createServerFn({method:"POST"}).validator((x:{groupId:string;personId:string;approve:boolean})=>x).handler(async({data})=>{
 assertSyntheticMutation("teacher");const {db,s}=await context();
 return db.transaction(async tx=>{
 const [group]=await tx.select().from(s.studyGroups).where(and(eq(s.studyGroups.id,data.groupId),eq(s.studyGroups.facilitatorPersonId,TEACHER),eq(s.studyGroups.siteId,SITE))).limit(1);
 if(!group||data.personId===TEACHER)throw new Error("Not authorized to approve");
 const [member]=await tx.select().from(s.studyGroupMemberships).where(and(eq(s.studyGroupMemberships.groupId,data.groupId),eq(s.studyGroupMemberships.personId,data.personId),eq(s.studyGroupMemberships.status,"pending"))).limit(1);
 if(!member)throw new Error("Pending membership not found");
 if(data.approve){
 const [count]=await tx.select({total:sql<number>`count(*)::int`}).from(s.studyGroupMemberships).where(and(eq(s.studyGroupMemberships.groupId,data.groupId),eq(s.studyGroupMemberships.status,"approved")));
 if(count.total>=group.maxMembers)throw new Error("Study group is full");
 }
 await tx.update(s.studyGroupMemberships).set({status:data.approve?"approved":"declined",reviewedByPersonId:TEACHER,joinedAt:data.approve?new Date():null,updatedAt:new Date()}).where(eq(s.studyGroupMemberships.id,member.id));
 return {ok:true};
 });
});
export const leaveStudyGroup=createServerFn({method:"POST"}).validator((x:{groupId:string})=>x).handler(async({data})=>{
 assertSyntheticMutation("student");const {db,s}=await context();
 await db.update(s.studyGroupMemberships).set({status:"left",updatedAt:new Date()}).where(and(eq(s.studyGroupMemberships.groupId,data.groupId),eq(s.studyGroupMemberships.personId,STUDENT)));return {ok:true};
});
export const getStudyGroupDetail=createServerFn({method:"GET"}).validator((x:{groupId:string})=>x).handler(async({data})=>{
 const {db,s}=await context();
 const [group]=await db.select().from(s.studyGroups).where(and(eq(s.studyGroups.id,data.groupId),eq(s.studyGroups.siteId,SITE))).limit(1);
 if(!group)throw new Error("Group unavailable");
 const [membership]=await db.select().from(s.studyGroupMemberships).where(and(eq(s.studyGroupMemberships.groupId,data.groupId),eq(s.studyGroupMemberships.personId,STUDENT))).limit(1);
 const permitted=canAccessGroup((membership?.status??null) as "pending"|"approved"|"declined"|"left"|null,"student");
 if(!permitted)return {group,memberStatus:membership?.status??null,posts:[],sessions:[]};
 const [posts,sessions]=await Promise.all([
 db.select({id:s.studyGroupPosts.id,body:s.studyGroupPosts.body,createdAt:s.studyGroupPosts.createdAt,parentPostId:s.studyGroupPosts.parentPostId}).from(s.studyGroupPosts).where(and(eq(s.studyGroupPosts.groupId,data.groupId),eq(s.studyGroupPosts.hidden,false))).orderBy(desc(s.studyGroupPosts.createdAt)).limit(100),
 db.select().from(s.studyGroupSessions).where(eq(s.studyGroupSessions.groupId,data.groupId)).orderBy(s.studyGroupSessions.startsAt).limit(50)]);
 return {group,memberStatus:membership?.status??null,posts,sessions};
});
export const postStudyGroupMessage=createServerFn({method:"POST"}).validator((x:{groupId:string;body:string})=>x).handler(async({data})=>{
 assertSyntheticMutation("student");const body=validateGroupPost(data.body);const {db,s}=await context();
 const [membership]=await db.select().from(s.studyGroupMemberships).where(and(eq(s.studyGroupMemberships.groupId,data.groupId),eq(s.studyGroupMemberships.personId,STUDENT),eq(s.studyGroupMemberships.status,"approved"))).limit(1);
 if(!membership)throw new Error("Approved membership required");
 const [post]=await db.insert(s.studyGroupPosts).values({groupId:data.groupId,body,authorPersonId:STUDENT}).returning({id:s.studyGroupPosts.id});return {id:post.id};
});
export const scheduleStudyGroupSession=createServerFn({method:"POST"}).validator((x:{groupId:string;title:string;agenda:string;startsAt:string;endsAt:string})=>x).handler(async({data})=>{
 assertSyntheticMutation("teacher");const {start,end}=validateSession(data.startsAt,data.endsAt);const {db,s}=await context();
 const [group]=await db.select().from(s.studyGroups).where(and(eq(s.studyGroups.id,data.groupId),eq(s.studyGroups.facilitatorPersonId,TEACHER))).limit(1);
 if(!group)throw new Error("Facilitator required");
 if(data.title.trim().length<3||data.title.length>120||data.agenda.length>2000)throw new Error("Invalid session details");
 const [session]=await db.insert(s.studyGroupSessions).values({groupId:data.groupId,title:data.title.trim(),agenda:data.agenda,startsAt:start,endsAt:end}).returning({id:s.studyGroupSessions.id});return session;
});
export const reportStudyGroupPost=createServerFn({method:"POST"}).validator((x:{groupId:string;postId:string;reason:string})=>x).handler(async({data})=>{
 assertSyntheticMutation("student");const {db,s}=await context();
 if(data.reason.trim().length<5||data.reason.length>1000)throw new Error("Please provide a reason");
 const [member]=await db.select().from(s.studyGroupMemberships).where(and(eq(s.studyGroupMemberships.groupId,data.groupId),eq(s.studyGroupMemberships.personId,STUDENT),eq(s.studyGroupMemberships.status,"approved"))).limit(1);
 const [post]=await db.select().from(s.studyGroupPosts).where(and(eq(s.studyGroupPosts.groupId,data.groupId),eq(s.studyGroupPosts.id,data.postId))).limit(1);
 if(!member||!post)throw new Error("Cannot report this content");
 await db.insert(s.studyGroupReports).values({groupId:data.groupId,postId:data.postId,reporterPersonId:STUDENT,reason:data.reason.trim()});return {ok:true};
});

export const listStudyGroupReviewQueue=createServerFn({method:"GET"}).handler(async()=>{
 assertSyntheticMutation("teacher");
 const {db,s}=await context();
 return db.select({groupId:s.studyGroups.id,groupTitle:s.studyGroups.title,personId:s.studyGroupMemberships.personId,personName:s.people.legalFirstName,status:s.studyGroupMemberships.status})
 .from(s.studyGroupMemberships)
 .innerJoin(s.studyGroups,and(eq(s.studyGroupMemberships.groupId,s.studyGroups.id),eq(s.studyGroups.facilitatorPersonId,TEACHER),eq(s.studyGroups.siteId,SITE)))
 .innerJoin(s.people,eq(s.studyGroupMemberships.personId,s.people.id))
 .where(eq(s.studyGroupMemberships.status,"pending")).limit(100);
});
export const listStudyGroupReports=createServerFn({method:"GET"}).handler(async()=>{
 assertSyntheticMutation("teacher");
 const {db,s}=await context();
 return db.select({id:s.studyGroupReports.id,groupId:s.studyGroupReports.groupId,reason:s.studyGroupReports.reason,status:s.studyGroupReports.status,postId:s.studyGroupReports.postId})
 .from(s.studyGroupReports).innerJoin(s.studyGroups,and(eq(s.studyGroupReports.groupId,s.studyGroups.id),eq(s.studyGroups.facilitatorPersonId,TEACHER),eq(s.studyGroups.siteId,SITE)))
 .where(eq(s.studyGroupReports.status,"open")).limit(100);
});
export const resolveStudyGroupReport=createServerFn({method:"POST"}).validator((x:{reportId:string;hidePost:boolean})=>x).handler(async({data})=>{
 assertSyntheticMutation("teacher");const {db,s}=await context();
 return db.transaction(async tx=>{
 const [report]=await tx.select({id:s.studyGroupReports.id,postId:s.studyGroupReports.postId,groupId:s.studyGroupReports.groupId})
 .from(s.studyGroupReports).innerJoin(s.studyGroups,and(eq(s.studyGroups.id,s.studyGroupReports.groupId),eq(s.studyGroups.facilitatorPersonId,TEACHER),eq(s.studyGroups.siteId,SITE)))
 .where(and(eq(s.studyGroupReports.id,data.reportId),eq(s.studyGroupReports.status,"open"))).limit(1);
 if(!report)throw new Error("Open report not found");
 if(data.hidePost&&report.postId)await tx.update(s.studyGroupPosts).set({hidden:true,updatedAt:new Date()}).where(and(eq(s.studyGroupPosts.id,report.postId),eq(s.studyGroupPosts.groupId,report.groupId)));
 await tx.update(s.studyGroupReports).set({status:"resolved"}).where(eq(s.studyGroupReports.id,report.id));
 return {ok:true};
 });
});
