import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessContext } from "@/domain/access-context";
import { getActionDetail } from "@/modules/actions/action-detail.functions";

const state=vi.hoisted(()=>({
  actor:undefined as AccessContext|undefined,
  action:undefined as Record<string,unknown>|undefined,
  header:vi.fn(), authority:vi.fn(), authorizeClass:vi.fn(), transaction:vi.fn(), select:vi.fn(),
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
vi.mock("@/modules/learning/class-access.server",()=>({authorizeClass:state.authorizeClass}));
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
  state.authorizeClass.mockResolvedValue(undefined);
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
    expect(result).toMatchObject({id:actionId,dueAt:"2030-01-01T00:00:00.000Z",canManageOperations:false,
      sectionId:"section",canReviewClass:true});
    expect(result).not.toHaveProperty("metadata");
  });
  it.each(["student","guardian"])("denies %s sessions before reading Actions",async role=>{
    Object.assign(state.actor!,{role});
    await expect(getActionDetail({data:{actionId}})).rejects.toThrow("staff Action detail");
    expect(state.transaction).not.toHaveBeenCalled();
  });
  it.each(["organizationId","siteId","programId"])("denies foreign %s",async key=>{
    state.actor!.role="registrar";
    state.action![key]="foreign";
    await expect(getActionDetail({data:{actionId}})).rejects.toThrow("Action detail scope");
    expect(state.authority).not.toHaveBeenCalled();
  });
  it("honors explicitly empty section scope",async()=>{
    state.actor!.role="registrar";
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
  it.each(["registrar","specialist","counselor"])("does not offer teacher-only review links to %s",async role=>{
    state.actor!.role=role;
    expect(await getActionDetail({data:{actionId}})).toMatchObject({canReviewClass:false});
  });
  it("supports site-less academic work without bypassing the shared academic policy",async()=>{
    state.action!.siteId=null;
    state.actor!.role="registrar";
    expect(await getActionDetail({data:{actionId}})).toMatchObject({siteId:null,canManageOperations:false,workspaceHome:"/home"});
    expect(state.authority).toHaveBeenCalledOnce();
  });
  it("uses canonical academic authority for delegated teachers instead of requiring host-wide access",async()=>{
    state.actor!.scope={organizationIds:["academic-provider"],sectionIds:["section"]};
    expect(await getActionDetail({data:{actionId}})).toMatchObject({canReviewClass:true});
    expect(state.authority).toHaveBeenCalledWith(expect.anything(),state.actor,state.action);
    state.authority.mockRejectedValueOnce(new Error("delegation revoked"));
    await expect(getActionDetail({data:{actionId}})).rejects.toThrow("delegation revoked");
  });
  it.each([
    ["teacher","/home"],["specialist","/home"],["counselor","/home"],["registrar","/home"],
  ])("returns the verified %s workspace destination",async(role,workspaceHome)=>{
    state.actor!.role=role;
    expect(await getActionDetail({data:{actionId}})).toMatchObject({workspaceHome});
  });
  it.each(["local","delegated"])("opens a teacher-owned missing-work Action for %s authority",async mode=>{
    state.action!.type="missing_work_follow_up";
    state.action!.sectionId=null; // older follow-ups still have a canonical assessment
    state.action!.ownerPersonId="staff";
    state.action!.metadata={assessmentId:"00000000-0000-4000-8000-000000000002"};
    if(mode==="delegated")state.actor!.scope={
      organizationIds:["academic-provider"],siteIds:[],programIds:[],sectionIds:["section"],
    };
    state.select.mockImplementationOnce(()=>({
      from:()=>({where:()=>({limit:async()=>[state.action]})}),
    })).mockImplementationOnce(()=>({
      from:()=>({innerJoin:()=>({where:()=>({limit:async()=>[{
        sectionId:"section",siteId:"site",programId:"program",
      }]})})}),
    }));
    const result=await getActionDetail({data:{actionId}});
    expect(result).toMatchObject({
      canResolveMissingWork:true,canReviewClass:true,sectionId:"section",
      workspaceHome:"/teacher/missing-work",
    });
    expect(state.authorizeClass).toHaveBeenCalledWith(state.actor,"section",undefined,expect.anything());
    expect(result).not.toHaveProperty("metadata");
  });

  it("rejects a colleague's missing-work Action and revoked Section delegation",async()=>{
    state.action!.type="missing_work_follow_up";
    state.action!.ownerPersonId="another-teacher";
    state.action!.metadata={assessmentId:"00000000-0000-4000-8000-000000000002"};
    await expect(getActionDetail({data:{actionId}})).rejects.toThrow("Action detail scope");
    expect(state.authorizeClass).not.toHaveBeenCalled();
    state.action!.ownerPersonId="staff";
    state.select.mockImplementationOnce(()=>({
      from:()=>({where:()=>({limit:async()=>[state.action]})}),
    })).mockImplementationOnce(()=>({
      from:()=>({innerJoin:()=>({where:()=>({limit:async()=>[{
        sectionId:"section",siteId:"site",programId:"program",
      }]})})}),
    }));
    state.authorizeClass.mockRejectedValueOnce(new Error("Section delegation revoked"));
    await expect(getActionDetail({data:{actionId}})).rejects.toThrow("Section delegation revoked");
  });

  it("does not substitute another record for missing or malformed IDs",async()=>{
    state.action=undefined;
    await expect(getActionDetail({data:{actionId}})).rejects.toThrow("Action detail scope");
    state.transaction.mockClear();
    await expect(getActionDetail({data:{actionId:"invalid"}})).rejects.toThrow();
    expect(state.transaction).not.toHaveBeenCalled();
  });
});
