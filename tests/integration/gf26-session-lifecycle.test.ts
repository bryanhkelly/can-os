import {describe,expect,it} from "vitest";
import {and,eq} from "drizzle-orm";
import {db} from "@/db/client";
import {studyGroups,studyGroupMemberships,studyGroupSessions,calendarEvents,notifications} from "@/db/schema";
import {reviseStudyGroupSession} from "@/modules/study-groups/study-groups.functions";

const SESSION="f2600000-0000-4000-8000-000000000010";
const PERSON="f1000000-0000-4000-8000-000000000005";
const START="2026-11-09T18:00:00.000Z";
const END="2026-11-09T19:00:00.000Z";
/** Mutates ONLY a disposable test branch. Recreate branch to rerun; does not clean up fixtures. */
describe("GF26 real Neon session lifecycle",()=>{
 it("reschedules with matching calendar, sends one notice, then cancels and blocks repeat changes",async()=>{
  if(process.env.APP_ENV!=="test"||process.env.CAN_TEST_DB_WRITES_ENABLED!=="true")throw new Error("Disposable test branch required");
  const [session]=await db.select().from(studyGroupSessions).where(eq(studyGroupSessions.id,SESSION)).limit(1);
  expect(session).toBeDefined();
  const [group]=await db.select().from(studyGroups).where(eq(studyGroups.id,session!.groupId)).limit(1);
  expect(group?.metadata.synthetic).toBe(true);
  expect(group?.metadata.fixture).toBe("gf26");
  const [membership]=await db.select().from(studyGroupMemberships).where(and(eq(studyGroupMemberships.groupId,session!.groupId),eq(studyGroupMemberships.personId,PERSON),eq(studyGroupMemberships.status,"approved"))).limit(1);
  expect(membership).toBeDefined();
  const [before]=await db.select().from(calendarEvents).where(and(eq(calendarEvents.sourceType,"study_group_session"),eq(calendarEvents.sourceId,SESSION))).limit(1);
  expect(before?.metadata.cancelled).not.toBe(true);
  expect(session!.startsAt.toISOString()).not.toBe(START);
  const existing=await db.select().from(notifications).where(and(eq(notifications.resourceType,"study_group_session"),eq(notifications.resourceId,SESSION),eq(notifications.recipientPersonId,PERSON)));
  expect(existing.filter(n=>n.type==="study_group_session_rescheduled"||n.type==="study_group_session_cancelled")).toHaveLength(0);

  await reviseStudyGroupSession({data:{sessionId:SESSION,action:"reschedule",startsAt:START,endsAt:END}});
  const [updated]=await db.select().from(studyGroupSessions).where(eq(studyGroupSessions.id,SESSION));
  const [calendar]=await db.select().from(calendarEvents).where(eq(calendarEvents.id,before!.id));
  expect(updated.startsAt.toISOString()).toBe(START);
  expect(updated.endsAt.toISOString()).toBe(END);
  expect(calendar.startsAt.toISOString()).toBe(START);
  expect(calendar.endsAt?.toISOString()).toBe(END);
  const rescheduled=await db.select().from(notifications).where(and(eq(notifications.resourceType,"study_group_session"),eq(notifications.resourceId,SESSION),eq(notifications.recipientPersonId,PERSON),eq(notifications.type,"study_group_session_rescheduled")));
  expect(rescheduled).toHaveLength(1);

  await reviseStudyGroupSession({data:{sessionId:SESSION,action:"reschedule",startsAt:START,endsAt:END}});
  const unchanged=await db.select().from(notifications).where(and(eq(notifications.resourceId,SESSION),eq(notifications.recipientPersonId,PERSON),eq(notifications.type,"study_group_session_rescheduled")));
  expect(unchanged).toHaveLength(1);

  await reviseStudyGroupSession({data:{sessionId:SESSION,action:"cancel"}});
  const [cancelled]=await db.select().from(calendarEvents).where(eq(calendarEvents.id,before!.id));
  expect(cancelled.metadata.cancelled).toBe(true);
  const cancelledNotices=await db.select().from(notifications).where(and(eq(notifications.resourceId,SESSION),eq(notifications.recipientPersonId,PERSON),eq(notifications.type,"study_group_session_cancelled")));
  expect(cancelledNotices).toHaveLength(1);
  await expect(reviseStudyGroupSession({data:{sessionId:SESSION,action:"cancel"}})).rejects.toThrow("Cancelled session cannot be changed");
 });
});
