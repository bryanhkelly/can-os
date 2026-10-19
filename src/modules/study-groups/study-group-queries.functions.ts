import {createServerFn} from "@tanstack/react-start";
import {getRequest} from "@tanstack/react-start/server";
import {getCommandContext} from "@/modules/identity/command-context.server";
import {AuthorizationError} from "@/domain/command-context";
import{and,eq,desc,inArray,sql,isNull,or} from "drizzle-orm";
import{z} from "zod";
import {canAccessGroup} from "@/domain/study-groups";
import {eligibleStudent} from "./canonical-membership.server";
async function groupActor(role:"student"|"teacher"){
 const actor=await getCommandContext(getRequest());
 const sites=actor.scope.siteIds??[];
 if(actor.role!==role||!actor.actorPersonId||sites.length===0)throw new AuthorizationError("study group "+role+" site access");
 return {...actor,sites};
}
async function context(){const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);return {db,s};}

/** Sites and programs in which this teacher actually has an active class assignment. */
export const listFacilitatorGroupScopes=createServerFn({method:"GET"}).handler(async()=>{
 const actor=await groupActor("teacher");
 const {db,s}=await context();
 const rows=await db.selectDistinct({siteId:s.sections.siteId,programId:s.sections.programId,
  siteName:s.sites.name,programName:s.programs.name})
  .from(s.sectionTeachers)
  .innerJoin(s.sections,eq(s.sections.id,s.sectionTeachers.sectionId))
  .innerJoin(s.programs,eq(s.programs.id,s.sections.programId))
  .innerJoin(s.sites,eq(s.sites.id,s.sections.siteId))
  .where(and(eq(s.sectionTeachers.personId,actor.actorPersonId!),
    eq(s.sections.active,true),
    inArray(s.sections.siteId,actor.sites),
    inArray(s.sections.programId,actor.scope.programIds??[])));
 return rows;
});

export const listStudyGroups=createServerFn({method:"GET"}).handler(async()=>{
 const actor=await groupActor("student");
 const {db,s}=await context();
 const enrolled=await db.selectDistinct({
  siteId:s.programs.siteId,programId:s.programs.id
 }).from(s.enrollments)
 .innerJoin(s.studentProfiles,eq(s.studentProfiles.id,s.enrollments.studentProfileId))
 .innerJoin(s.programs,eq(s.programs.id,s.enrollments.programId))
 .where(and(eq(s.studentProfiles.personId,actor.actorPersonId!),
  eq(s.enrollments.status,"active"),
  eq(s.enrollments.kind,"program"),
  inArray(s.programs.siteId,actor.sites),
  inArray(s.programs.id,actor.scope.programIds??[])));
 if(!enrolled.length)return [];
 const rows=await db.select({
  id:s.studyGroups.id,title:s.studyGroups.title,
  description:s.studyGroups.description,kind:s.studyGroups.kind,
  capacity:s.studyGroups.maxMembers,requiresApproval:s.studyGroups.requiresApproval,
  facilitator:s.studyGroups.facilitatorPersonId,status:s.studyGroups.status,
  siteId:s.studyGroups.siteId,programId:s.studyGroups.programId,
  sectionId:s.studyGroups.sectionId,
  membership:s.studyGroupMemberships.status
 }).from(s.studyGroups)
 .leftJoin(s.studyGroupMemberships,and(eq(s.studyGroupMemberships.groupId,s.studyGroups.id),eq(s.studyGroupMemberships.personId,actor.actorPersonId!)))
 .where(and(eq(s.studyGroups.status,"active"),inArray(s.studyGroups.siteId,actor.sites),
  or(isNull(s.studyGroups.programId),inArray(s.studyGroups.programId,actor.scope.programIds??[]))))
 .orderBy(desc(s.studyGroups.createdAt)).limit(100);
 const sections=await db.select({id:s.sections.id}).from(s.enrollments)
  .innerJoin(s.studentProfiles,eq(s.studentProfiles.id,s.enrollments.studentProfileId))
  .innerJoin(s.sections,eq(s.sections.id,s.enrollments.sectionId))
  .where(and(eq(s.studentProfiles.personId,actor.actorPersonId!),eq(s.enrollments.kind,"section"),
   eq(s.enrollments.status,"active"),eq(s.sections.active,true),inArray(s.sections.siteId,actor.sites),
   inArray(s.sections.programId,actor.scope.programIds??[])));
 return rows.filter(group=>enrolled.some(row=>row.siteId===group.siteId&&
  (!group.programId||row.programId===group.programId))&&(!group.sectionId||sections.some(section=>section.id===group.sectionId)));
});
export const getStudyGroupDetail=createServerFn({method:"GET"}).validator(z.object({groupId:z.string().min(1)}).parse).handler(async({data})=>{
 const actor=await groupActor("student");
 const {db,s}=await context();
 const [group]=await db.select({id:s.studyGroups.id,title:s.studyGroups.title,description:s.studyGroups.description,kind:s.studyGroups.kind,status:s.studyGroups.status,siteId:s.studyGroups.siteId,programId:s.studyGroups.programId,sectionId:s.studyGroups.sectionId,facilitatorPersonId:s.studyGroups.facilitatorPersonId,maxMembers:s.studyGroups.maxMembers,requiresApproval:s.studyGroups.requiresApproval,createdAt:s.studyGroups.createdAt}).from(s.studyGroups).where(and(eq(s.studyGroups.id,data.groupId),inArray(s.studyGroups.siteId,actor.sites),or(isNull(s.studyGroups.programId),inArray(s.studyGroups.programId,actor.scope.programIds??[])))).limit(1);
 if(!group||group.status!=="active")throw new AuthorizationError("active study group required");
 await eligibleStudent(db,actor.actorPersonId!,group,actor.scope.programIds??[]);
 const [membership]=await db.select().from(s.studyGroupMemberships).where(and(eq(s.studyGroupMemberships.groupId,data.groupId),eq(s.studyGroupMemberships.personId,actor.actorPersonId!))).limit(1);
 const permitted=canAccessGroup((membership?.status??null) as "pending"|"approved"|"declined"|"left"|null,"student");
 if(!permitted)return {group,memberStatus:membership?.status??null,posts:[],sessions:[]};
 const [posts,sessions]=await Promise.all([
 db.select({id:s.studyGroupPosts.id,body:s.studyGroupPosts.body,createdAt:s.studyGroupPosts.createdAt,parentPostId:s.studyGroupPosts.parentPostId}).from(s.studyGroupPosts).where(and(eq(s.studyGroupPosts.groupId,data.groupId),eq(s.studyGroupPosts.hidden,false))).orderBy(desc(s.studyGroupPosts.createdAt)).limit(100),
 db.select({id:s.studyGroupSessions.id,title:s.studyGroupSessions.title,agenda:s.studyGroupSessions.agenda,startsAt:s.studyGroupSessions.startsAt,endsAt:s.studyGroupSessions.endsAt,cancelled:sql<boolean>`coalesce(${s.calendarEvents.metadata}->>'cancelled','false') = 'true'`}).from(s.studyGroupSessions).leftJoin(s.calendarEvents,and(eq(s.calendarEvents.sourceType,"study_group_session"),eq(s.calendarEvents.sourceId,s.studyGroupSessions.id))).where(eq(s.studyGroupSessions.groupId,data.groupId)).orderBy(s.studyGroupSessions.startsAt).limit(50)]);
 return {group,memberStatus:membership?.status??null,posts,sessions};
});

export const listStudyGroupReviewQueue=createServerFn({method:"GET"}).handler(async()=>{const actor=await groupActor("teacher");
 const {db,s}=await context();
 return db.select({groupId:s.studyGroups.id,groupTitle:s.studyGroups.title,personId:s.studyGroupMemberships.personId,personName:s.people.legalFirstName,status:s.studyGroupMemberships.status})
 .from(s.studyGroupMemberships)
 .innerJoin(s.studyGroups,and(eq(s.studyGroupMemberships.groupId,s.studyGroups.id),eq(s.studyGroups.facilitatorPersonId,actor.actorPersonId!),inArray(s.studyGroups.siteId,actor.sites),or(isNull(s.studyGroups.programId),inArray(s.studyGroups.programId,actor.scope.programIds??[]))))
 .innerJoin(s.people,eq(s.studyGroupMemberships.personId,s.people.id))
 .where(eq(s.studyGroupMemberships.status,"pending")).limit(100);
});
export const listStudyGroupReports=createServerFn({method:"GET"}).handler(async()=>{const actor=await groupActor("teacher");
 const {db,s}=await context();
 return db.select({
  id:s.studyGroupReports.id,groupId:s.studyGroupReports.groupId,
  groupTitle:s.studyGroups.title,
  reason:s.studyGroupReports.reason,status:s.studyGroupReports.status,
  postId:s.studyGroupReports.postId,postBody:s.studyGroupPosts.body,
  postHidden:s.studyGroupPosts.hidden
 }).from(s.studyGroupReports)
 .innerJoin(s.studyGroups,and(eq(s.studyGroupReports.groupId,s.studyGroups.id),
   eq(s.studyGroups.facilitatorPersonId,actor.actorPersonId!),
   inArray(s.studyGroups.siteId,actor.sites),
   or(isNull(s.studyGroups.programId),inArray(s.studyGroups.programId,actor.scope.programIds??[]))))
 .leftJoin(s.studyGroupPosts,and(eq(s.studyGroupPosts.id,s.studyGroupReports.postId),
   eq(s.studyGroupPosts.groupId,s.studyGroups.id)))
 .where(eq(s.studyGroupReports.status,"open"))
 .orderBy(desc(s.studyGroupReports.createdAt)).limit(100);
});
