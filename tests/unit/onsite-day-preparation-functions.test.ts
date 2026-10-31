import { beforeEach, describe, expect, it, vi } from "vitest";
import { getOnsiteSchoolDayPreparation } from "@/modules/operations/onsite-day-preparation.functions";
const state=vi.hoisted(()=>({role:"site_leader",plan:vi.fn(),roster:vi.fn()}));
vi.mock("@tanstack/react-start",()=>({createServerFn:()=>({parse:(value:unknown)=>value,
  validator(parse:(value:unknown)=>unknown){this.parse=parse;return this;},
  handler(fn:(value:{data:unknown})=>unknown){return(value:{data:unknown})=>fn({data:this.parse(value.data)});}})}));
vi.mock("@tanstack/react-start/server",()=>({getRequest:vi.fn(),setResponseHeader:vi.fn()}));
vi.mock("@/modules/identity/command-context.server",()=>({getCommandContext:async()=>({role:state.role,actorPersonId:"director",
  accountId:"account",sessionId:"session",grantId:"grant",grantSiteId:"site",capabilities:new Set(["onsite.attendance.record"]),
  scope:{organizationIds:["church"],siteIds:["site"],programIds:["authorized","no-current-director-appointment"]}})}));
vi.mock("@/modules/attendance/onsite-attendance-workflow.functions",()=>({loadExpectedSchoolDayPreparation:state.roster}));
vi.mock("@/modules/operations/onsite-supervision.functions",()=>({loadOnsiteSupervisionPlanForActor:state.plan}));
beforeEach(()=>{
  vi.clearAllMocks();state.role="site_leader";
  state.roster.mockResolvedValue({site:{id:"site",timezone:"UTC"},programs:[{id:"authorized"}],students:[{studentName:"Synthetic pupil"}],
    sectionMemberships:[{sectionId:"section",studentName:"Synthetic pupil"}],unplacedStudents:[]});
  state.plan.mockResolvedValue({projectionTruncated:false,blocks:[{sectionId:"section",facilitatorPersonId:"private-primary-id",backupPersonId:"private-backup-id",facilitatorName:"Named primary"}]});
});
describe("director preparation read",()=>{
  it("joins the authorized roster and supervision while preserving Section membership",async()=>{
    const result=await getOnsiteSchoolDayPreparation({data:{date:"2026-11-02"}});
    expect(result.sectionMemberships).toHaveLength(1);
    expect(result.blocks[0]).toEqual({sectionId:"section",facilitatorName:"Named primary"});
    const [scopedActor,input]=state.plan.mock.calls[0]!;
    expect(scopedActor.scope.programIds).toEqual(["authorized"]);
    expect(input).toMatchObject({date:"2026-11-02",siteId:"site",preparation:true});
    expect(JSON.stringify(result)).not.toContain("private-primary-id");
  });
  it.each(["site_staff","room_facilitator"])("denies %s before the preparation roster is loaded",async role=>{
    state.role=role;
    await expect(getOnsiteSchoolDayPreparation({data:{date:"2026-11-02"}})).rejects.toThrow("local director");
    expect(state.roster).not.toHaveBeenCalled();
  });
});
