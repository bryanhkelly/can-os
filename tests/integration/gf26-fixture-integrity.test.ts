import {describe,expect,it} from "vitest";
import {eq,and} from "drizzle-orm";
import {db} from "@/db/client";
import {studyGroups,studyGroupMemberships,studyGroupSessions,calendarEvents} from "@/db/schema";

/** GF26 fixture/read-model preflight. Never mutates a database. Execute only on disposable Neon. */
describe("GF26 synthetic schedule and calendar integrity",()=>{
 it("has canonical calendar events for every seeded session and approved demo membership",async()=>{
  if(process.env.APP_ENV!=="test"||process.env.CAN_TEST_DB_WRITES_ENABLED!=="true")throw new Error("Disposable test database required");
  const groups=await db.select({id:studyGroups.id,metadata:studyGroups.metadata}).from(studyGroups);
  const fixtureGroups=groups.filter(g=>g.metadata.synthetic===true&&g.metadata.fixture==="gf26");
  expect(fixtureGroups.length).toBeGreaterThan(0);
  for(const group of fixtureGroups){
   const sessions=await db.select().from(studyGroupSessions).where(eq(studyGroupSessions.groupId,group.id));
   const members=await db.select().from(studyGroupMemberships).where(and(eq(studyGroupMemberships.groupId,group.id),eq(studyGroupMemberships.status,"approved")));
   for(const session of sessions){
    const matches=await db.select().from(calendarEvents).where(and(eq(calendarEvents.sourceType,"study_group_session"),eq(calendarEvents.sourceId,session.id)));
    expect(matches,"Each GF26 session must have exactly one canonical calendar event").toHaveLength(1);
    expect(matches[0]?.startsAt.toISOString()).toBe(session.startsAt.toISOString());
    expect(matches[0]?.endsAt?.toISOString()).toBe(session.endsAt.toISOString());
    expect(matches[0]?.siteId).toBeDefined();
   }
   if(sessions.length)expect(members.length).toBeGreaterThan(0);
  }
 });
});
