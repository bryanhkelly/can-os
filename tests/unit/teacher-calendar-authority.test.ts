import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({
 classes:vi.fn(),authority:vi.fn(),writes:vi.fn(),results:[] as unknown[][],
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
 requireActor:async()=>state.actor,actorSiteIds:()=>[],recordAudit:vi.fn(),
}));
vi.mock("@/modules/learning/class-access.server",()=>({accessibleClasses:state.classes,authorizeClass:state.authority}));
vi.mock("@/modules/calendar/group-calendar-visibility.server",()=>({visibleStudyGroupCalendarEventIds:async()=>[]}));
vi.mock("@/platform/mutation",()=>({emitEvent:vi.fn(),notifyMany:vi.fn()}));
vi.mock("@/db/client",()=>{
 const query=()=>{
  const chain:Record<string,unknown>={};
  for(const name of ["from","innerJoin","where","orderBy","limit","for"])chain[name]=()=>chain;
  chain.then=(resolve:(rows:unknown[])=>unknown)=>Promise.resolve(state.results.shift()??[]).then(resolve);
  return chain;
 };
 const tx={select:query,update:state.writes};
 return {db:{...tx,transaction:async(fn:(tx:unknown)=>unknown)=>fn(tx)}};
});
import {getCalendarMonth,getCalendarRange} from "@/modules/calendar/calendar.functions";
import {reviseCalendarEventForActor} from "@/modules/calendar/calendar-events.server";
beforeEach(()=>{
 vi.clearAllMocks();vi.stubEnv("DATABASE_URL","postgresql://isolated-mock");
 state.classes.mockResolvedValue([{id:"delegated-section"}]);state.results=[];
});
afterEach(()=>vi.unstubAllEnvs());
describe("calendar authority for delegated academic teachers",()=>{
 it("uses the current classroom directory without requiring host Site or Program scope",async()=>{
  const invoke=getCalendarMonth as unknown as (arg:unknown)=>Promise<unknown>;
  await expect(invoke({data:{year:2026,month:10}})).resolves.toMatchObject({connected:true,items:[]});
  expect(state.classes).toHaveBeenCalledWith(state.actor);
 });
 it("does not swallow a current classroom authority read failure",async()=>{
  state.classes.mockRejectedValue(new Error("delegation unavailable"));
  const invoke=getCalendarMonth as unknown as (arg:unknown)=>Promise<unknown>;
  await expect(invoke({data:{year:2026,month:10}})).rejects.toThrow("delegation unavailable");
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
  state.results=[[],Array.from({length:count},(_,index)=>({
   id:`assessment-${index}`,title:`Assignment ${index}`,dueAt:new Date("2026-10-29T12:00:00Z"),
   sectionTitle:"English",sectionId:"delegated-section",
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
