import { beforeEach, describe, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({actor:{} as any,options:{} as any,launches:[] as any[],programReadFails:false,websiteReadFails:false,teamReadFails:false,content:null as any,grants:[] as any[]}));
vi.mock("@tanstack/react-start",()=>({createServerFn:()=>({validator(){return this;},handler:(fn:any)=>fn})}));
vi.mock("@tanstack/react-start/server",()=>({getRequest:()=>new Request("https://school.example.test"),setResponseHeader:vi.fn()}));
vi.mock("@/modules/identity/command-context.server",()=>({getCommandContext:async()=>state.actor}));
vi.mock("@/modules/programs/launch.functions",()=>({listLaunchOptions:async()=>state.options,listLaunches:async()=>{if(state.programReadFails)throw Error();return {launches:state.launches};}}));
vi.mock("@/modules/sites/site-website-authorization.server",()=>({requirePartnerWebsiteEditor:async()=>{if(state.websiteReadFails)throw Error();return {};}}));
vi.mock("@/db/client",()=>({db:{select:()=>{
 let tableName="";const chain:any={from:(table:any)=>{tableName=table[Symbol.for("drizzle:Name")];return chain;},innerJoin:()=>chain,where:()=>chain,orderBy:()=>chain,
 limit:async()=>state.content?[state.content]:[],then:(resolve:any,reject:any)=>state.teamReadFails?Promise.reject(Error()).then(resolve,reject):Promise.resolve(state.grants).then(resolve,reject)};return chain;
}}}));
import { getSchoolHubData } from "@/modules/programs/school-hub.functions";
const siteId="00000000-0000-4000-8000-000000000001";
const programId="00000000-0000-4000-8000-000000000002";
beforeEach(()=>{
 state.actor={role:"site_admin",grantSiteId:siteId,actorPersonId:"admin",capabilities:new Set(["program.read"])};
 state.options={sites:[{id:siteId,organizationId:"org",websiteDraft:null}]};state.launches=[];state.programReadFails=false;state.websiteReadFails=false;state.teamReadFails=false;state.content=null;state.grants=[{personId:"admin",active:true}];
});
describe("exact-Site Hub reader",()=>{
 it("returns real empty preparation without inventing approvals",async()=>{
  const result=await getSchoolHubData({data:{siteId}});
  expect(result.statuses?.website.state).toBe("Not Started");expect(result.statuses?.team.detail).toContain("1 active members");expect(result.statuses?.academics.state).toBe("Not Started");expect(result.statuses?.compliance.state).toBe("Blocked");
 });
 it("isolates failed reads rather than presenting empty records",async()=>{
  state.programReadFails=true;state.websiteReadFails=true;state.teamReadFails=true;
  const result=await getSchoolHubData({data:{siteId}});
  expect(result.statuses?.website.state).toBe("Unavailable");expect(result.statuses?.team.state).toBe("Unavailable");expect(result.statuses?.academics.state).toBe("Unavailable");expect(result.statuses?.compliance.state).toBe("Unavailable");
 });
 it("does not select another school, Program or membership",async()=>{
  await expect(getSchoolHubData({data:{siteId:"sibling"}})).rejects.toThrow();
  state.launches=[{id:programId,siteId:"sibling"}];await expect(getSchoolHubData({data:{siteId,programId}})).rejects.toThrow();
  const result=await getSchoolHubData({data:{}});expect(result.selectedProgramId).toBeNull();expect(result.statuses).toBeNull();
 });
});
