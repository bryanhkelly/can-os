import { beforeEach, describe, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({execute:vi.fn(),body:" "}));
vi.mock("@tanstack/react-start",()=>({
 createServerFn:()=>({validator:()=>({handler:(fn:unknown)=>fn}),handler:(fn:unknown)=>fn}),
}));
vi.mock("@tanstack/react-start/server",()=>({setResponseHeader:vi.fn()}));
vi.mock("@/modules/learning/class-access.server",()=>({
 classActor:async()=>({role:"student"}),
 accessibleClasses:vi.fn(),
 authorizeClass:async()=>({studentProfileId:"student",section:{
  id:"section",versionId:"version",contentStatus:"published",curriculum:{learning:{version:1,modules:[{
   id:"module",title:"Unit",lessons:[{id:"outline",title:"Future outline",body:state.body,resources:[]}],
  }]}},
 }}),
}));
vi.mock("@/modules/identity/actors.server",()=>({recordAudit:vi.fn()}));
vi.mock("@/platform/mutation",()=>({emitEvent:vi.fn()}));
vi.mock("@/db/client",()=>({db:{transaction:async(fn:(tx:unknown)=>unknown)=>fn({execute:state.execute})}}));
import { setLessonCompletion } from "@/modules/learning/class-workspace.functions";
beforeEach(()=>{vi.clearAllMocks();state.body=" ";});
describe("lesson completion requires real published instruction",()=>{
 it("rejects completion of an outline before persisting progress or activity",async()=>{
  const invoke=setLessonCompletion as unknown as (arg:unknown)=>Promise<unknown>;
  await expect(invoke({data:{sectionId:"section",versionId:"version",lessonId:"outline",completed:true}}))
   .rejects.toThrow("Instructional lesson unavailable");
  expect(state.execute).not.toHaveBeenCalled();
 });
});
