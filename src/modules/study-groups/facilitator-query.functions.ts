import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {getCommandContext} from "@/modules/identity/command-context.server";
import {AuthorizationError} from "@/domain/command-context";
import {and,eq,desc,inArray,isNull,or} from "drizzle-orm";

/** Facilitator-owned groups and sessions; separate from the student membership read model. */
export const getFacilitatorStudyGroups=createServerFn({method:"GET"}).handler(async()=>{
 const actor=await getCommandContext(getRequest());
 setResponseHeader("Cache-Control","private, no-store");
 if(actor.role!=="teacher"||!actor.actorPersonId||!actor.scope.siteIds?.length)throw new AuthorizationError("facilitator group access");
 const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
 const groups=await db.select({id:s.studyGroups.id,title:s.studyGroups.title,status:s.studyGroups.status,siteId:s.studyGroups.siteId,programId:s.studyGroups.programId})
  .from(s.studyGroups).where(and(eq(s.studyGroups.facilitatorPersonId,actor.actorPersonId),eq(s.studyGroups.status,"active")))
  .orderBy(desc(s.studyGroups.createdAt)).limit(100);
 const permitted=groups.filter(g=>g.siteId&&actor.scope.siteIds?.includes(g.siteId)&&(!g.programId||actor.scope.programIds?.includes(g.programId)));
 if(!permitted.length)return [];
 const sessions=await db.select({id:s.studyGroupSessions.id,groupId:s.studyGroupSessions.groupId,title:s.studyGroupSessions.title,startsAt:s.studyGroupSessions.startsAt,endsAt:s.studyGroupSessions.endsAt,metadata:s.calendarEvents.metadata})
  .from(s.studyGroupSessions).leftJoin(s.calendarEvents,and(eq(s.calendarEvents.sourceType,"study_group_session"),eq(s.calendarEvents.sourceId,s.studyGroupSessions.id)))
  .where(and(inArray(s.studyGroupSessions.groupId,permitted.map(g=>g.id)))).limit(100);
 return permitted.map(group=>({id:group.id,title:group.title,sessions:sessions.filter(session=>session.groupId===group.id).map(session=>({id:session.id,title:session.title,startsAt:session.startsAt.toISOString(),endsAt:session.endsAt.toISOString(),cancelled:session.metadata?.cancelled===true}))}));
});
