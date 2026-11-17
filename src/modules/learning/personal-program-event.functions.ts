import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {and,asc,eq,inArray,ne} from "drizzle-orm";
import {db} from "@/db/client";
import * as s from "@/db/schema";
import {AuthorizationError} from "@/domain/command-context";
import {getCommandContext} from "@/modules/identity/command-context.server";
import {getEnrichmentFamily} from "@/modules/activities/enrichment-family.functions";

/**
 * Participation is read from the original academic Program Enrollment and
 * explicitly accepted calendar participant. This does not create or infer
 * a registration, Session attendance, academic grade, or learner grant.
 *
 * A Site/Program favorite and a display role never grant access to a Person.
 * Every read is bounded to the verified active CAN account and scope.
 */
export const getMyProgramEventParticipation=createServerFn({method:"GET"})
  .handler(async()=>{
    setResponseHeader("Cache-Control","private, no-store");
    setResponseHeader("Referrer-Policy","no-referrer");
    const actor=await getCommandContext(getRequest());
    if(!actor.actorPersonId)throw new AuthorizationError("verified CAN Person");
    const allowedProgramIds=actor.scope.programIds??[];

    let childProfiles:{id:string;name:string|null}[]=[];
    if(actor.role==="student"){
      const mine=await db.select({id:s.studentProfiles.id})
        .from(s.studentProfiles)
        .where(eq(s.studentProfiles.personId,actor.actorPersonId));
      childProfiles=mine.map(row=>({id:row.id,name:null}));
    }else if(actor.role==="guardian"){
      // Reuse the independently verified guardian/enrollment relationship.
      const family=await getEnrichmentFamily();
      childProfiles=family.children.map(child=>({
        id:child.studentProfileId,
        name:[child.name,child.lastName].filter(Boolean).join(" ")||null,
      }));
    }

    const profileNameById=new Map(childProfiles.map(item=>[item.id,item.name]));
    const programRows=allowedProgramIds.length&&childProfiles.length
      ?await db.select({
        enrollmentId:s.enrollments.id,
        programId:s.programs.id,
        studentProfileId:s.enrollments.studentProfileId,
        title:s.programs.name,
        status:s.enrollments.status,
        organizationId:s.programs.organizationId,
        organizationName:s.organizations.name,
        siteId:s.programs.siteId,
        siteName:s.sites.name,
        startsAt:s.enrollments.startedAt,
        endsAt:s.enrollments.endedAt,
      }).from(s.enrollments)
        .innerJoin(s.programs,eq(s.programs.id,s.enrollments.programId))
        .innerJoin(s.organizations,eq(s.organizations.id,s.programs.organizationId))
        .leftJoin(s.sites,eq(s.sites.id,s.programs.siteId))
        .where(and(
          eq(s.enrollments.kind,"program"),
          inArray(s.enrollments.studentProfileId,childProfiles.map(item=>item.id)),
          inArray(s.enrollments.programId,allowedProgramIds),
        )).orderBy(asc(s.enrollments.createdAt)).limit(200)
      :[];

    // Exact accepted Person-participation is source authority for the viewer,
    // including Account Holders and network-wide invitations without a Program.
    // An accepted invitation never proves attendance or completion.
    const eventRows=await db.select({
        participantId:s.calendarEventParticipants.id,
        eventId:s.calendarEvents.id,
        title:s.calendarEvents.title,
        startsAt:s.calendarEvents.startsAt,
        endsAt:s.calendarEvents.endsAt,
        organizationId:s.calendarEvents.organizationId,
        siteId:s.calendarEvents.siteId,
        programId:s.calendarEvents.programId,
        metadata:s.calendarEvents.metadata,
      }).from(s.calendarEventParticipants)
        .innerJoin(s.calendarEvents,
          eq(s.calendarEvents.id,s.calendarEventParticipants.calendarEventId))
        .where(and(
          eq(s.calendarEventParticipants.participantType,"person"),
          eq(s.calendarEventParticipants.participantId,actor.actorPersonId),
          eq(s.calendarEventParticipants.responseStatus,"accepted"),
          ne(s.calendarEvents.type,"personal"),
        )).orderBy(asc(s.calendarEvents.startsAt)).limit(200);

    return {
      programs:programRows.map(row=>({
        ...row,subjectName:profileNameById.get(row.studentProfileId)??null,
        subjectKind:actor.role==="guardian"?"dependent" as const:"self" as const,
      })),
      events:eventRows.map(({metadata,...row})=>({
        ...row,cancelled:metadata.cancelled===true,
      })),
    };
  });
