import { beforeEach, describe, expect, it, vi } from "vitest";
import { witnessOnsiteBlockPresence } from "@/modules/operations/onsite-physical-presence.functions";
const state=vi.hoisted(()=>({rows:[] as unknown[][],insert:vi.fn()}));
vi.mock("@tanstack/react-start",()=>({createServerOnlyFn:(fn:unknown)=>fn,
  createServerFn:()=>({parse:(value:unknown)=>value,validator(parse:(value:unknown)=>unknown){this.parse=parse;return this;},
    handler(fn:(value:{data:unknown})=>unknown){return (value:{data:unknown})=>fn({data:this.parse(value.data)});}})}));
vi.mock("@tanstack/react-start/server",()=>({getRequest:()=>new Request("http://localhost"),setResponseHeader:vi.fn()}));
vi.mock("@/modules/identity/command-context.server",()=>({getCommandContext:async()=>({actorPersonId:"director",accountId:"account",sessionId:"session",grantId:"grant",role:"site_leader",
  grantSiteId:"site",capabilities:new Set(["onsite.attendance.record"]),scope:{organizationIds:["church"],siteIds:["site"],programIds:["program"]}})}));
vi.mock("@/modules/operations/onsite-supervision.functions",()=>({getOnsiteSupervisionPlan:async()=>({siteId:"site",projectionTruncated:false,
  blocks:[{sectionId:"00000000-0000-4000-8000-000000000001",periodId:"00000000-0000-4000-8000-000000000002",programId:"program",
    requiresSectionDelegation:true,assignedPlan:true,planToken:"current",startsAtLocal:"09:00",endsAtLocal:"10:00",roomLabel:"Room A"}]}),
  loadOnsiteSupervisionPlanForActor:vi.fn()}));
vi.mock("@/domain/onsite-physical-presence-policy",()=>({inPhysicalCheckInWindow:()=>true}));
vi.mock("@/modules/operations/site-local-delegation.server",()=>({requireCurrentSiteLocalDelegate:vi.fn()}));
vi.mock("@/modules/operations/site-section-facilitators.server",()=>({requireCurrentSectionFacilitator:vi.fn()}));
vi.mock("@/modules/operations/onsite-block-safety.server",()=>({requireCurrentOnsiteAdultSafety:vi.fn()}));
vi.mock("@/modules/operations/school-opening.server",()=>({requireCurrentChurchSchoolOpening:vi.fn()}));
vi.mock("@/modules/operations/section-coverage-verification.server",()=>({verifiedScheduledSectionFacilitators:async()=>new Map(),scheduledBlockHasNamedFacilitator:()=>true}));
vi.mock("@/modules/operations/onsite-block-room-plan.server",()=>({fetchRoomPlanEvidence:async()=>({truncated:false,
  rows:[{metadata:{date:new Date().toISOString().slice(0,10),periodId:"00000000-0000-4000-8000-000000000002"}}]}),
  parseVerifiedRoomPlan:()=>({id:"room-evidence",roomLabel:"Room A",primaryPersonId:"primary",backupPersonId:"backup"})}));
vi.mock("@/platform/mutation",()=>({emitEvent:async()=>"event",writeAudit:vi.fn()}));
vi.mock("@/db/client",()=>{
  const tx={execute:vi.fn(),select:()=>({from(){return this;},where(){return this;},orderBy(){return this;},limit:async()=>state.rows.shift()??[]}),
    insert:()=>({values(value:unknown){state.insert(value);return{returning:async()=>[{id:"witness"}]};}})};
  return{db:{select:()=>({from(){return this;},where(){return this;},limit:async()=>[{id:"site",organizationId:"church",timezone:"UTC"}]}),
    transaction:async(fn:(tx:unknown)=>unknown)=>fn(tx)}};
});
const accepted=(ownerPersonId:string)=>({ownerPersonId,metadata:{response:"accepted"}});
const request=()=>({data:{date:new Date().toISOString().slice(0,10),sectionId:"00000000-0000-4000-8000-000000000001",
  periodId:"00000000-0000-4000-8000-000000000002",witnessedBothAdults:true as const}});
beforeEach(()=>{
  vi.clearAllMocks();state.rows=[[
    {id:"primary-arrival",personId:"primary",createdAt:new Date()},
    {id:"backup-arrival",personId:"backup",createdAt:new Date()},
  ],[],[]];
});
describe("duty acceptance is distinct from physical arrival",()=>{
  it("does not verify coverage from two arrivals without duty acceptance",async()=>{
    await expect(witnessOnsiteBlockPresence(request())).rejects.toThrow("both named adults must accept");
    expect(state.insert).not.toHaveBeenCalled();
  });
  it("does not let primary acceptance cover the backup",async()=>{
    state.rows[1]=[accepted("primary")];
    await expect(witnessOnsiteBlockPresence(request())).rejects.toThrow("both named adults must accept");
    expect(state.insert).not.toHaveBeenCalled();
  });
  it("records the separate director witness after both named duties and arrivals",async()=>{
    state.rows[1]=[accepted("primary"),accepted("backup")];
    expect(await witnessOnsiteBlockPresence(request())).toMatchObject({created:true});
    expect(state.insert).toHaveBeenCalledTimes(1);
  });
});
