import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({
  record:{} as Record<string,unknown>,values:{} as Record<string,unknown>,
  update:vi.fn(),authority:vi.fn(),audit:vi.fn(),event:vi.fn(),
}));
vi.mock("@tanstack/react-start",()=>({
  createServerFn:()=>({validator:()=>({handler:(fn:unknown)=>fn}),handler:(fn:unknown)=>fn}),
}));
vi.mock("@tanstack/react-start/server",()=>({getRequest:()=>({}),setResponseHeader:vi.fn()}));
vi.mock("@/modules/identity/command-context.server",()=>({
  getCommandContext:async()=>({role:"teacher",actorPersonId:"teacher",capabilities:new Set(["assignments:create"]),
    scope:{sectionIds:["section"]}}),
}));
vi.mock("@/modules/learning/class-access.server",()=>({authorizeClass:state.authority,accessibleClasses:vi.fn()}));
vi.mock("@/platform/mutation",()=>({writeAudit:state.audit,emitEvent:state.event,notify:vi.fn()}));
vi.mock("@/db/client",()=>({db:{transaction:async(fn:(tx:unknown)=>unknown)=>fn({
  select:()=>{
    const chain:Record<string,unknown>={};
    for(const name of ["from","innerJoin","where","for","limit"])chain[name]=()=>chain;
    chain.then=(resolve:(rows:unknown[])=>unknown)=>Promise.resolve([state.record]).then(resolve);
    return chain;
  },
  update:state.update,
})}}));
import { manageAssessment } from "@/modules/learning/gradebook.functions";
import { assessmentAvailability } from "@/domain/assessment-availability";
const now=new Date("2026-10-29T12:00:00Z");
beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(now);vi.clearAllMocks();
  state.authority.mockResolvedValue({});
  state.record={id:"assessment",sectionId:"section",status:"closed",
    dueAt:new Date("2026-10-20"),availableAt:new Date("2026-10-01"),closesAt:new Date("2026-10-25")};
  state.values={};
  state.update.mockReturnValue({set:(values:Record<string,unknown>)=>{
    state.values=values;return {where:()=>({returning:async()=>[{id:"assessment"}]})};
  }});
});
afterEach(()=>vi.useRealTimers());
const reopen=()=> (manageAssessment as unknown as (arg:unknown)=>Promise<unknown>)({
  data:{assessmentId:"assessment",action:"reopen"},
});
describe("reopening student work without rewriting its due date",()=>{
  it("saves draft directions without publishing or changing student evidence",async()=>{
    state.record.status="draft";
    await (manageAssessment as unknown as (arg:unknown)=>Promise<unknown>)({data:{
      assessmentId:"assessment",action:"edit_draft",title:"Finished worksheet",instructions:"Upload the completed worksheet.",
    }});
    expect(state.values).toMatchObject({status:"draft",title:"Finished worksheet",instructions:"Upload the completed worksheet."});
    expect(state.values).not.toHaveProperty("dueAt");
    expect(state.event).not.toHaveBeenCalled();
    expect(state.audit).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({action:"assessment.edit_draft"}));
  });
  it.each(["published","closed"])("refuses draft edits after work becomes %s",async(status)=>{
    state.record.status=status;
    await expect((manageAssessment as unknown as (arg:unknown)=>Promise<unknown>)({data:{
      assessmentId:"assessment",action:"edit_draft",title:"Changed instructions",instructions:"New directions",
    }})).rejects.toThrow("cannot be");
    expect(state.update).not.toHaveBeenCalled();
  });
  it("updates release and closure without moving the due date or publishing a draft",async()=>{
    state.record.status="draft";
    state.record.dueAt=new Date("2026-11-02");
    await (manageAssessment as unknown as (arg:unknown)=>Promise<unknown>)({data:{
      assessmentId:"assessment",action:"schedule",availableAt:"2026-11-01T00:00:00Z",closesAt:"2026-11-03T00:00:00Z",
    }});
    expect(state.values).toMatchObject({status:"draft",availableAt:new Date("2026-11-01"),closesAt:new Date("2026-11-03")});
    expect(state.values).not.toHaveProperty("dueAt");
    expect(state.audit).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({action:"assessment.schedule"}));
  });
  it("rejects a deadline moved beyond closure before writing",async()=>{
    state.record.status="published";
    await expect((manageAssessment as unknown as (arg:unknown)=>Promise<unknown>)({data:{
      assessmentId:"assessment",action:"reschedule",dueAt:"2026-11-02T00:00:00Z",
    }})).rejects.toThrow("Close must be on or after");
    expect(state.update).not.toHaveBeenCalled();
  });
  it("preserves an overdue deadline, clears closure and audits the original dates",async()=>{
    await expect(reopen()).resolves.toMatchObject({status:"published"});
    expect(state.values).not.toHaveProperty("dueAt");
    expect(state.values).toMatchObject({status:"published",closesAt:null,availableAt:state.record.availableAt});
    expect(assessmentAvailability({...state.record,...state.values} as Parameters<typeof assessmentAvailability>[0],now).actionable).toBe(true);
    expect(state.audit).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({
      before:expect.objectContaining({dueAt:"2026-10-20T00:00:00.000Z",closesAt:"2026-10-25T00:00:00.000Z"}),
      after:expect.objectContaining({dueAt:"2026-10-20T00:00:00.000Z",closesAt:null}),
    }));
    expect(state.event).not.toHaveBeenCalled();
  });
  it("makes explicitly reopened scheduled work available immediately",async()=>{
    state.record.availableAt=new Date("2026-11-01");
    await reopen();
    expect(state.values.availableAt).toEqual(now);
  });
  it("supports an undated assignment without inventing a due date",async()=>{
    state.record.dueAt=null;
    await reopen();
    expect(state.values).not.toHaveProperty("dueAt");
  });
  it("does not bypass revoked Section authority",async()=>{
    state.authority.mockRejectedValue(new Error("delegation revoked"));
    await expect(reopen()).rejects.toThrow("delegation revoked");
    expect(state.update).not.toHaveBeenCalled();
  });
});
