import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const groupChecks=vi.hoisted(()=>({participatingStudent:vi.fn(),eligibleStudent:vi.fn()}));
const gal=vi.hoisted(()=>({contacts:vi.fn()}));
const state=vi.hoisted(()=>({
 classes:vi.fn(),authority:vi.fn(),facilitatorSections:vi.fn(),writes:vi.fn(),inserts:vi.fn(),results:[] as unknown[][],
 requiredRoles:[] as readonly string[],selectCount:0,
 actor:{actorPersonId:"teacher",role:"teacher",capabilities:new Set(["calendar.event.manage"]),
  scope:{sectionIds:["delegated-section"]}} as Record<string,unknown>,
}));
vi.mock("@tanstack/react-start",()=>({
 createServerFn:()=>({
  validator:(parse:(value:unknown)=>unknown)=>({handler:(fn:(arg:unknown)=>unknown)=>
   async(input:{data:unknown})=>fn({data:parse(input.data)})}),
  handler:(fn:unknown)=>fn,
 }),
}));
vi.mock("@tanstack/react-start/server",()=>({setResponseHeader:vi.fn()}));
vi.mock("@/modules/identity/actors.server",()=>({
 requireActor:async(roles:readonly string[])=>{state.requiredRoles=roles;return state.actor;},
 actorSiteIds:()=>[],recordAudit:vi.fn(),
}));
vi.mock("@/modules/learning/class-access.server",()=>({accessibleClasses:state.classes,authorizeClass:state.authority}));
vi.mock("@/modules/calendar/group-calendar-visibility.server",()=>({visibleStudyGroupCalendarEventIds:async()=>[]}));
vi.mock("@/modules/study-groups/canonical-membership.server",()=>({
 participatingStudent:groupChecks.participatingStudent,eligibleStudent:groupChecks.eligibleStudent,
}));
vi.mock("@/modules/communication/messages.functions",()=>({listAllowedThreadContacts:gal.contacts}));
vi.mock("@/modules/operations/site-section-facilitators.server",()=>({activeFacilitatorSectionIds:state.facilitatorSections}));
vi.mock("@/platform/mutation",()=>({emitEvent:vi.fn(),notifyMany:vi.fn()}));
vi.mock("@/db/client",()=>{
 const query=()=>{
  state.selectCount++;
  const chain:Record<string,unknown>={};
  for(const name of ["from","innerJoin","where","orderBy","limit","for"])chain[name]=()=>chain;
  chain.then=(resolve:(rows:unknown[])=>unknown)=>Promise.resolve(state.results.shift()??[]).then(resolve);
  return chain;
 };
 const tx={select:query,update:state.writes,insert:state.inserts};
 return {db:{...tx,transaction:async(fn:(tx:unknown)=>unknown)=>fn(tx)}};
});
import {createPersonalEvent,getCalendarMonth,getCalendarRange,listCalendarInviteOptions} from "@/modules/calendar/calendar.functions";
import {reviseCalendarEventForActor} from "@/modules/calendar/calendar-events.server";
import {emitEvent,notifyMany} from "@/platform/mutation";
beforeEach(()=>{
 vi.clearAllMocks();vi.stubEnv("DATABASE_URL","postgresql://isolated-mock");
 state.actor={actorPersonId:"teacher",role:"teacher",capabilities:new Set(["calendar.event.manage"]),
  scope:{sectionIds:["delegated-section"]}};
 state.requiredRoles=[];state.selectCount=0;
 groupChecks.participatingStudent.mockReset();
 groupChecks.eligibleStudent.mockReset().mockResolvedValue(undefined);
 gal.contacts.mockReset().mockResolvedValue([]);
 gal.contacts.mockReset().mockResolvedValue([]);
 state.classes.mockResolvedValue([{id:"delegated-section"}]);state.results=[];
});
afterEach(()=>vi.unstubAllEnvs());
function captureEventInsertValues() {
 const insertedValues:unknown[]=[];
 state.inserts.mockImplementation(()=>({values:(values:unknown)=>{
  insertedValues.push(values);
  const index=insertedValues.length;
  return {
   returning:async()=>[{id:index===1?"occurrence":"event"}],
   then:(resolve:(value:unknown)=>unknown)=>Promise.resolve(undefined).then(resolve),
  };
 }}));
 return insertedValues;
}
describe("calendar authority for delegated academic teachers",()=>{
 it("projects only the queried guardian children for each assignment Section",async()=>{
  state.actor={actorPersonId:"guardian",role:"guardian",capabilities:new Set(),
   scope:{siteIds:["site"],programIds:["program"]}};
  state.results=[[
   {sectionId:"english",studentPersonId:"jordan",legalFirstName:"Jordan",legalLastName:"Student",preferredName:null},
   {sectionId:"english",studentPersonId:"casey",legalFirstName:"Casey",legalLastName:"Student",preferredName:null},
   {sectionId:"english",studentPersonId:"jordan",legalFirstName:"Jordan",legalLastName:"Student",preferredName:null},
   {sectionId:"math",studentPersonId:"jordan",legalFirstName:"Jordan",legalLastName:"Student",preferredName:null},
  ],[],[],[
   {id:"essay",title:"Evidence essay",dueAt:new Date("2026-10-29T12:00:00Z"),sectionTitle:"English",sectionId:"english",timezone:"America/New_York"},
   {id:"equations",title:"Equations",dueAt:new Date("2026-10-29T12:00:00Z"),sectionTitle:"Math",sectionId:"math",timezone:"America/Los_Angeles"},
  ]];
  const result=await getCalendarMonth({data:{year:2026,month:10}});
  expect(result.items.find(item=>item.id==="assessment:essay")?.guardianStudents).toEqual([
   {studentPersonId:"jordan",studentName:"Jordan Student"},
   {studentPersonId:"casey",studentName:"Casey Student"},
  ]);
  expect(result.items.find(item=>item.id==="assessment:equations")?.guardianStudents).toEqual([
   {studentPersonId:"jordan",studentName:"Jordan Student"},
  ]);
 });
 it("does not project assignment child bindings when no active academic relationship is returned",async()=>{
  state.actor={actorPersonId:"guardian",role:"guardian",capabilities:new Set(),
   scope:{siteIds:["site"],programIds:["program"]}};
  state.results=[[],[]];
  const result=await getCalendarMonth({data:{year:2026,month:10}});
  expect(result.items).toEqual([]);
  expect(state.selectCount).toBe(4);
 });
 it("uses the current classroom directory without requiring host Site or Program scope",async()=>{
  const invoke=getCalendarMonth as unknown as (arg:unknown)=>Promise<unknown>;
  await expect(invoke({data:{year:2026,month:10}})).resolves.toMatchObject({connected:true,items:[]});
  expect(state.classes).toHaveBeenCalledWith(state.actor);
 });
 it("limits room-facilitator calendar reads to assigned room Sections and site events", async () => {
  state.actor = { actorPersonId: "facilitator", role: "room_facilitator", grantSiteId: "site",
   capabilities: new Set(), scope: { programIds: ["program"] } };
  state.facilitatorSections.mockResolvedValue(["assigned-section"]);
  const invoke = getCalendarRange as unknown as (arg: unknown) => Promise<unknown>;
  await expect(invoke({data:{startsAt:"2026-10-29T00:00:00Z",endsAt:"2026-10-30T00:00:00Z"}}))
   .resolves.toMatchObject({connected:true,items:[],truncated:false});
  expect(state.requiredRoles).toContain("room_facilitator");
  expect(state.facilitatorSections).toHaveBeenCalledWith(expect.anything(), state.actor, "program");
  // participants subqueries, events, class-times projection and the chapel
  // projection, each with its newer-calendar subquery.
  expect(state.selectCount).toBe(7);
 });
 it("projects scheduled class times in the Site timezone and keeps them read-only",async()=>{
  state.results=[[],[
   {sectionId:"delegated-section",sectionTitle:"Algebra I",periodId:"period-1",periodLabel:"Period 1",
    startsAtLocal:"09:00:00",endsAtLocal:"09:50:00",calendarDate:"2026-10-05",timezone:"America/Los_Angeles"},
   {sectionId:"delegated-section",sectionTitle:"Algebra I",periodId:"period-1",periodLabel:"Period 1",
    startsAtLocal:"09:00:00",endsAtLocal:"09:50:00",calendarDate:"2026-11-01",timezone:"America/Los_Angeles"},
  ],[
    {sectionId:"delegated-section",personId:"teacher-person",legalFirstName:"Riley",legalLastName:"Example",preferredName:null},
  ],[]];
  const result=await getCalendarMonth({data:{year:2026,month:10}});
  expect(result.items).toEqual([{
   id:"class:delegated-section:period-1:2026-10-05",title:"Algebra I",type:"class_time",source:"section",
   startsAt:"2026-10-05T16:00:00.000Z",endsAt:"2026-10-05T16:50:00.000Z",timezone:"America/Los_Angeles",
   description:"Period 1",cancelled:false,manageable:false,sectionId:"delegated-section",
  teachers:[{personId:"teacher-person",name:"Riley Example"}],teacherNames:["Riley Example"],
  }]);
  expect(result.truncated).toBe(false);
 });
 it("keeps month-end deadlines on their Site-local dates",async()=>{
  state.results=[[],[],[
   {id:"west",title:"West coast deadline",dueAt:new Date("2026-11-01T06:30:00Z"),
    sectionTitle:"English",sectionId:"delegated-section",timezone:"America/Los_Angeles"},
   {id:"east",title:"East coast deadline",dueAt:new Date("2026-11-01T06:30:00Z"),
    sectionTitle:"English",sectionId:"delegated-section",timezone:"America/New_York"},
  ]];
  const result=await getCalendarMonth({data:{year:2026,month:10}});
  expect(result.items.map(item=>item.id)).toEqual(["assessment:west"]);
  expect(result.items[0]?.timezone).toBe("America/Los_Angeles");
 });
 it("does not swallow a current classroom authority read failure",async()=>{
  state.classes.mockRejectedValue(new Error("delegation unavailable"));
  const invoke=getCalendarMonth as unknown as (arg:unknown)=>Promise<unknown>;
  await expect(invoke({data:{year:2026,month:10}})).rejects.toThrow("delegation unavailable");
 });
 it("rejects personal-event invitees outside the student's eligible groups before writing",async()=>{
  state.actor={actorPersonId:"student",role:"student",capabilities:new Set(["calendar.event.create"]),
   scope:{siteIds:["school"],programIds:["program"]}};
  state.results=[[]];
 await expect(createPersonalEvent({data:{
   title:"Study session",startsAt:"2030-01-15T18:00:00Z",timezone:"UTC",
   inviteePersonIds:["11111111-1111-4111-8111-111111111111"],groupIds:[],
  }})).rejects.toThrow("shared approved study-group membership");
  expect(state.inserts).not.toHaveBeenCalled();
 });
 it("accepts individual event invitees from the role-scoped address list",async()=>{
  state.actor={actorPersonId:"teacher",role:"teacher",capabilities:new Set(["calendar.event.create"]),
   scope:{siteIds:["school"],programIds:["program"]}};
  const guardianId="33333333-3333-4333-8333-333333333333";
  gal.contacts.mockResolvedValue([{personId:guardianId,name:"Rae Guardian",label:"Rae Guardian — guardian"}]);
  const insertedValues=captureEventInsertValues();
  await expect(createPersonalEvent({data:{
   title:"Planning meeting",startsAt:"2030-01-15T18:00:00Z",timezone:"UTC",
  inviteePersonIds:[guardianId],groupIds:[],
  }})).resolves.toEqual({eventId:"event"});
  expect(insertedValues[2]).toEqual(expect.arrayContaining([
  expect.objectContaining({participantId:guardianId,role:"attendee",responseStatus:"none"}),
  ]));
  expect(gal.contacts).toHaveBeenCalledWith(expect.anything(),expect.anything(),state.actor);
 });
 it("lists only other eligible students from approved active groups",async()=>{
  state.actor={actorPersonId:"student",role:"student",capabilities:new Set(["calendar.event.create"]),
   scope:{siteIds:["school"],programIds:["program"]}};
  const group={id:"22222222-2222-4222-8222-222222222222",title:"Science circle",siteId:"school",programId:"program",sectionId:null};
  groupChecks.participatingStudent.mockResolvedValue(group);
  state.results=[
   [group],
   [
    {personId:"student",legalFirstName:"Sam",legalLastName:"Organizer",preferredName:null},
    {personId:"peer",legalFirstName:"Rae",legalLastName:"Member",preferredName:"Ray"},
   ],
  ];
  await expect(listCalendarInviteOptions()).resolves.toEqual({contacts:[],groups:[{
   id:group.id,kind:"study_group",title:group.title,
   members:[{personId:"peer",name:"Ray Member"}],
  }]});
  expect(groupChecks.eligibleStudent).toHaveBeenCalledWith(expect.anything(),"peer",group,["program"]);
 });
 it("creates a personal event with validated group attendees and notifications",async()=>{
  state.actor={actorPersonId:"student",role:"student",capabilities:new Set(["calendar.event.create"]),
   scope:{siteIds:["school"],programIds:["program"]}};
  const group={id:"22222222-2222-4222-8222-222222222222",title:"Science circle",siteId:"school",programId:"program",sectionId:null};
  groupChecks.participatingStudent.mockResolvedValue(group);
  state.results=[
   [group],
   [
    {personId:"student",legalFirstName:"Sam",legalLastName:"Organizer",preferredName:null},
    {personId:"peer",legalFirstName:"Rae",legalLastName:"Member",preferredName:null},
   ],
  ];
  const insertedValues:unknown[]=[];
  state.inserts.mockImplementation(()=>({values:(values:unknown)=>{
   insertedValues.push(values);
   const index=insertedValues.length;
   return {
    returning:async()=>[{id:index===1?"occurrence":"event"}],
    then:(resolve:(value:unknown)=>unknown)=>Promise.resolve(undefined).then(resolve),
   };
  }}));
  await expect(createPersonalEvent({data:{
   title:"Study session",startsAt:"2030-01-15T18:00:00Z",timezone:"UTC",
   inviteePersonIds:[],groupIds:[group.id],
  }})).resolves.toEqual({eventId:"event"});
  expect(insertedValues[2]).toEqual(expect.arrayContaining([
   expect.objectContaining({participantId:"student",role:"owner",responseStatus:"accepted"}),
   expect.objectContaining({participantId:"peer",role:"attendee",responseStatus:"none"}),
  ]));
  expect(notifyMany).toHaveBeenCalledWith(expect.anything(),[
   expect.objectContaining({recipientPersonId:"peer",type:"calendar_event_invitation",resourceId:"event"}),
  ]);
 });
 it.each(["guardian","teacher","registrar","site_admin"] as const)(
  "%s can create an event and invite an authorized contact",async role=>{
   const invitee="33333333-3333-4333-8333-333333333333";
   state.actor={actorPersonId:"organizer",role,capabilities:new Set(["calendar.event.create"]),
    scope:{siteIds:["school"],programIds:["program"]}};
  gal.contacts.mockResolvedValue([
    {personId:invitee,name:"Rae Member",label:"Rae Member — authorized contact"},
   ]);
   if(role==="teacher")state.classes.mockResolvedValue([]);
   else if(role==="guardian"||role==="site_admin")state.results=[[]];
   const insertedValues=captureEventInsertValues();
   await expect(createPersonalEvent({data:{
    title:"Community meeting",startsAt:"2030-01-15T18:00:00Z",timezone:"UTC",
    inviteePersonIds:[invitee],groupIds:[],
   }})).resolves.toEqual({eventId:"event"});
   expect(insertedValues[2]).toEqual(expect.arrayContaining([
    expect.objectContaining({participantId:invitee,role:"attendee"}),
   ]));
   expect(notifyMany).toHaveBeenCalledWith(expect.anything(),[
    expect.objectContaining({recipientPersonId:invitee,type:"calendar_event_invitation"}),
   ]);
  },
 );
 it.each(["2030-01-15T09:00:00", "not-a-date"])("rejects ambiguous revision timestamps before writing: %s",async startsAt=>{
  await expect(reviseCalendarEventForActor(
   state.actor as unknown as Parameters<typeof reviseCalendarEventForActor>[0],
   {action:"reschedule",eventId:"event",startsAt},
  )).rejects.toThrow();
  expect(state.writes).not.toHaveBeenCalled();
 });
 it("links one timezone-aware revision notice per person to the domain event",async()=>{
  state.authority.mockResolvedValue(undefined);
  vi.mocked(emitEvent).mockResolvedValue("domain-event");
  state.writes.mockImplementation(()=>({set:()=>({where:async()=>undefined})}));
  const record={
   event:{id:"event",scheduledOccurrenceId:"occurrence",type:"class",title:"Math class",metadata:{},sourceType:null},
   occurrence:{id:"occurrence",sectionId:"delegated-section",siteId:"host-site",programId:"program",
    startsAt:new Date("2030-01-15T16:00:00Z"),endsAt:null,timezone:"America/Los_Angeles"},
  };
  state.results=[[record],[{participantId:"peer"},{participantId:"peer"},{participantId:"teacher"}]];
  const input={action:"reschedule" as const,eventId:"event",startsAt:"2030-01-15T17:00:00Z"};
  await expect(reviseCalendarEventForActor(
   state.actor as unknown as Parameters<typeof reviseCalendarEventForActor>[0], input,
  )).resolves.toEqual({saved:true});
  expect(notifyMany).toHaveBeenCalledWith(expect.anything(),[
   expect.objectContaining({recipientPersonId:"peer",resourceId:"event",eventId:"domain-event",
    body:expect.stringContaining("America/Los_Angeles")}),
  ]);
  expect(state.writes).toHaveBeenCalledTimes(2);
  vi.mocked(notifyMany).mockClear();
  vi.mocked(emitEvent).mockClear();
  state.results=[[{...record,occurrence:{...record.occurrence,startsAt:new Date(input.startsAt)}}]];
  await reviseCalendarEventForActor(state.actor as unknown as Parameters<typeof reviseCalendarEventForActor>[0], input);
  expect(notifyMany).not.toHaveBeenCalled();
  expect(emitEvent).not.toHaveBeenCalled();
 });
 it("rejects event edits after the exact Section delegation is revoked",async()=>{
  state.results=[[{
   event:{id:"event",type:"class",title:"Math class",metadata:{},sourceType:null},
   occurrence:{id:"occurrence",sectionId:"delegated-section",siteId:"host-site",programId:"program",
    startsAt:new Date("2026-10-30T12:00:00Z"),endsAt:null,timezone:"UTC"},
  }]];
  state.authority.mockRejectedValue(new Error("delegation revoked"));
  await expect(reviseCalendarEventForActor(
   state.actor as unknown as Parameters<typeof reviseCalendarEventForActor>[0],
   {action:"edit",eventId:"event",title:"Updated class"},
  )).rejects.toThrow("delegation revoked");
  expect(state.writes).not.toHaveBeenCalled();
 });
});


describe("bounded calendar range",()=>{
 it.each([200,201])("reports deadline truncation at the actual result boundary (%i rows)",async(count)=>{
  state.results=[[],[],Array.from({length:count},(_,index)=>({
   id:`assessment-${index}`,title:`Assignment ${index}`,dueAt:new Date("2026-10-29T12:00:00Z"),
   sectionTitle:"English",sectionId:"delegated-section",timezone:"America/New_York",
  }))];
  const invoke=getCalendarRange as unknown as (arg:unknown)=>Promise<{truncated:boolean;items:unknown[]}>;
  const result=await invoke({data:{startsAt:"2026-10-29T00:00:00Z",endsAt:"2026-10-30T00:00:00Z"}});
  expect(result.items).toHaveLength(200);
  expect(result.truncated).toBe(count>200);
 });
 it("uses the canonical calendar visibility for a daily read",async()=>{
  const invoke=getCalendarRange as unknown as (arg:unknown)=>Promise<unknown>;
  await expect(invoke({data:{startsAt:"2026-10-29T00:00:00Z",endsAt:"2026-10-30T00:00:00Z"}}))
   .resolves.toMatchObject({connected:true,items:[],truncated:false});
  expect(state.classes).toHaveBeenCalledWith(state.actor);
 });
 it.each([
  ["2026-10-30T00:00:00Z","2026-10-29T00:00:00Z"],
  ["2026-10-29T00:00:00Z","2026-10-29T00:00:00Z"],
  ["2026-10-29T00:00:00Z","2026-11-02T00:00:00Z"],
 ])("rejects invalid or excessive calendar windows",async(startsAt,endsAt)=>{
  const invoke=getCalendarRange as unknown as (arg:unknown)=>Promise<unknown>;
  await expect(invoke({data:{startsAt,endsAt}})).rejects.toThrow("at most three days");
 });
});
