import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessContext } from "@/domain/access-context";
import type { SchoolOpeningDecision } from "@/domain/school-opening-decision";
import {
  decideChurchSchoolOpening, readChurchSchoolOpening, schoolOpeningEvidenceCategories,
} from "@/modules/operations/school-opening.server";
import { decideChurchSchoolOpeningFn } from "@/modules/operations/school-opening.functions";

const state=vi.hoisted(()=>({
  rows:[] as unknown[][],
  writes:[] as Array<{table:unknown;values:Record<string,unknown>}>,
  audit:vi.fn(),event:vi.fn(),contract:vi.fn(),transaction:vi.fn(),
  actor:null as AccessContext|null,
}));
vi.mock("@/db/client",()=>({db:{
  transaction:(callback:(tx:unknown)=>unknown)=>state.transaction(callback),
  select:(..._args:unknown[])=>tx.select(),
}}));
vi.mock("@/platform/mutation",()=>({writeAudit:state.audit,emitEvent:state.event}));
vi.mock("@/modules/programs/program-site-authorization.server",()=>({
  requireChurchHostedOperatingServices:state.contract,
}));
vi.mock("@/modules/identity/command-context.server",()=>({
  getCommandContext:async()=>state.actor,
}));
vi.mock("@tanstack/react-start/server",()=>({
  getRequest:()=>new Request("https://can.example/network-steward"),setResponseHeader:vi.fn(),
}));
vi.mock("@tanstack/react-start",()=>({
  createServerFn:()=>({
    validator:(parse:(value:unknown)=>unknown)=>({
      handler:(handler:(input:{data:unknown})=>unknown)=>
        async(input?:{data:unknown})=>handler({data:parse(input?.data)}),
    }),
  }),
}));

const ids={
  program:"11111111-1111-4111-8111-111111111111",
  configuration:"22222222-2222-4222-8222-222222222222",
  otherConfiguration:"33333333-3333-4333-8333-333333333333",
  site:"44444444-4444-4444-8444-444444444444",
  church:"55555555-5555-4555-8555-555555555555",
  can:"66666666-6666-4666-8666-666666666666",
  reviewer:"77777777-7777-4777-8777-777777777777",
  verifier:"88888888-8888-4888-8888-888888888888",
};
const command:SchoolOpeningDecision={
  programId:ids.program,configurationId:ids.configuration,expectedVersion:1,
  decision:"approve",reason:"Independently reviewed the exact school configuration.",
};
const actor:AccessContext={
  actorPersonId:ids.reviewer,accountId:"account",sessionId:"session",grantId:"grant",
  grantSiteId:null,role:"can_network_steward",
  capabilities:new Set(["network.agreements.verify"]),
  scope:{organizationIds:[ids.can],siteIds:[],programIds:[]},
};
const tx={
  select:()=>({
    from(){return this;},innerJoin(){return this;},where(){return this;},
    orderBy(){return this;},for(){return this;},
    async limit(){return state.rows.shift()??[];},
    then(resolve:(rows:unknown[])=>unknown,reject:(error:unknown)=>unknown){
      return Promise.resolve(state.rows.shift()??[]).then(resolve,reject);
    },
  }),
  update:(table:unknown)=>({
    set:(values:Record<string,unknown>)=>({
      where:async()=>{state.writes.push({table,values});},
    }),
  }),
};
function configuration(status="draft",overrides:Record<string,unknown>={}){
  return {id:ids.configuration,version:1,status,...overrides};
}
function arrange(config=configuration()){
  state.rows=[
    [{id:ids.program}],
    [{programId:ids.program,programStatus:"launching",siteId:ids.site,
      organizationId:ids.church,hostId:ids.church,institutionId:ids.can,
      jurisdictionId:"jurisdiction",delivery:{onsite:true},type:"church",siteOwner:ids.church}],
    [{id:ids.can,type:"can_network"}],
    [config],
  ];
}
function addValidEvidence(){
  state.rows.push(
    schoolOpeningEvidenceCategories.map((category,index)=>({
      id:"document-"+index,fileName:"Evidence "+index+".pdf",category,verifiedAt:new Date(Date.now()-60_000),
      verifiedByPersonId:ids.verifier,uploadedByPersonId:"different-uploader",storageProvider:"cloudflare_r2",
      expiresAt:new Date(Date.now()+86_400_000),createdAt:new Date(Date.now()-120_000),
      metadata:{siteId:ids.site,organizationId:ids.church,configurationId:ids.configuration,
        storageVerified:true,reviewStatus:"approved",version:1,isCurrent:true,
        institutionOrganizationId:ids.can,jurisdictionId:"jurisdiction"},
    })),
    [{personId:ids.verifier}],
    [{id:"current-director"}],
  );
}
function expectNoDecision(){
  expect(state.writes).toHaveLength(0);
  expect(state.audit).not.toHaveBeenCalled();
  expect(state.event).not.toHaveBeenCalled();
}
beforeEach(()=>{
  vi.clearAllMocks();state.writes=[];state.actor=actor;
  state.transaction.mockImplementation(async callback=>callback(tx));
  state.contract.mockResolvedValue("agreement");arrange();
});

describe("school opening decision binds the reviewed configuration",()=>{
  it.each(["approve","suspend"] as const)("rejects %s after a newer draft replaces the reviewed version",async decision=>{
    arrange(configuration("draft",{id:ids.otherConfiguration,version:2}));
    await expect(decideChurchSchoolOpening(actor,{...command,decision}))
      .rejects.toThrow("School configuration changed. Reload");
    expectNoDecision();expect(state.contract).not.toHaveBeenCalled();
  });
  it("rejects a different configuration ID even when the version number matches",async()=>{
    await expect(decideChurchSchoolOpening(actor,{...command,configurationId:ids.otherConfiguration}))
      .rejects.toThrow("School configuration changed");
    expectNoDecision();
  });
  it("rejects a mismatched version even when the configuration ID matches",async()=>{
    await expect(decideChurchSchoolOpening(actor,{...command,expectedVersion:2}))
      .rejects.toThrow("School configuration changed");
    expectNoDecision();
  });
  it("records approval for the exact reviewed version through the actual endpoint",async()=>{
    addValidEvidence();
    const result=await decideChurchSchoolOpeningFn({data:command});
    expect(result).toEqual({configurationId:ids.configuration,status:"approved"});
    expect(state.writes).toHaveLength(1);
    expect(state.writes[0]?.values.status).toBe("approved");
    expect(state.audit.mock.calls[0]?.[2]).toMatchObject({
      entityId:ids.configuration,after:{version:1,status:"approved"},
    });
    expect(state.event.mock.calls[0]?.[1]).toMatchObject({
      aggregateId:ids.configuration,payload:{version:1},
    });
  });
  it("still rejects missing or withdrawn evidence on a matching draft",async()=>{
    state.rows.push([]);
    await expect(decideChurchSchoolOpening(actor,command)).rejects.toThrow("current independently verified");
    expectNoDecision();expect(state.contract).toHaveBeenCalledOnce();
  });
  it("still requires the proper institution and reviewer capability",async()=>{
    await expect(decideChurchSchoolOpening({...actor,capabilities:new Set()},command)).rejects.toThrow();
    expectNoDecision();expect(state.contract).not.toHaveBeenCalled();
  });
  it("suspends the matching opening even when its agreement is no longer available",async()=>{
    arrange(configuration("approved"));
    state.contract.mockRejectedValue(new Error("Expired agreement"));
    await expect(decideChurchSchoolOpening(actor,{...command,decision:"suspend"}))
      .resolves.toEqual({configurationId:ids.configuration,status:"suspended"});
    expect(state.contract).not.toHaveBeenCalled();
    expect(state.writes[0]?.values.status).toBe("suspended");
    expect(state.event.mock.calls[0]?.[1]).toMatchObject({payload:{version:1}});
  });
  it("does not duplicate an already completed matching suspension",async()=>{
    arrange(configuration("suspended"));
    await expect(decideChurchSchoolOpening(actor,{...command,decision:"suspend"}))
      .resolves.toEqual({configurationId:ids.configuration,status:"suspended"});
    expectNoDecision();
  });
  it("deduplicates the same officer's approval retry without rechecking changed live evidence",async()=>{
    arrange(configuration("approved",{approvedByPersonId:ids.reviewer}));
    await expect(decideChurchSchoolOpening(actor,command))
      .resolves.toEqual({configurationId:ids.configuration,status:"approved"});
    expectNoDecision();expect(state.contract).not.toHaveBeenCalled();
  });
  it.each([
    {configurationId:undefined},
    {expectedVersion:undefined},
    {expectedVersion:0},
    {configurationId:"not-an-id"},
  ])("rejects an unbound or malformed transport request before opening a transaction: %j",async invalid=>{
    await expect(decideChurchSchoolOpeningFn({data:{...command,...invalid}})).rejects.toThrow();
    expect(state.transaction).not.toHaveBeenCalled();expectNoDecision();
  });
});


describe("school opening authorized evidence projection",()=>{
  function arrangeRead(){
    arrange();state.rows.shift();addValidEvidence();state.rows.push(state.rows[3]!);
  }
  it("returns only current verified metadata and preserves document IDs in commands",async()=>{
    arrangeRead();
    const model=await readChurchSchoolOpening(actor,ids.program);
    expect(model.evidenceReady).toBe(true);
    expect(model.evidenceIssue).toBeNull();
    expect(model.evidence).toHaveLength(5);
    expect(Object.keys(model.evidence[0]!).sort()).toEqual(
      ["category","expiresAt","fileName","id","verifiedAt"]);
    expect(model.evidence[0]?.fileName).toBe("Evidence 0.pdf");
  });
  it("does not advertise readiness when the reviewer verified the evidence",async()=>{
    arrangeRead();
    (state.rows[3]![0] as Record<string,unknown>).verifiedByPersonId=ids.reviewer;
    const model=await readChurchSchoolOpening(actor,ids.program);
    expect(model.evidenceReady).toBe(false);
    expect(model.evidence).toEqual([]);
    expect(model.evidenceIssue).toContain("independently verified");
  });
  it("does not fall back to older evidence when the newest category record is unverified",async()=>{
    arrangeRead();
    state.rows[3]!.unshift({...state.rows[3]![0] as object,id:"replacement",verifiedAt:null});
    const model=await readChurchSchoolOpening(actor,ids.program);
    expect(model.evidence).toEqual([]);expect(model.evidenceReady).toBe(false);
  });
  it("retains valid evidence metadata when the separate agreement gate fails",async()=>{
    arrangeRead();
    const {AuthorizationError}=await import("@/domain/command-context");
    state.contract.mockRejectedValueOnce(new AuthorizationError("current agreement"));
    const model=await readChurchSchoolOpening(actor,ids.program);
    expect(model.evidence).toHaveLength(5);
    expect(model.evidenceReady).toBe(false);
    expect(model.evidenceIssue).toBeNull();
  });
  it("allows the exact church registrar to track evidence without granting CAN review or approval",async()=>{
    arrangeRead();
    const churchActor:AccessContext={...actor,actorPersonId:"church-registrar",role:"registrar",grantSiteId:ids.site,
      capabilities:new Set(["program.launch.start"]),
      scope:{organizationIds:[ids.church],siteIds:[ids.site],programIds:[ids.program]}};
    const model=await readChurchSchoolOpening(churchActor,ids.program);
    expect(model.canSubmit).toBe(true);expect(model.canReview).toBe(false);expect(model.canDecide).toBe(false);
    expect(model.approvalReady).toBe(false);expect(model.evidenceItems).toHaveLength(5);
    expect(model.evidenceItems.every(item=>item.status==="approved")).toBe(true);
  });
  it("rejects another institution before reading evidence",async()=>{
    arrangeRead();
    await expect(readChurchSchoolOpening({...actor,scope:{organizationIds:["other"]}},ids.program))
      .rejects.toThrow();
    expect(state.rows).toHaveLength(5);
  });
});


describe("opening prerequisites match command gates",()=>{
  function arrangeRead(status="draft"){
    arrange(configuration(status));state.rows.shift();addValidEvidence();state.rows.push(state.rows[3]!);
  }
  it("allows only a draft with all three current prerequisites",async()=>{
    arrangeRead();
    const model=await readChurchSchoolOpening(actor,ids.program);
    expect(model.approvalReady).toBe(true);
    expect(model.prerequisites.map(item=>[item.id,item.satisfied])).toEqual([
      ["evidence",true],["agreement",true],["director",true],
    ]);
    expectNoDecision();
  });
  it("blocks approval when the director is absent while retaining evidence/contract status",async()=>{
    arrangeRead();state.rows[5]=[];
    const model=await readChurchSchoolOpening(actor,ids.program);
    expect(model.evidenceReady).toBe(true);expect(model.approvalReady).toBe(false);
    expect(model.prerequisites.find(item=>item.id==="director")).toMatchObject({
      satisfied:false,detail:expect.stringContaining("Appoint"),
    });
    arrange();addValidEvidence();state.rows[6]=[];
    await expect(decideChurchSchoolOpening(actor,command)).rejects.toThrow("church site director");
    expectNoDecision();
  });
  it("reports all blockers even when evidence fails first",async()=>{
    arrangeRead();
    // Missing documents stop evidence validation before its verifier query.
    state.rows.splice(3,3,[],[]);
    const {AuthorizationError}=await import("@/domain/command-context");
    state.contract.mockRejectedValueOnce(new AuthorizationError("current agreement"));
    const model=await readChurchSchoolOpening(actor,ids.program);
    expect(model.prerequisites.map(item=>item.satisfied)).toEqual([false,false,false]);
    expect(model.approvalReady).toBe(false);
    expect(state.contract).toHaveBeenCalledOnce();
    expect(state.rows).toEqual([]);
  });
  it.each(["approved","suspended"])("does not offer another approval for %s",async status=>{
    arrangeRead(status);
    const model=await readChurchSchoolOpening(actor,ids.program);
    expect(model.prerequisites.every(item=>item.satisfied)).toBe(true);
    expect(model.approvalReady).toBe(false);
  });
  it("propagates infrastructure failures instead of mislabeling them as unmet policy",async()=>{
    arrangeRead();state.contract.mockRejectedValueOnce(new Error("Database unavailable"));
    await expect(readChurchSchoolOpening(actor,ids.program)).rejects.toThrow("Database unavailable");
  });
});
