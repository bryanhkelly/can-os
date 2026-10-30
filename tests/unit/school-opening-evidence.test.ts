import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessContext } from "@/domain/access-context";
import {
  finishSchoolOpeningEvidenceUpload, reviewSchoolOpeningEvidence,
} from "@/modules/operations/school-opening-evidence.server";
import {
  schoolOpeningEvidenceNextAction, schoolOpeningEvidenceStatus,
} from "@/domain/school-opening-evidence";

const ids={
  program:"11111111-1111-4111-8111-111111111111",configuration:"22222222-2222-4222-8222-222222222222",
  site:"44444444-4444-4444-8444-444444444444",church:"55555555-5555-4555-8555-555555555555",
  can:"66666666-6666-4666-8666-666666666666",uploader:"77777777-7777-4777-8777-777777777777",
  reviewer:"88888888-8888-4888-8888-888888888888",document:"99999999-9999-4999-8999-999999999999",
};
const state=vi.hoisted(()=>({
  rows:[] as unknown[][],writes:[] as Array<{table:unknown;values:Record<string,unknown>}>,
  inserts:[] as Record<string,unknown>[],audit:vi.fn(),event:vi.fn(),verifyObject:vi.fn(),
  submitter:vi.fn(),reviewer:vi.fn(),transaction:vi.fn(),
}));
vi.mock("@/db/client",()=>({db:{
  select:(..._args:unknown[])=>tx.select(),transaction:(callback:(tx:unknown)=>unknown)=>state.transaction(callback),
}}));
vi.mock("@/platform/mutation",()=>({writeAudit:state.audit,emitEvent:state.event,notifyMany:vi.fn()}));
vi.mock("@/platform/storage/r2",()=>({
  verifyPrivateObject:state.verifyObject,createPrivateUploadUrl:vi.fn(),signPrivateObjectUrl:vi.fn(),
}));
vi.mock("@/modules/enrollment/r2-documents.server",()=>({validateDocumentUpload:vi.fn()}));
vi.mock("@/modules/operations/school-opening.server",()=>({
  schoolIdentity:async()=>({programId:ids.program,siteId:ids.site,organizationId:ids.church,
    institutionId:ids.can,jurisdictionId:"jurisdiction"}),
  latestConfiguration:async()=>({id:ids.configuration,version:3,status:"draft"}),
  verifyChurchEvidenceSubmitter:state.submitter,verifyCANSchoolApprover:state.reviewer,
  verifySchoolOpeningReader:vi.fn(),
}));
const tx={
  select:()=>({
    from(){return this},where(){return this},orderBy(){return this},for(){return this},
    async limit(){return state.rows.shift()??[]},
    then(resolve:(rows:unknown[])=>unknown,reject:(error:unknown)=>unknown){
      return Promise.resolve(state.rows.shift()??[]).then(resolve,reject);
    },
  }),
  update:(table:unknown)=>({set:(values:Record<string,unknown>)=>({where:async()=>{
    state.writes.push({table,values});return [];
  }})}),
  insert:(table:unknown)=>({values:(values:Record<string,unknown>)=>({returning:async()=>{
    state.inserts.push({...values,table});return [{id:ids.document}];
  }})}),
};
const actor:AccessContext={actorPersonId:ids.uploader,accountId:"account",sessionId:"session",grantId:"grant",
  grantSiteId:ids.site,role:"registrar",capabilities:new Set(["program.launch.start"]),
  scope:{organizationIds:[ids.church],siteIds:[ids.site],programIds:[ids.program]}};
const input={
  programId:ids.program,configurationId:ids.configuration,expectedVersion:3,
  category:"school_opening_facility_approval" as const,expiresAt:new Date(Date.now()+86_400_000).toISOString(),
  key:`school-opening/${ids.program}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
  fileName:"Facility approval.pdf",mimeType:"application/pdf" as const,size:1024,
};
function document(overrides:Record<string,unknown>={}) {return {
  id:ids.document,subjectType:"program",subjectId:ids.program,category:input.category,
  fileName:input.fileName,mimeType:input.mimeType,storageProvider:"cloudflare_r2",storageKey:input.key,
  uploadedByPersonId:ids.uploader,expiresAt:new Date(input.expiresAt),verifiedAt:null,verifiedByPersonId:null,
  createdAt:new Date(),metadata:{version:1,isCurrent:true,storageVerified:true,reviewStatus:"pending",size:input.size,
    configurationId:ids.configuration,siteId:ids.site,organizationId:ids.church,
    institutionOrganizationId:ids.can,jurisdictionId:"jurisdiction"},...overrides,
};}
beforeEach(()=>{
  vi.clearAllMocks();state.rows=[];state.writes=[];state.inserts=[];
  state.transaction.mockImplementation(async callback=>callback(tx));
  process.env.CAN_R2_SCHOOL_OPENING_UPLOADS_ENABLED="true";
});

describe("versioned school-opening submission",()=>{
  it("preserves the previous approved document and creates a pending next version",async()=>{
    const previous=document({id:"previous",verifiedAt:new Date(),verifiedByPersonId:ids.reviewer,
      metadata:{...document().metadata,reviewStatus:"approved",version:1}});
    state.rows=[[{id:ids.program}],[],[previous]];
    const result=await finishSchoolOpeningEvidenceUpload(actor,input);
    expect(result).toEqual({documentId:ids.document,version:2,created:true});
    expect(state.writes[0]?.values.metadata).toMatchObject({isCurrent:false,reviewStatus:"approved"});
    expect(state.inserts[0]).toMatchObject({uploadedByPersonId:ids.uploader,
      metadata:{version:2,isCurrent:true,reviewStatus:"pending",configurationId:ids.configuration}});
    expect(state.inserts[0]).not.toHaveProperty("verifiedAt");
    expect(state.audit).toHaveBeenCalledOnce();expect(state.event).toHaveBeenCalledOnce();
    expect(state.verifyObject).toHaveBeenCalledOnce();
  });
  it("is idempotent for the same recorded object and rejects changed details",async()=>{
    state.rows=[[{id:ids.program}],[document()]];
    await expect(finishSchoolOpeningEvidenceUpload(actor,input)).resolves.toEqual({
      documentId:ids.document,version:1,created:false});
    expect(state.inserts).toHaveLength(0);expect(state.event).not.toHaveBeenCalled();
    state.rows=[[{id:ids.program}],[document()]];
    await expect(finishSchoolOpeningEvidenceUpload(actor,{...input,fileName:"Changed.pdf"}))
      .rejects.toThrow("different evidence details");
  });
  it("checks church capability and exact resource relationship before versioning",async()=>{
    state.submitter.mockImplementation(()=>{throw new Error("wrong church")});
    await expect(finishSchoolOpeningEvidenceUpload(actor,input)).rejects.toThrow("wrong church");
    expect(state.verifyObject).not.toHaveBeenCalled();expect(state.transaction).not.toHaveBeenCalled();
  });
});

describe("independent evidence review",()=>{
  const reviewer={...actor,actorPersonId:ids.reviewer,role:"can_network_steward",grantSiteId:null,
    capabilities:new Set(["network.agreements.verify"]),scope:{organizationIds:[ids.can],siteIds:[],programIds:[]}};
  const decision={programId:ids.program,documentId:ids.document,expectedVersion:1,
    decision:"approve" as const,reason:"Reviewed the facility approval against this exact school."};
  it("verifies a pending version transactionally",async()=>{
    state.rows=[[{id:ids.program}],[document()],[{id:ids.document}]];
    await expect(reviewSchoolOpeningEvidence(reviewer,decision)).resolves.toEqual({
      documentId:ids.document,status:"approve",changed:true});
    expect(state.writes[0]?.values).toMatchObject({verifiedByPersonId:ids.reviewer,
      metadata:{reviewStatus:"approved",reviewedByPersonId:ids.reviewer}});
    expect(state.event).toHaveBeenCalledOnce();
  });
  it("rejects self-review and stale versions without writes",async()=>{
    state.rows=[[{id:ids.program}],[document()],[{id:ids.document}]];
    await expect(reviewSchoolOpeningEvidence(actor,decision)).rejects.toThrow("independent evidence reviewer");
    state.rows=[[{id:ids.program}],[document({metadata:{...document().metadata,version:2}})],[{id:ids.document}]];
    await expect(reviewSchoolOpeningEvidence(reviewer,decision)).rejects.toThrow("Evidence version changed");
    expect(state.writes).toHaveLength(0);expect(state.event).not.toHaveBeenCalled();
  });
  it("records rejection with a correction reason and deduplicates the identical retry",async()=>{
    const rejected={...decision,decision:"reject" as const,reason:"The occupancy approval has expired; provide the current certificate."};
    state.rows=[[{id:ids.program}],[document()],[{id:ids.document}]];
    await reviewSchoolOpeningEvidence(reviewer,rejected);
    expect(state.writes[0]?.values.metadata).toMatchObject({reviewStatus:"rejected",reviewReason:rejected.reason});
    state.rows=[[{id:ids.program}],[document({metadata:{...document().metadata,reviewStatus:"rejected",
      reviewReason:rejected.reason,reviewedByPersonId:ids.reviewer}})],[{id:ids.document}]];
    await expect(reviewSchoolOpeningEvidence(reviewer,rejected)).resolves.toEqual({
      documentId:ids.document,status:"reject",changed:false});
    expect(state.writes).toHaveLength(1);expect(state.event).toHaveBeenCalledOnce();
  });
});

describe("precise evidence states and next actions",()=>{
  it.each([
    [null,"missing"],[document({metadata:{...document().metadata,reviewStatus:"rejected"}}),"rejected"],
    [document({expiresAt:new Date(Date.now()-1000)}),"expired"],
    [document({verifiedAt:new Date(),metadata:{...document().metadata,reviewStatus:"approved"}}),"approved"],
  ])("maps the latest version without falling back", (value,status)=>{
    expect(schoolOpeningEvidenceStatus(value as ReturnType<typeof document>|null,new Date())).toBe(status);
  });
  it("assigns correction to church and pending review to CAN",()=>{
    expect(schoolOpeningEvidenceNextAction("rejected").owner).toBe("Church registrar");
    expect(schoolOpeningEvidenceNextAction("pending").owner).toBe("CAN opening reviewer");
  });
});
