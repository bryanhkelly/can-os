import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessContext } from "@/domain/access-context";
import { getActionDetail } from "@/modules/actions/action-detail.functions";

const state=vi.hoisted(()=>({
  actor:undefined as AccessContext|undefined,
  action:undefined as Record<string,unknown>|undefined,
  header:vi.fn(), authority:vi.fn(), transaction:vi.fn(), select:vi.fn(),
}));
vi.mock("@tanstack/react-start",()=>({
  createServerFn:()=>({
    parse:(input:unknown)=>input,
    validator(parse:(input:unknown)=>unknown){this.parse=parse;return this;},
    handler(callback:(input:{data:unknown})=>unknown){
      return async(input:{data:unknown})=>callback({data:this.parse(input.data)});
    },
  }),
}));
vi.mock("@tanstack/react-start/server",()=>({
  getRequest:()=>new Request("http://localhost"),setResponseHeader:state.header,
}));
vi.mock("@/modules/identity/command-context.server",()=>({getCommandContext:async()=>state.actor}));
vi.mock("@/modules/actions/academic-action-policy.server",()=>({assertAcademicActionAuthority:state.authority}));
vi.mock("@/db/client",()=>({db:{transaction:state.transaction}}));

const actionId="00000000-0000-4000-8000-000000000001";
beforeEach(()=>{
  vi.clearAllMocks();
  state.actor={
    actorPersonId:"staff",role:"teacher",accountId:"account",sessionId:"session",grantId:"grant",
    capabilities:new Set(["action.resolve"]),
    scope:{organizationIds:["org"],siteIds:["site"],programIds:["program"]},
  };
  state.action={
    id:actionId,type:"academic_intervention",subjectType:"student_profile",subjectId:"student",
    organizationId:"org",siteId:"site",programId:"program",sectionId:"section",
    title:"Review missing work",description:"Meet the student",status:"open",priority:"high",
    dueAt:new Date("2030-01-01"),resolvedAt:null,resolutionNote:null,metadata:{private:"not returned"},
  };
  state.authority.mockResolvedValue(undefined);
  state.select.mockImplementation(()=>({
    from:()=>({where:()=>({limit:async()=>state.action?[state.action]:[]})}),
  }));
  state.transaction.mockImplementation(async(work:(tx:{select:typeof state.select})=>unknown)=>work({select:state.select}));
});

describe("staff Action detail boundary",()=>{
  it("reauthorizes academic Actions and returns only the public detail fields",async()=>{
    const result=await getActionDetail({data:{actionId}});
    expect(state.authority).toHaveBeenCalledWith(expect.anything(),state.actor,state.action);
    expect(state.header).toHaveBeenCalledWith("Cache-Control","private, no-store");
    expect(result).toMatchObject({id:actionId,dueAt:"2030-01-01T00:00:00.000Z",canManageOperations:false});
    expect(result).not.toHaveProperty("metadata");
  });
  it.each(["student","guardian"])("denies %s sessions before reading Actions",async role=>{
    Object.assign(state.actor!,{role});
    await expect(getActionDetail({data:{actionId}})).rejects.toThrow("staff Action detail");
    expect(state.transaction).not.toHaveBeenCalled();
  });
  it.each(["organizationId","siteId","programId"])("denies foreign %s",async key=>{
    state.action![key]="foreign";
    await expect(getActionDetail({data:{actionId}})).rejects.toThrow("Action detail scope");
    expect(state.authority).not.toHaveBeenCalled();
  });
  it("honors explicitly empty section scope",async()=>{
    state.actor!.scope.sectionIds=[];
    await expect(getActionDetail({data:{actionId}})).rejects.toThrow("Action detail scope");
  });
  it("denies lost academic relationships and missing capability",async()=>{
    state.authority.mockRejectedValueOnce(new Error("current academic Action staff relationship"));
    await expect(getActionDetail({data:{actionId}})).rejects.toThrow("current academic Action staff relationship");
    state.actor!.capabilities=new Set();
    await expect(getActionDetail({data:{actionId}})).rejects.toThrow("action.resolve");
  });
  it("keeps generic work registrar-only and referrals in their owning workflow",async()=>{
    state.action!.type="office_follow_up";
    await expect(getActionDetail({data:{actionId}})).rejects.toThrow("owning workspace");
    state.actor!.role="registrar";
    expect(await getActionDetail({data:{actionId}})).toMatchObject({canManageOperations:true});
    state.action!.type="support_referral";
    await expect(getActionDetail({data:{actionId}})).rejects.toThrow("support referral workspace");
  });
  it("supports site-less academic work without bypassing the shared academic policy",async()=>{
    state.action!.siteId=null;
    state.actor!.role="registrar";
    expect(await getActionDetail({data:{actionId}})).toMatchObject({siteId:null,canManageOperations:false,workspaceHome:"/operations"});
    expect(state.authority).toHaveBeenCalledOnce();
  });
  it.each([
    ["teacher","/teacher"],["specialist","/coach"],["counselor","/counselor"],["registrar","/operations"],
  ])("returns the verified %s workspace destination",async(role,workspaceHome)=>{
    state.actor!.role=role;
    expect(await getActionDetail({data:{actionId}})).toMatchObject({workspaceHome});
  });
  it("does not substitute another record for missing or malformed IDs",async()=>{
    state.action=undefined;
    await expect(getActionDetail({data:{actionId}})).rejects.toThrow("Action detail scope");
    state.transaction.mockClear();
    await expect(getActionDetail({data:{actionId:"invalid"}})).rejects.toThrow();
    expect(state.transaction).not.toHaveBeenCalled();
  });
});
