import { beforeEach, describe, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({
  role:"teacher",person:"teacher",classes:vi.fn(),results:[] as unknown[][],
}));
vi.mock("@tanstack/react-start",()=>({
  createServerFn:()=>({validator:()=>({handler:(fn:unknown)=>fn}),handler:(fn:unknown)=>fn}),
}));
vi.mock("@tanstack/react-start/server",()=>({getRequest:()=>({}),setResponseHeader:vi.fn()}));
vi.mock("@/modules/identity/command-context.server",()=>({
  getCommandContext:async()=>({role:state.role,actorPersonId:state.person,
    scope:{sectionIds:["section"],organizationIds:["organization"],siteIds:[],programIds:[]}}),
}));
vi.mock("@/modules/learning/class-access.server",()=>({accessibleClasses:state.classes}));
vi.mock("@/db/client",()=>({db:{select:()=>{
  const rows=state.results.shift()??[];
  const chain:Record<string,unknown>={};
  for(const method of ["from","innerJoin","where","orderBy","limit"])chain[method]=()=>chain;
  chain.then=(resolve:(rows:unknown[])=>unknown)=>Promise.resolve(rows).then(resolve);
  return chain;
}}}));
import { getNotifications } from "@/modules/communication/notification-center.functions";
const action={id:"action",sectionId:"section",siteId:"site",programId:"program",organizationId:"organization",
  subjectId:"profile",metadata:{requestedByGuardianPersonId:"guardian"},studentPersonId:"student",assessmentId:"assessment",submissionId:"submission"};
const notification={id:"notice",type:"guardian_grade_follow_up_resolved",title:"School response",body:"Review the school response.",
  status:"unread",resourceType:"action",resourceId:"action",createdAt:new Date("2026-10-29")};
beforeEach(()=>{
  vi.clearAllMocks();
  state.role="teacher";state.person="teacher";
  state.classes.mockResolvedValue([{id:"section"}]);
  state.results=[[notification],[],[action]];
});
describe("guardian grade Action notification destinations",()=>{
  it("routes the delegated CAN teacher to the exact guardian Action",async()=>{
    await expect(getNotifications()).resolves.toMatchObject([{href:"/teacher?gradeAction=action"}]);
  });
  it("removes the teacher destination after Section authority is lost",async()=>{
    state.classes.mockResolvedValue([]);
    await expect(getNotifications()).resolves.toMatchObject([{href:null}]);
  });
  it("opens the exact child's assessment for the requesting guardian",async()=>{
    state.role="guardian";state.person="guardian";state.results.push([{studentPersonId:"student"}]);
    await expect(getNotifications()).resolves.toMatchObject([{
      href:"/guardian/academics?student=student&section=section&assessment=assessment&submission=submission",
    }]);
  });
  it("hides the sensitive notice when the guardian relationship is revoked",async()=>{
    state.role="guardian";state.person="guardian";state.results.push([]);
    await expect(getNotifications()).resolves.toEqual([]);
  });
  it("does not disclose another guardian's response even for a related child",async()=>{
    state.role="guardian";state.person="other-guardian";state.results.push([{studentPersonId:"student"}]);
    await expect(getNotifications()).resolves.toEqual([]);
  });
});
