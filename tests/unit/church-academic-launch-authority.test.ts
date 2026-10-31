import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthorizationError, type CommandContext } from "@/domain/command-context";

const state=vi.hoisted(()=>({
  authority:vi.fn(),evaluate:vi.fn(),staffingContext:vi.fn(),requireActor:vi.fn(),
  audit:vi.fn(),event:vi.fn(),notify:vi.fn(),lockSite:vi.fn(),assertCourse:vi.fn(),
  dbRows:[] as unknown[][],txRows:[] as unknown[][],insertRows:[] as unknown[][],
  tx:null as any,
}));

function selectChain(rows:unknown[][]):any{
  return {
    from(){return this;},innerJoin(){return this;},leftJoin(){return this;},
    where(){return this;},for(){return this;},orderBy(){return this;},
    limit(){return Promise.resolve(rows.shift()??[]);},
  };
}
function insertChain(rows:unknown[][]):any{
  return {values(){
    const result={returning:()=>Promise.resolve(rows.shift()??[])};
    return {...result,onConflictDoNothing:()=>result};
  }};
}

vi.mock("@tanstack/react-start",()=>({createServerFn:()=>({
  validator(){return this;},handler(callback:unknown){return callback;},
})}));
vi.mock("@/db/client",()=>({db:{
  select:()=>selectChain(state.dbRows),
  transaction:(callback:(tx:unknown)=>unknown)=>callback(state.tx),
}}));
vi.mock("@/domain/attendance-configuration-lock",()=>({lockAttendanceConfigurationAtSite:state.lockSite}));
vi.mock("@/platform/mutation",()=>({writeAudit:state.audit,emitEvent:state.event,notify:state.notify}));
vi.mock("@/modules/programs/program-site-authorization.server",()=>({
  requireChurchHostedOperatingServices:state.authority,
}));
vi.mock("@/modules/staffing/teaching-eligibility.server",()=>({
  teachingStaffingContext:state.staffingContext,
  evaluateTeachingEligibility:state.evaluate,
  teachingRolePredicate:vi.fn(),
}));
vi.mock("@/modules/staffing/instructional-coverage.server",()=>({evaluateInstructionalCoverage:vi.fn()}));
vi.mock("@/modules/identity/actors.server",()=>({requireActor:state.requireActor}));
vi.mock("@/modules/programs/launch-curriculum-eligibility.server",()=>({
  assertLaunchEligibleCourse:state.assertCourse,listLaunchEligibleCourses:vi.fn(),
}));
vi.mock("@/modules/programs/section-readiness-service",()=>({evaluateSectionReadiness:vi.fn()}));
vi.mock("@/modules/profiles/qualification-catalog.server",()=>({canAuthorQualificationCatalog:vi.fn()}));
vi.mock("@/modules/identity/institutional-capability.server",()=>({hasInstitutionalProgramCapability:vi.fn()}));
vi.mock("@/modules/programs/teacher-policy.server",()=>({
  listLaunchTeacherPolicies:vi.fn(),teacherPolicyPublisherCapability:"teacher.policy.publish",
}));

import { assignLaunchInstructor } from "@/modules/staffing/launch-staffing.server";
import { provisionLaunchSection, setLaunchSectionCredits } from "@/modules/programs/launch-academics.functions";

const actor={
  actorPersonId:"host-registrar",role:"registrar",capabilities:new Set(["program.launch.start"]),
  scope:{organizationIds:["church"],siteIds:["site"],programIds:["program"]},
} as unknown as CommandContext;
const section={
  id:"section",programId:"program",siteId:"site",active:true,
  organizationId:"church",providerId:"can",
  deliveryModel:{onsite:true,asynchronous:false,liveOnline:false},
  window:{from:new Date("2030-01-01T00:00:00Z"),through:new Date("2030-06-01T00:00:00Z")},
};
const program={
  id:"program",name:"Church academy",status:"launching",siteId:"site",
  organizationId:"church",academicProviderOrganizationId:"can",deliveryModel:{onsite:true},
};
const input={programId:"program",sectionId:"section",teacherPersonId:"can-teacher"};

beforeEach(()=>{
  vi.clearAllMocks();
  state.dbRows=[];state.txRows=[];state.insertRows=[];
  state.tx={
    select:()=>selectChain(state.txRows),
    insert:()=>insertChain(state.insertRows),
    update:vi.fn(()=>({set:()=>({where:vi.fn(()=>Promise.resolve())})})),
  };
  state.staffingContext.mockResolvedValue(section);
  state.evaluate.mockResolvedValue({
    eligible:true,roleAssignmentId:"role",policyRuleIds:["policy"],
    claimIds:["claim"],verificationEventIds:["verification"],
  });
  state.authority.mockResolvedValue("authorization");
  state.requireActor.mockResolvedValue(actor);
});

describe("launch teacher assignment institutional authority",()=>{
  it("allows an eligible named CAN teacher while instruction and curriculum services are current",async()=>{
    state.txRows=[[]]; // No existing delivery arrangement.
    state.insertRows=[[{id:"assignment"}],[{id:"arrangement"}],[{id:"evaluation"}]];
    await expect(assignLaunchInstructor(state.tx,actor,input)).resolves.toEqual({created:true});
    expect(state.authority).toHaveBeenCalledWith(state.tx,"program",["academic_instruction","curriculum"]);
    expect(state.event).toHaveBeenCalledOnce();
    expect(state.audit).toHaveBeenCalledOnce();
  });

  it("denies assignment and replay after agreement expiry or revocation before reading credentials",async()=>{
    state.authority.mockRejectedValue(new AuthorizationError("current independently verified CAN-church operating authority"));
    await expect(assignLaunchInstructor(state.tx,actor,input)).rejects.toThrow("current independently verified CAN-church operating authority");
    expect(state.evaluate).not.toHaveBeenCalled();
    expect(state.audit).not.toHaveBeenCalled();
    expect(state.event).not.toHaveBeenCalled();
  });

  it("rejects a wrong Program before consulting institutional authority",async()=>{
    await expect(assignLaunchInstructor(state.tx,actor,{...input,programId:"other-program"}))
      .rejects.toThrow("launch teacher assignment scope");
    expect(state.authority).not.toHaveBeenCalled();
    expect(state.evaluate).not.toHaveBeenCalled();
  });
});

describe("issuer-bearing launch credit authority",()=>{
  const creditInput={programId:"program",sectionId:"section",credits:1,reason:"Reviewed course credit value"};

  it("records credit only with current school-of-record, records and issuance services",async()=>{
    state.dbRows=[[program]];
    state.txRows=[[{id:"section",programId:"program",siteId:"site",metadata:{credits:0.5}}],[]];
    await expect(setLaunchSectionCredits({data:creditInput})).resolves.toEqual({changed:true,credits:1});
    expect(state.authority).toHaveBeenCalledWith(state.tx,"program",[
      "school_of_record","academic_records","credit_issuance",
    ]);
    expect(state.tx.update).toHaveBeenCalledOnce();
    expect(state.event).toHaveBeenCalledOnce();
    expect(state.audit).toHaveBeenCalledOnce();
  });

  it("denies credit changes after authority expires without mutating the Section",async()=>{
    state.dbRows=[[program]];
    state.txRows=[[{id:"section",programId:"program",siteId:"site",metadata:{credits:0.5}}]];
    state.authority.mockRejectedValue(new AuthorizationError("current independently verified CAN-church operating authority"));
    await expect(setLaunchSectionCredits({data:creditInput})).rejects.toThrow("current independently verified CAN-church operating authority");
    expect(state.tx.update).not.toHaveBeenCalled();
    expect(state.event).not.toHaveBeenCalled();
    expect(state.audit).not.toHaveBeenCalled();
  });

  it("applies the same credit gate when provisioning a new Section",async()=>{
    state.dbRows=[[program],[{id:"term",siteId:"site",organizationId:"church",programId:"program"}]];
    state.authority.mockRejectedValue(new AuthorizationError("current independently verified CAN-church operating authority"));
    await expect(provisionLaunchSection({data:{
      programId:"program",termId:"term",courseTemplateVersionId:"course-version",
      code:"CAN-101",title:"CAN course",credits:1,
    }})).rejects.toThrow("current independently verified CAN-church operating authority");
    expect(state.assertCourse).toHaveBeenCalledOnce();
    expect(state.event).not.toHaveBeenCalled();
    expect(state.audit).not.toHaveBeenCalled();
  });
});
