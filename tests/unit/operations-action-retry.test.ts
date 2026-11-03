import { beforeEach, describe, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({
 actor:undefined as any,record:undefined as any,update:vi.fn(),audit:vi.fn(),event:vi.fn(),notify:vi.fn(),
}));
vi.mock("@tanstack/react-start",()=>({createServerFn:()=>({
 validator(){return this;},handler(fn:any){return fn;},
})}));
vi.mock("@tanstack/react-start/server",()=>({getRequest:()=>new Request("http://localhost")}));
vi.mock("@/modules/identity/command-context.server",()=>({getCommandContext:async()=>state.actor}));
vi.mock("@/platform/mutation",()=>({writeAudit:state.audit,emitEvent:state.event,notify:state.notify}));
vi.mock("@/db/client",()=>({db:{transaction:async(fn:any)=>fn({
 select:()=>({from(){return this;},where(){return this;},for(){return this;},limit:async()=>[state.record]}),
 update:state.update,
})}}));
import { assignOperationsAction, updateOperationsAction } from "@/modules/operations/action-workspace.functions";
beforeEach(()=>{
 vi.clearAllMocks();
 state.actor={role:"registrar",actorPersonId:"operator",scope:{siteIds:["site"],programIds:["program"]}};
 state.record={id:"action",type:"site_operational_follow_up",subjectType:"site",sectionId:null,
  siteId:"site",programId:"program",status:"resolved",resolutionNote:"The reviewed answer.",metadata:{}};
});
describe("closed school Action resolution retries",()=>{
 it("accepts an identical trimmed answer without rewriting evidence",async()=>{
  await expect(updateOperationsAction({data:{id:"action",status:"resolved",
   resolutionNote:" The reviewed answer. "}})).resolves.toEqual({saved:true});
  expect(state.update).not.toHaveBeenCalled();expect(state.audit).not.toHaveBeenCalled();
  expect(state.event).not.toHaveBeenCalled();expect(state.notify).not.toHaveBeenCalled();
 });
 it("rejects a changed answer",async()=>{
  await expect(updateOperationsAction({data:{id:"action",status:"resolved",
   resolutionNote:"A different answer."}})).rejects.toThrow("Action is closed");
 });
 it("does not reopen a resolved Action",async()=>{
  await expect(updateOperationsAction({data:{id:"action",status:"in_progress"}})).rejects.toThrow("Action is closed");
 });
 it("rechecks current Program scope before accepting the retry",async()=>{
  state.actor.scope.programIds=[];
  await expect(updateOperationsAction({data:{id:"action",status:"resolved",
   resolutionNote:"The reviewed answer."}})).rejects.toThrow("action program scope");
 });
 it("does not turn a cancelled Action into a successful resolution",async()=>{
  state.record.status="cancelled";
  await expect(updateOperationsAction({data:{id:"action",status:"resolved",
   resolutionNote:"The reviewed answer."}})).rejects.toThrow("Action is closed");
 });
 it("keeps domain-owned referrals on their own lifecycle",async()=>{
  state.record.type="support_referral";
  await expect(updateOperationsAction({data:{id:"action",status:"resolved",
   resolutionNote:"The reviewed answer."}})).rejects.toThrow("referral lifecycle");
 });
 it.each(["in_progress","waiting","resolved"] as const)("keeps class requests out of generic %s transitions",async status=>{
   state.record.type="section_creation_request";
   state.record.status="open";
   await expect(updateOperationsAction({data:{id:"action",status,
    resolutionNote:"Reviewed without provisioning."}})).rejects.toThrow("Use academic setup");
   expect(state.update).not.toHaveBeenCalled();expect(state.audit).not.toHaveBeenCalled();
   expect(state.event).not.toHaveBeenCalled();
 });
 it("preserves the original teacher requester instead of reassigning the request",async()=>{
   state.record.type="section_creation_request";
   state.record.status="open";
   await expect(assignOperationsAction({data:{id:"action",ownerPersonId:"operator",
    priority:"normal"}})).rejects.toThrow("retain their original requester");
   expect(state.update).not.toHaveBeenCalled();expect(state.audit).not.toHaveBeenCalled();
   expect(state.notify).not.toHaveBeenCalled();
 });
});
