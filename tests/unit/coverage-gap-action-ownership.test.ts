import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessContext } from "@/domain/access-context";
import { assignOperationsAction, resolveOwnedSiteOperationalAction, updateOperationsAction } from "@/modules/operations/action-workspace.functions";
import { emitEvent, notify, writeAudit } from "@/platform/mutation";

const state=vi.hoisted(()=>({actor:undefined as AccessContext|undefined,
  record:{} as Record<string,unknown>,director:"director" as string|null,
  writes:[] as Record<string,unknown>[]}));
vi.mock("@tanstack/react-start",()=>({createServerFn:()=>({
  parse:(value:unknown)=>value,
  validator(parse:(value:unknown)=>unknown){this.parse=parse;return this;},
  handler(fn:(value:{data:unknown})=>unknown){return async(value:{data:unknown})=>fn({data:this.parse(value.data)});},
})}));
vi.mock("@tanstack/react-start/server",()=>({getRequest:()=>new Request("http://localhost")}));
vi.mock("@/modules/identity/command-context.server",()=>({getCommandContext:async()=>state.actor}));
vi.mock("@/modules/operations/site-local-delegation.server",()=>({currentSiteDirectorPersonId:async()=>state.director}));
vi.mock("@/modules/programs/opening-handoff.server",()=>({openingHandoffType:"program_opening_handoff"}));
vi.mock("@/modules/actions/academic-action-policy.server",()=>({assertAcademicActionAuthority:vi.fn(),assertAcademicActionStaff:vi.fn()}));
vi.mock("@/platform/mutation",()=>({emitEvent:vi.fn(),notify:vi.fn(),writeAudit:vi.fn()}));
vi.mock("@/db/client",()=>{
  const tx={execute:vi.fn(),select:()=>({
    from(){return this;},where(){return this;},for(){return this;},limit:async()=>[state.record],
  }),update:()=>({set(value:Record<string,unknown>){state.writes.push(value);return {where:async()=>{}};}})};
  return {db:{transaction:async(fn:(value:typeof tx)=>unknown)=>fn(tx)}};
});
const id="00000000-0000-4000-8000-000000000001";
const resolutionNote="Verified the full block coverage and recorded the investigated exception.";
beforeEach(()=>{
  vi.clearAllMocks();state.writes=[];state.director="director";
  state.actor={actorPersonId:"registrar",accountId:"account",sessionId:"session",grantId:"grant",
    grantSiteId:"site",role:"registrar",capabilities:new Set(["admin.manage"]),
    scope:{organizationIds:["church"],siteIds:["site"],programIds:["program"]}};
  state.record={id,type:"onsite_coverage_gap",siteId:"site",organizationId:"church",programId:"program",
    sectionId:"section",subjectType:"section",subjectId:"section",ownerPersonId:"former-director",
    status:"open",priority:"high",title:"Coverage gap",metadata:{planToken:"current-plan"}};
});
describe("controlled coverage-gap ownership and closure",()=>{
  it("assigns the current eligible director and preserves block identity with audit and notification",async()=>{
    await assignOperationsAction({data:{id,ownerPersonId:"director",priority:"high"}});
    expect(state.writes[0]).toMatchObject({ownerPersonId:"director",metadata:{planToken:"current-plan",ownerEscalation:false}});
    expect(writeAudit).toHaveBeenCalledWith(expect.anything(),state.actor,expect.objectContaining({action:"action.assignment.change"}));
    expect(notify).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({recipientPersonId:"director"}));
  });
  it.each(["arbitrary-adult",null])("denies assigning %s when a current director exists",async ownerPersonId=>{
    await expect(assignOperationsAction({data:{id,ownerPersonId,priority:"high"}})).rejects.toThrow("current eligible site director");
    expect(state.writes).toEqual([]);expect(notify).not.toHaveBeenCalled();
  });
  it("keeps a gap urgently unassigned when no eligible director exists",async()=>{
    state.director=null;
    await assignOperationsAction({data:{id,ownerPersonId:null,priority:"normal"}});
    expect(state.writes[0]).toMatchObject({ownerPersonId:null,priority:"urgent",metadata:{ownerEscalation:true}});
    expect(state.writes[0]).not.toHaveProperty("status");
  });
  it("requires the host registrar's current delegation authority",async()=>{
    state.actor!.scope.organizationIds=["other"];
    await expect(assignOperationsAction({data:{id,ownerPersonId:"director",priority:"high"}})).rejects.toThrow("host registrar");
    expect(state.writes).toEqual([]);
  });
  it("allows the current assigned director to resolve with a factual audited note",async()=>{
    state.actor={...state.actor!,actorPersonId:"director",role:"site_leader"};
    state.record.ownerPersonId="director";
    await resolveOwnedSiteOperationalAction({data:{id,resolutionNote}});
    expect(state.writes[0]).toMatchObject({status:"resolved",resolutionNote});
    expect(writeAudit).toHaveBeenCalledWith(expect.anything(),state.actor,expect.objectContaining({after:{status:"resolved",resolutionNote,ownerResolved:true}}));
    expect(emitEvent).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({eventType:"ActionResolved"}));
  });
  it("denies a former director even when the old Action still names them",async()=>{
    state.actor={...state.actor!,actorPersonId:"former-director",role:"site_leader"};
    await expect(resolveOwnedSiteOperationalAction({data:{id,resolutionNote}})).rejects.toThrow("current eligible site director");
    expect(state.writes).toEqual([]);expect(emitEvent).not.toHaveBeenCalled();
  });
  it("does not let generic registrar resolution bypass the owning workflow",async()=>{
    await expect(updateOperationsAction({data:{id,status:"resolved",resolutionNote}})).rejects.toThrow("site director resolves coverage gaps");
    expect(state.writes).toEqual([]);
  });
});
