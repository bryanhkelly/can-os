import { beforeEach, describe, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({
  authority:vi.fn(),audit:vi.fn(),event:vi.fn(),notify:vi.fn(),
}));
vi.mock("@/db/client",()=>({db:{}}));
vi.mock("@/modules/actions/academic-action-policy.server",()=>({
  assertAcademicActionAuthority:state.authority,
}));
vi.mock("@/platform/mutation",()=>({
  writeAudit:state.audit,emitEvent:state.event,notify:state.notify,
}));
import { resolveActionInTransaction } from "@/modules/actions/resolve-action";
import type { CommandContext } from "@/domain/command-context";
const actor={actorPersonId:"teacher",capabilities:new Set(["action.resolve"]),scope:{}} as CommandContext;
const action={
  id:"action",type:"guardian_grade_follow_up",status:"open",subjectType:"student_profile",
  subjectId:"student",sectionId:"section",siteId:"site",programId:"program",organizationId:"organization",
  metadata:{submissionId:"submission",requestedByGuardianPersonId:"guardian"},
  resolutionNote:null as string|null,
};
function transaction(current:unknown=action,hasSubmission=true,related=true){
  const rows=[[current],hasSubmission?[{studentPersonId:"person"}]:[],related?[{id:"relationship"}]:[]];
  const update=vi.fn(()=>({set:()=>({where:async()=>{}})}));
  return {update,select:()=>{
    const chain:Record<string,unknown>={};
    const result=rows.shift()??[];
    for(const method of ["from","innerJoin","where","for","limit"])chain[method]=()=>chain;
    chain.then=(resolve:(rows:unknown[])=>unknown)=>Promise.resolve(result).then(resolve);
    return chain;
  }};
}
const resolve=async(tx:ReturnType<typeof transaction>,note="We reviewed the rubric together.")=>
  resolveActionInTransaction(tx as unknown as Parameters<typeof resolveActionInTransaction>[0],
    actor,{actionId:"action",resolutionNote:note});
beforeEach(()=>{
  vi.clearAllMocks();
  state.authority.mockResolvedValue(undefined);
});
describe("canonical guardian grade Action resolution",()=>{
  it("resolves the exact Action and notifies with its Action ID",async()=>{
    const tx=transaction();
    await resolve(tx);
    expect(state.authority).toHaveBeenCalledWith(tx,actor,action);
    expect(tx.update).toHaveBeenCalledOnce();
    expect(state.event).toHaveBeenCalledWith(tx,expect.objectContaining({aggregateId:"action"}));
    expect(state.notify).toHaveBeenCalledWith(tx,expect.objectContaining({
      recipientPersonId:"guardian",resourceType:"action",resourceId:"action",
    }));
    expect(state.audit).toHaveBeenCalledOnce();
  });
  it("suppresses disclosure after the guardian relationship is revoked",async()=>{
    const tx=transaction(action,true,false);
    await resolve(tx);
    expect(tx.update).toHaveBeenCalledOnce();
    expect(state.notify).not.toHaveBeenCalled();
  });
  it("does not close an unrelated Action type",async()=>{
    const tx=transaction({...action,type:"pickup_follow_up"});
    await expect(resolve(tx)).rejects.toThrow("owning domain lifecycle");
    expect(tx.update).not.toHaveBeenCalled();
  });
  it("rejects an Action whose submission does not match released student work",async()=>{
    const tx=transaction(action,false);
    await expect(resolve(tx)).rejects.toThrow("does not match released");
    expect(tx.update).not.toHaveBeenCalled();
  });
  it("rechecks current staff authority before resolution",async()=>{
    state.authority.mockRejectedValue(new Error("Section delegation revoked"));
    const tx=transaction();
    await expect(resolve(tx)).rejects.toThrow("delegation revoked");
    expect(tx.update).not.toHaveBeenCalled();
  });
  it("makes identical retries harmless and preserves the recorded answer",async()=>{
    const tx=transaction({...action,status:"resolved",resolutionNote:"Recorded answer"});
    await resolve(tx,"Recorded answer");
    expect(tx.update).not.toHaveBeenCalled();
    expect(state.notify).not.toHaveBeenCalled();
    await expect(resolve(transaction({...action,status:"resolved",resolutionNote:"Recorded answer"}),"New answer"))
      .rejects.toThrow("cannot be overwritten");
  });
});
