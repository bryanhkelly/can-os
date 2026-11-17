import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {and,desc,eq,inArray,isNotNull,lt,or,sql,type SQL} from "drizzle-orm";
import {z} from "zod";
import {db} from "@/db/client";
import * as s from "@/db/schema";
import {AuthorizationError} from "@/domain/command-context";
import {guardianRelationshipPredicate} from "@/domain/guardian-relationship";
import {selectActivityMemberships} from "@/domain/account-activity-grants";
import {
  projectSchoolSections,projectSchoolPrograms,projectFamilyEnrichment,
  projectAcceptedCalendarEvents,
} from "@/domain/participation-projections";
import type {ParticipationRecord} from "@/domain/participation-read-model";
import {getCommandContext} from "@/modules/identity/command-context.server";
import {readSessionGrants} from "@/modules/identity/session-grants.server";

const id=z.string().uuid();
export const accountSchoolSource=z.enum([
  "school_section","school_program","family_enrichment","calendar_event",
]);
const cursorSchema=z.object({
  createdAt:z.string().datetime({offset:true}),
  id,
}).strict();
export type AccountSchoolHistoryCursor=z.infer<typeof cursorSchema>;
const input= z.object({
  source:accountSchoolSource,
  cursor:cursorSchema.nullable().default(null),
}).strict();
const pageSize=40;
const extended=["summer_enrichment","summer_program","after_school_enrichment"] as const;
const cursorText=(column:typeof s.enrollments.createdAt|typeof s.calendarEventParticipants.createdAt|
  typeof s.activityRegistrations.createdAt)=>
  sql<string>`to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const before=(createdAt:typeof s.enrollments.createdAt|typeof s.calendarEventParticipants.createdAt|
  typeof s.activityRegistrations.createdAt,
  sourceId:typeof s.enrollments.id|typeof s.calendarEventParticipants.id|typeof s.activityRegistrations.id,
  cursor:AccountSchoolHistoryCursor|null)=>{
  if(!cursor)return undefined;
  return or(
    sql`${createdAt} < ${cursor.createdAt}::timestamptz`,
    and(sql`${createdAt} = ${cursor.createdAt}::timestamptz`,
      lt(sourceId,cursor.id)),
  );
};

export const getMyAccountSchoolParticipationPage=createServerFn({method:"GET"})
  .validator((raw:unknown)=>input.parse(raw))
  .handler(async({data}):Promise<{
    items:ParticipationRecord[];nextCursor:AccountSchoolHistoryCursor|null;
  }>=>{
    setResponseHeader("Cache-Control","private, no-store");
    setResponseHeader("Referrer-Policy","no-referrer");
    const actor=await getCommandContext(getRequest());
    if(!actor.actorPersonId||!actor.accountId)
      throw new AuthorizationError("verified account Person");
    const [account]=await db.select({
      email:s.accessAccounts.emailNormalized,personId:s.accessAccounts.personId,
    }).from(s.accessAccounts).where(eq(s.accessAccounts.id,actor.accountId)).limit(1);
    if(!account||account.personId!==actor.actorPersonId)
      throw new AuthorizationError("single CAN account Person");
    const {grants}=await readSessionGrants(actor.accountId,account.email);
    // Explicitly match original live grants to this single authenticated
    // Person. Demo delegation cannot ever merge a second Person's history.
    const {student,guardian:guardians}=selectActivityMemberships(
      grants,actor.accountId,actor.actorPersonId,
    );
    // Match each original organization/Site grant separately. A Site-only
    // grant never broadens to sibling sites just because the org matches.
    // Each source Person profile must be matched to the role that actually
    // authorizes that subject. A guardian grant must never broaden the
    // account owner's student profile, or vice versa.
    const scoped=(kind:"student"|"guardian",
      org:typeof s.programs.organizationId|typeof s.sites.organizationId|typeof s.calendarEvents.organizationId,
      site:typeof s.programs.siteId|typeof s.sections.siteId|typeof s.activities.siteId|typeof s.calendarEvents.siteId):SQL|undefined=>{
      const permitted=(kind==="student"?student:guardians).map(g=>
        g.organizationId?
          and(eq(org,g.organizationId),g.siteId?eq(site,g.siteId):undefined):undefined)
        .filter((condition):condition is SQL=>Boolean(condition));
      return permitted.length?or(...permitted):undefined;
    };
    const profileScope=(profiles:Map<string,{name:string|null;kind:"self"|"dependent"}>,
      profileColumn:typeof s.enrollments.studentProfileId|typeof s.activityRegistrations.studentProfileId,
      org:typeof s.programs.organizationId|typeof s.sites.organizationId,
      site:typeof s.programs.siteId|typeof s.sections.siteId|typeof s.activities.siteId):SQL|undefined=>{
      const selfIds=[...profiles].filter(([,p])=>p.kind==="self").map(([id])=>id);
      const childIds=[...profiles].filter(([,p])=>p.kind==="dependent").map(([id])=>id);
      return or(
        selfIds.length?and(inArray(profileColumn,selfIds),scoped("student",org,site)):undefined,
        childIds.length?and(inArray(profileColumn,childIds),scoped("guardian",org,site)):undefined,
      );
    };
    const getProfiles=async(access:"academic"|"enrollment")=>{
      const profiles=new Map<string,{name:string|null;kind:"self"|"dependent"}>();
      if(student.length){
        const ownProfile=await db.select({id:s.studentProfiles.id})
          .from(s.studentProfiles).where(eq(s.studentProfiles.personId,actor.actorPersonId!));
        ownProfile.forEach(row=>profiles.set(row.id,{name:null,kind:"self"}));
      }
      if(guardians.length){
        const children=await db.select({
          id:s.studentProfiles.id,
          firstName:s.people.legalFirstName,lastName:s.people.legalLastName,
        }).from(s.guardianRelationships)
          .innerJoin(s.studentProfiles,
            eq(s.studentProfiles.personId,s.guardianRelationships.studentPersonId))
          .innerJoin(s.people,eq(s.people.id,s.studentProfiles.personId))
          .where(guardianRelationshipPredicate({
            guardianPersonId:actor.actorPersonId!,access,
          }));
        for(const row of children)if(!profiles.has(row.id))
          profiles.set(row.id,{
            kind:"dependent",name:[row.firstName,row.lastName].filter(Boolean).join(" ")||null,
          });
      }
      return profiles;
    };
    const now=new Date();
    const finish=<T extends {id:string;createdAtCursor:string}>(
      rows:readonly T[],project:(rows:readonly T[])=>ParticipationRecord[],
    )=>{
      const page=rows.slice(0,pageSize);
      const last=page[page.length-1];
      return {items:project(page),nextCursor:rows.length>pageSize&&last?
        {createdAt:last.createdAtCursor,id:last.id}:null};
    };

    if(data.source==="school_section"){
      const profiles=await getProfiles("academic");
      if(!profiles.size||!profileScope(profiles,s.enrollments.studentProfileId,s.programs.organizationId,s.sections.siteId))
        return {items:[],nextCursor:null};
      const schoolScope=profileScope(profiles,s.enrollments.studentProfileId,
        s.programs.organizationId,s.sections.siteId);
      const rows=await db.select({
        id:s.enrollments.id,createdAtCursor:cursorText(s.enrollments.createdAt),
        enrollmentId:s.enrollments.id,enrollmentStatus:s.enrollments.status,
        sectionId:s.sections.id,title:s.sections.title,code:s.sections.code,
        studentProfileId:s.enrollments.studentProfileId,
        organizationId:s.programs.organizationId,organizationName:s.organizations.name,
        siteId:s.sections.siteId,siteName:s.sites.name,
        startsAt:s.sections.startsAt,endsAt:s.sections.endsAt,
      }).from(s.enrollments)
        .innerJoin(s.sections,eq(s.sections.id,s.enrollments.sectionId))
        .innerJoin(s.programs,eq(s.programs.id,s.sections.programId))
        .innerJoin(s.organizations,eq(s.organizations.id,s.programs.organizationId))
        .leftJoin(s.sites,eq(s.sites.id,s.sections.siteId))
        .where(and(
          eq(s.enrollments.kind,"section"),
          eq(s.enrollments.programId,s.programs.id),
          inArray(s.enrollments.studentProfileId,[...profiles.keys()]),
          schoolScope,
          before(s.enrollments.createdAt,s.enrollments.id,data.cursor),
        )).orderBy(desc(s.enrollments.createdAt),desc(s.enrollments.id)).limit(pageSize+1);
      // A final grading-period record is authoritative; enrollment.completed
      // is not. Do not expose draft or unverified grades, or infer credit.
      const grades=rows.length?await db.select({
        id:s.sectionGrades.id,sectionId:s.sectionGrades.sectionId,
        studentProfileId:s.sectionGrades.studentProfileId,
        periodName:s.gradingPeriods.name,letterGrade:s.sectionGrades.letterGrade,
      }).from(s.sectionGrades)
        .innerJoin(s.gradingPeriods,
          eq(s.gradingPeriods.id,s.sectionGrades.gradingPeriodId))
        .where(and(
          inArray(s.sectionGrades.sectionId,rows.map(row=>row.sectionId)),
          inArray(s.sectionGrades.studentProfileId,rows.map(row=>row.studentProfileId)),
          eq(s.sectionGrades.status,"finalized"),
          isNotNull(s.sectionGrades.finalizedByPersonId),
          isNotNull(s.sectionGrades.finalizedAt),
        )).orderBy(desc(s.sectionGrades.finalizedAt),
          desc(s.sectionGrades.id)):[];
      const currentGrade=new Map<string,(typeof grades)[number]>();
      for(const grade of grades){
        const key=grade.sectionId+":"+grade.studentProfileId;
        if(!currentGrade.has(key))currentGrade.set(key,grade);
      }
      return finish(rows,items=>projectSchoolSections(items.map(row=>({
        id:row.sectionId,title:row.title,code:row.code,
        enrollmentId:row.enrollmentId,enrollmentStatus:row.enrollmentStatus,
        organizationId:row.organizationId,organizationName:row.organizationName,
        siteId:row.siteId,siteName:row.siteName,
        startsAt:row.startsAt,endsAt:row.endsAt,
        subject:{kind:profiles.get(row.studentProfileId)!.kind,
          displayName:profiles.get(row.studentProfileId)!.name},
        officialOutcome:(()=>{
          const grade=currentGrade.get(row.sectionId+":"+row.studentProfileId);
          return grade?{referenceId:grade.id,
            label:"Finalized "+grade.periodName+" grade: "+(grade.letterGrade??"recorded")}:null;
        })(),
      })),now));
    }
    if(data.source==="school_program"){
      const profiles=await getProfiles("enrollment");
      if(!profiles.size||!profileScope(profiles,s.enrollments.studentProfileId,s.programs.organizationId,s.programs.siteId))
        return {items:[],nextCursor:null};
      const rows=await db.select({
        id:s.enrollments.id,createdAtCursor:cursorText(s.enrollments.createdAt),
        enrollmentId:s.enrollments.id,studentProfileId:s.enrollments.studentProfileId,
        programId:s.programs.id,title:s.programs.name,status:s.enrollments.status,
        organizationId:s.programs.organizationId,organizationName:s.organizations.name,
        siteId:s.programs.siteId,siteName:s.sites.name,
        startsAt:s.enrollments.startedAt,endsAt:s.enrollments.endedAt,
      }).from(s.enrollments)
        .innerJoin(s.programs,eq(s.programs.id,s.enrollments.programId))
        .innerJoin(s.organizations,eq(s.organizations.id,s.programs.organizationId))
        .leftJoin(s.sites,eq(s.sites.id,s.programs.siteId))
        .where(and(
          eq(s.enrollments.kind,"program"),
          inArray(s.enrollments.studentProfileId,[...profiles.keys()]),
          profileScope(profiles,s.enrollments.studentProfileId,
            s.programs.organizationId,s.programs.siteId),
          before(s.enrollments.createdAt,s.enrollments.id,data.cursor),
        )).orderBy(desc(s.enrollments.createdAt),desc(s.enrollments.id)).limit(pageSize+1);
      return finish(rows,items=>projectSchoolPrograms(items.map(row=>({
        ...row,
        subjectName:profiles.get(row.studentProfileId)!.name,
        subjectKind:profiles.get(row.studentProfileId)!.kind,
      })),now));
    }
    if(data.source==="family_enrichment"){
      const profiles=await getProfiles("enrollment");
      if(!profiles.size||!profileScope(profiles,s.activityRegistrations.studentProfileId,s.sites.organizationId,s.activities.siteId))
        return {items:[],nextCursor:null};
      const rows=await db.select({
        id:s.activityRegistrations.id,
        createdAtCursor:cursorText(s.activityRegistrations.createdAt),
        studentProfileId:s.activityRegistrations.studentProfileId,
        seasonId:s.activitySeasons.id,status:s.activityRegistrations.status,
        offeringName:s.activities.name,seasonName:s.activitySeasons.name,
        startsOn:s.activitySeasons.startsOn,endsOn:s.activitySeasons.endsOn,
        organizationId:s.sites.organizationId,siteId:s.activities.siteId,
        siteName:s.sites.name,organizationName:s.organizations.name,
      }).from(s.activityRegistrations)
        .innerJoin(s.activitySeasons,
          eq(s.activitySeasons.id,s.activityRegistrations.activitySeasonId))
        .innerJoin(s.activities,eq(s.activities.id,s.activitySeasons.activityId))
        .innerJoin(s.programs,eq(s.programs.id,s.activities.programId))
        .innerJoin(s.sites,eq(s.sites.id,s.activities.siteId))
        .innerJoin(s.organizations,eq(s.organizations.id,s.sites.organizationId))
        .where(and(
          inArray(s.programs.type,extended),
          inArray(s.activityRegistrations.studentProfileId,[...profiles.keys()]),
          profileScope(profiles,s.activityRegistrations.studentProfileId,
            s.sites.organizationId,s.activities.siteId),
          before(s.activityRegistrations.createdAt,s.activityRegistrations.id,data.cursor),
        )).orderBy(desc(s.activityRegistrations.createdAt),
          desc(s.activityRegistrations.id)).limit(pageSize+1);
      return finish(rows,items=>projectFamilyEnrichment(items.map(row=>({
        ...row,subjectKind:profiles.get(row.studentProfileId)!.kind,
      })),[...profiles.entries()].map(([studentProfileId,subject])=>({
        studentProfileId,name:subject.name,lastName:null,
      })),now));
    }

    // A specific accepted Person invitation is source authority in its own
    // right, including network-wide Events not tied to a Program. Guardian
    // access to someone else's Event must never derive from Site staff roles.
    const eventDependents=guardians.length?await getProfiles("enrollment"):new Map();
    const dependentProfileIds=[...eventDependents]
      .filter(([,profile])=>profile.kind==="dependent").map(([id])=>id);
    const childPeople=dependentProfileIds.length?await db.select({
      personId:s.studentProfiles.personId,
      studentProfileId:s.studentProfiles.id,
    }).from(s.studentProfiles)
      .where(inArray(s.studentProfiles.id,dependentProfileIds)):[];
    const childByPerson=new Map(childPeople.map(row=>[
      row.personId,eventDependents.get(row.studentProfileId)!,
    ]));
    const eventParticipantAccess=or(
      eq(s.calendarEventParticipants.participantId,actor.actorPersonId),
      childPeople.length?and(
        inArray(s.calendarEventParticipants.participantId,
          childPeople.map(row=>row.personId)),
        scoped("guardian",s.calendarEvents.organizationId,s.calendarEvents.siteId),
      ):undefined,
    );
    const rows=await db.select({
      id:s.calendarEventParticipants.id,
      createdAtCursor:cursorText(s.calendarEventParticipants.createdAt),
      participantId:s.calendarEventParticipants.id,
      eventId:s.calendarEvents.id,
      participantPersonId:s.calendarEventParticipants.participantId,
      title:s.calendarEvents.title,startsAt:s.calendarEvents.startsAt,
      endsAt:s.calendarEvents.endsAt,
      organizationId:s.calendarEvents.organizationId,
      siteId:s.calendarEvents.siteId,siteName:s.sites.name,
      programId:s.calendarEvents.programId,
      metadata:s.calendarEvents.metadata,
    }).from(s.calendarEventParticipants)
      .innerJoin(s.calendarEvents,
        eq(s.calendarEvents.id,s.calendarEventParticipants.calendarEventId))
      .leftJoin(s.sites,eq(s.sites.id,s.calendarEvents.siteId))
      .where(and(
        eq(s.calendarEventParticipants.participantType,"person"),
        eventParticipantAccess,
        eq(s.calendarEventParticipants.responseStatus,"accepted"),
        sql`${s.calendarEvents.type} <> 'personal'`,
        before(s.calendarEventParticipants.createdAt,s.calendarEventParticipants.id,data.cursor),
      )).orderBy(desc(s.calendarEventParticipants.createdAt),
        desc(s.calendarEventParticipants.id)).limit(pageSize+1);
    return finish(rows,items=>projectAcceptedCalendarEvents(items.map(({metadata,
      createdAtCursor,id,participantPersonId,...row})=>({
        ...row,cancelled:metadata.cancelled===true,
        subject:participantPersonId===actor.actorPersonId
          ?{kind:"self" as const,displayName:null}
          :{kind:"dependent" as const,
            displayName:childByPerson.get(participantPersonId)?.name??null},
      })),now));
  });
