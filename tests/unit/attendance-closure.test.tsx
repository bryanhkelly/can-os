import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach,describe,expect,it,vi } from "vitest";
import { ObsoleteExcuseClosure } from "@/components/operations/ObsoleteExcuseClosure";
import { closeStaleAttendanceExcuse, listGuardianEffectiveAbsences } from "@/modules/attendance/onsite-attendance-workflow.functions";

const state=vi.hoisted(()=>({
 actor:{role:"registrar",actorPersonId:"registrar",capabilities:new Set(["attendance.excuse.review"]),
  scope:{siteIds:["site"],programIds:["program"],organizationIds:["organization"]}},
 close:vi.fn(),rows:[] as unknown[][],
}));
vi.mock("@/db/client",()=>({db:{select:()=>{
 const rows=state.rows.shift()??[];
 const query:Record<string,unknown>={};
 for(const method of ["from","innerJoin","where"])query[method]=()=>query;
 query.then=(resolve:(value:unknown)=>unknown)=>Promise.resolve(rows).then(resolve);
 return query;
}}}));
vi.mock("@/modules/attendance/attendance-service",()=>({
 closeObsoleteAttendanceExcuse:state.close,recordAttendanceRevision:vi.fn(),
 submitAttendanceExcuse:vi.fn(),reviewAttendanceExcuse:vi.fn(),
}));
vi.mock("@/modules/identity/command-context.server",()=>({getCommandContext:async()=>state.actor}));
vi.mock("@tanstack/react-start/server",()=>({getRequest:()=>new Request("http://localhost"),setResponseHeader:vi.fn()}));
vi.mock("@tanstack/react-start",()=>({
 createServerOnlyFn:(callback:unknown)=>callback,
 createServerFn:()=>({
  parse:(input:unknown)=>input,
  validator(parse:(input:unknown)=>unknown){this.parse=parse;return this;},
  handler(callback:(input:{data:unknown})=>unknown){
   return async(input:{data:unknown})=>callback({data:this.parse(input.data)});
  },
 }),
}));
const input={excuseId:"a1000000-0000-4000-8000-000000000001",
 expectedCurrentEventId:"a1000000-0000-4000-8000-000000000002",
 reason:"The school corrected the earlier attendance mark.",confirmed:true as const};
describe("obsolete attendance excuse closure boundary",()=>{
 beforeEach(()=>{
  vi.clearAllMocks();
  state.actor.role="registrar";
  state.actor.capabilities=new Set(["attendance.excuse.review"]);
  state.close.mockResolvedValue({excuseId:input.excuseId});
 });
 it("loads the verified guardian's absence view without a missing relationship-policy function",async()=>{
  state.actor.role="guardian";
  state.actor.capabilities=new Set(["attendance.excuse.submit"]);
  state.rows=[[{studentPersonId:"student",firstName:"Jordan",lastName:"Learner",preferredName:null}],
    [{id:"profile",personId:"student"}],[]];
  await expect(listGuardianEffectiveAbsences({data:{}})).resolves.toEqual({absences:[]});
  expect(state.rows).toHaveLength(0);
 });
 it("requires a bounded guardian-visible reason and explicit confirmation in the real form",()=>{
  const html=renderToStaticMarkup(<ObsoleteExcuseClosure excuse={{excuseId:input.excuseId,
   currentAttendanceEventId:input.expectedCurrentEventId}} onSaved={async()=>{}}/>);
  expect(html).toContain("current attendance mark and its history stay unchanged");
  expect(html).toContain("visible to the guardian");
  expect(html).toContain('<textarea required="" minLength="10" maxLength="2000"');
  expect(html).toContain('type="checkbox" required=""');
  expect(html).toMatch(/<button disabled="" type="submit"[^>]*>Close obsolete excuse<\/button>/);
 });
 it("passes a validated registrar command to the transactional service",async()=>{
  await expect(closeStaleAttendanceExcuse({data:input})).resolves.toEqual({excuseId:input.excuseId});
  expect(state.close).toHaveBeenCalledWith(state.actor,input);
 });
 it.each([
  {...input,confirmed:false},{...input,reason:"short"},{...input,reason:"x".repeat(2001)},
  {...input,excuseId:"invalid"},{...input,expectedCurrentEventId:"invalid"},{...input,actorPersonId:"injected"},
 ])("rejects malformed or unconfirmed input before delegation: %j",async data=>{
  await expect(closeStaleAttendanceExcuse({data})).rejects.toThrow();
  expect(state.close).not.toHaveBeenCalled();
 });
 it("denies a teacher even with the review capability",async()=>{
  state.actor.role="teacher";
  await expect(closeStaleAttendanceExcuse({data:input})).rejects.toThrow("registrar");
  expect(state.close).not.toHaveBeenCalled();
 });
 it("denies a registrar without the review capability",async()=>{
  state.actor.capabilities=new Set();
  await expect(closeStaleAttendanceExcuse({data:input})).rejects.toThrow();
  expect(state.close).not.toHaveBeenCalled();
 });
});
