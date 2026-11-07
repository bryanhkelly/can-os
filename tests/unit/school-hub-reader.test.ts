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
 it("isolates unrelated read failures for each launch module",async()=>{
  state.websiteReadFails=true;state.teamReadFails=true;
  const academics=await getSchoolHubData({data:{siteId,module:"academics"}});
  expect(academics.statuses?.academics?.state).toBe("Not Started");
  expect(academics.statuses?.website).toBeUndefined();
  expect(academics.statuses?.team).toBeUndefined();
  state.programReadFails=true;state.teamReadFails=false;
  const team=await getSchoolHubData({data:{siteId,module:"team"}});
  expect(team.statuses?.team?.state).toBe("Not Started");
  expect(team.statuses?.academics).toBeUndefined();
  const planned=await getSchoolHubData({data:{siteId,module:"promote"}});
  expect(planned.statuses?.promote?.state).toBe("Planned");
  expect(planned.statuses?.team).toBeUndefined();
 });
 it("does not select another school, Program or membership",async()=>{
  const outOfScope=await getSchoolHubData({data:{siteId:"sibling"}});
  expect(outOfScope.statuses).toBeNull();
  expect(outOfScope.options.sites).toHaveLength(1);
  state.launches=[{id:programId,siteId:"sibling"}];
  const invalidProgram=await getSchoolHubData({data:{siteId,programId}});
  expect(invalidProgram.selectedProgramId).toBeNull();
  expect(invalidProgram.selectionError).toContain("not available");
  const result=await getSchoolHubData({data:{}});expect(result.selectedProgramId).toBeNull();expect(result.statuses).toBeNull();
 });
});
