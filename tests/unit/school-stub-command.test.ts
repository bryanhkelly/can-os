import { beforeEach, describe, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({context:{} as any,existing:null as any,transaction:vi.fn(),insert:vi.fn(),audit:vi.fn(),emit:vi.fn(),provision:vi.fn(),ensure:vi.fn(),startProgram:vi.fn()}));
vi.mock("@tanstack/react-start",()=>({createServerFn:()=>({
  parse:(value:unknown)=>value,
  validator(parse:(value:unknown)=>unknown){this.parse=parse;return this;},
  handler(callback:(value:{data:unknown})=>unknown){return async (input:{data:unknown})=>callback({data:this.parse(input.data)});},
})}));
vi.mock("@tanstack/react-start/server",()=>({getRequest:()=>new Request("https://example.test"),setResponseHeader:vi.fn()}));
vi.mock("@/modules/identity/command-context.server",()=>({getCommandContext:async()=>state.context}));
vi.mock("@/db/client",()=>({db:{transaction:state.transaction}}));
vi.mock("@/modules/sites/site-public-provisioning.server",()=>({provisionNewSitePublicationDraft:state.provision,ensureExistingSitePublicationDraftForLaunch:state.ensure}));
vi.mock("@/platform/mutation",()=>({emitEvent:state.emit,writeAudit:state.audit}));
vi.mock("@/modules/programs/program-launch-service",()=>({activateProgram:vi.fn(),createProgramOrientation:vi.fn(),startProgramLaunch:state.startProgram}));
vi.mock("@/modules/programs/opening-handoff.server",()=>({listOpeningOperators:vi.fn()}));
import { createLaunchSite } from "@/modules/programs/launch.functions";
const organizationId="00000000-0000-4000-8000-000000000001";
const siteId="00000000-0000-4000-8000-000000000002";
const input={organizationId,name:"New School",slug:"new-school",timezone:"America/New_York",stubOnly:true,planningLocation:{city:"Tampa",state:"FL"}};
beforeEach(()=>{
  vi.clearAllMocks();state.existing=null;
  state.provision.mockResolvedValue({slug:"new-school",host:"new-school.example.test",status:"draft"});
  state.ensure.mockResolvedValue({slug:"new-school",host:"new-school.example.test",status:"draft",created:false});
  state.context={role:"registrar",actorPersonId:"operator",grantSiteId:null,capabilities:new Set(["program.launch.start"]),scope:{organizationIds:[organizationId]}};
  state.insert.mockImplementation(()=>({values:()=>({returning:async()=>[{id:siteId}]})}));
  state.transaction.mockImplementation(async callback=>callback({execute:vi.fn(),insert:state.insert,
    select:()=>({from:()=>({where:()=>({limit:async()=>state.existing?[state.existing]:[]})})}),
  }));
});
describe("minimal school stub command",()=>{
  it("creates a canonical Site and private website draft without starting a Program",async()=>{
    await expect(createLaunchSite({data:input})).resolves.toMatchObject({siteId,replayed:false,publicSiteDraft:{status:"draft"}});
    expect(state.insert).toHaveBeenCalledOnce();expect(state.audit).toHaveBeenCalledOnce();expect(state.emit).toHaveBeenCalledOnce();
    expect(state.provision).toHaveBeenCalledOnce();expect(state.ensure).not.toHaveBeenCalled();expect(state.startProgram).not.toHaveBeenCalled();
    expect(state.audit.mock.calls[0][2].after.schoolPlanningLocation).toEqual({city:"Tampa",state:"FL"});
  });
  it("reuses the saved stub after an uncertain response without duplicate writes",async()=>{
    state.existing={id:siteId,...input,address:null,metadata:{schoolPlanningLocation:input.planningLocation}};
    await expect(createLaunchSite({data:input})).resolves.toMatchObject({siteId,replayed:true,publicSiteDraft:{status:"draft"}});
    expect(state.insert).not.toHaveBeenCalled();expect(state.audit).not.toHaveBeenCalled();expect(state.ensure).toHaveBeenCalledOnce();
  });
  it("refuses a changed planning location instead of adopting a different school",async()=>{
    state.existing={id:siteId,...input,address:null,metadata:{schoolPlanningLocation:{city:"Miami",state:"FL"}}};
    await expect(createLaunchSite({data:input})).rejects.toThrow("already has the site");expect(state.insert).not.toHaveBeenCalled();
  });
  it.each(["site","other-organization","capability"])("denies %s authority before creating records",async kind=>{
    if(kind==="site")state.context.grantSiteId=siteId;
    if(kind==="other-organization")state.context.scope.organizationIds=[];
    if(kind==="capability")state.context.capabilities=new Set();
    await expect(createLaunchSite({data:input})).rejects.toThrow();expect(state.transaction).not.toHaveBeenCalled();
  });
  it.each([{city:"",state:"FL"},{city:"Tampa",state:"XX"}])("rejects invalid planning location %j",async planningLocation=>{
    await expect(createLaunchSite({data:{...input,planningLocation}})).rejects.toThrow();expect(state.transaction).not.toHaveBeenCalled();
  });
  it("preserves website draft reservation for legacy location callers",async()=>{
    state.provision.mockResolvedValue({host:"new-school.example.test",status:"draft"});
    await expect(createLaunchSite({data:{...input,stubOnly:false}})).resolves.toMatchObject({publicSiteDraft:{status:"draft"}});
    expect(state.provision).toHaveBeenCalledOnce();
  });
});
