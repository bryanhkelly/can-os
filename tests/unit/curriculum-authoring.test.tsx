import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClassContent } from "@/domain/class-content";
import { assertPublishableCurriculum, curriculumDraftContent } from "@/domain/curriculum-authoring";
import { CurriculumEditor } from "@/components/learning/CurriculumEditor";
import { Route } from "@/routes/operations.curriculum";
import { createAuthoredCourse, publishAuthoredCurriculum, saveAuthoredCurriculum } from "@/modules/learning/curriculum-authoring.functions";

const state=vi.hoisted(()=>({
 data:null as unknown,
 actor:{role:"registrar",actorPersonId:"publisher",capabilities:new Set(["curriculum.publish"]),scope:{}},
 save:vi.fn(),publish:vi.fn(),create:vi.fn(),draft:vi.fn(),
}));
vi.mock("@/modules/learning/curriculum-authoring.server",()=>({
 saveCurriculumDraft:state.save,publishCurriculumDraft:state.publish,createCurriculumCourse:state.create,
 createCurriculumDraft:state.draft,readCurriculumStudio:vi.fn(),readCurriculumPrograms:vi.fn(),
}));
vi.mock("@/modules/identity/command-context.server",()=>({getCommandContext:async()=>state.actor}));
vi.mock("@tanstack/react-start/server",()=>({getRequest:()=>new Request("http://localhost"),setResponseHeader:vi.fn()}));
vi.mock("@tanstack/react-start",()=>({
 createServerFn:()=>({
  parse:(value:unknown)=>value,
  validator(parse:(value:unknown)=>unknown){this.parse=parse;return this;},
  handler(callback:(input:{data:unknown})=>unknown){
   return async(input?:{data:unknown})=>callback({data:this.parse(input?.data)});
  },
 }),
}));
vi.mock("@tanstack/react-router",()=>({
 createFileRoute:()=>(options:object)=>({options,useLoaderData:()=>state.data}),
 useRouter:()=>({invalidate:vi.fn()}),
 Link:({children}:{children:React.ReactNode})=><a>{children}</a>,
}));
const content:ClassContent={version:1,syllabus:"Science syllabus",
 modules:[{id:"module",title:"Observe",lessons:[{id:"lesson",title:"Evidence",body:"Read and observe.",resources:[]}]}],
 resources:[{id:"resource",title:"Library",url:"https://www.loc.gov/"}]};
const ids={programId:"a1000000-0000-4000-8000-000000000001",
 versionId:"a1000000-0000-4000-8000-000000000002",expectedRevision:"a".repeat(64)};
beforeEach(()=>{
 vi.clearAllMocks();state.data=null;state.actor.role="registrar";state.actor.capabilities=new Set(["curriculum.publish"]);
});
describe("curriculum release contract",()=>{
 it("accepts ordered modules, stable lessons and HTTPS resources",()=>{
  expect(curriculumDraftContent.parse(content)).toEqual(content);
  expect(()=>assertPublishableCurriculum(content)).not.toThrow();
 });
 it("permits incomplete drafts but not incomplete publication",()=>{
  const empty={version:1 as const,syllabus:"",modules:[],resources:[]};
  expect(curriculumDraftContent.parse(empty)).toEqual(empty);
  expect(()=>assertPublishableCurriculum(empty)).toThrow("syllabus");
  expect(()=>assertPublishableCurriculum({...empty,syllabus:"Review"})).toThrow("at least one lesson");
  expect(()=>assertPublishableCurriculum({...content,modules:[{id:"empty",title:"Empty",lessons:[]}]})).toThrow("at least one lesson");
  expect(()=>assertPublishableCurriculum({...content,modules:[{id:"module",title:"Observe",lessons:[
   {id:"lesson",title:"Evidence",body:"   ",resources:[]}]}]})).toThrow("reading content");
 });
 it.each(["http://example.com","javascript:alert(1)","https://user:password@example.com"])("rejects unsafe resource URL %s",url=>{
  expect(()=>curriculumDraftContent.parse({...content,resources:[{id:"resource",title:"Resource",url}]})).toThrow();
 });
 it("rejects unverified private-document publication",()=>{
  expect(()=>curriculumDraftContent.parse({...content,resources:[{id:"private",title:"Private document",documentId:ids.versionId}]}))
   .toThrow("HTTPS resources only");
 });
 it("rejects duplicate stable lesson IDs across modules",()=>{
  expect(()=>curriculumDraftContent.parse({...content,modules:[...content.modules,{...content.modules[0]!,id:"another"}]}))
   .toThrow("Duplicate lesson ID");
 });
 it("rejects blank titles and oversized combined content",()=>{
  expect(()=>curriculumDraftContent.parse({...content,modules:[{...content.modules[0]!,title:"   "}]})).toThrow("cannot be blank");
  expect(()=>curriculumDraftContent.parse({...content,modules:[{id:"large",title:"Large",lessons:Array.from({length:6},
   (_,index)=>({id:`lesson-${index}`,title:"Long",body:"x".repeat(100000),resources:[]}))}]})).toThrow("500,000");
 });
});
describe("curriculum public command boundaries",()=>{
 it("forwards a validated explicit publisher save",async()=>{
  await saveAuthoredCurriculum({data:{...ids,content}});
  expect(state.save).toHaveBeenCalledWith(state.actor,{...ids,content});
 });
 it("requires publication confirmation and reason",async()=>{
  for(const data of [{...ids,reason:"Reviewed release.",confirmed:false},{...ids,reason:"short",confirmed:true},
   {...ids,reason:"Reviewed release.",confirmed:true,actorPersonId:"injected"}]){
   await expect(publishAuthoredCurriculum({data})).rejects.toThrow();
  }
  expect(state.publish).not.toHaveBeenCalled();
 });
 it("denies a teacher even with the publisher capability",async()=>{
  state.actor.role="teacher";
  await expect(saveAuthoredCurriculum({data:{...ids,content}})).rejects.toThrow("registrar");
  expect(state.save).not.toHaveBeenCalled();
 });
 it("denies a registrar without the publisher session capability",async()=>{
  state.actor.capabilities=new Set();
  await expect(publishAuthoredCurriculum({data:{...ids,reason:"Reviewed curriculum release.",confirmed:true}})).rejects.toThrow();
  expect(state.publish).not.toHaveBeenCalled();
 });
 it("validates stable request identifiers and canonical course fields",async()=>{
  await expect(createAuthoredCourse({data:{programId:ids.programId,code:"SCI 101",title:"Science",subject:"Science",
   requestId:ids.versionId}})).rejects.toThrow();
  await expect(saveAuthoredCurriculum({data:{...ids,expectedRevision:"stale",content}})).rejects.toThrow();
  expect(state.create).not.toHaveBeenCalled();expect(state.save).not.toHaveBeenCalled();
 });
});
describe("curriculum studio presentation",()=>{
 it("offers a structured draft editor rather than a raw JSON store",()=>{
  const html=renderToStaticMarkup(<CurriculumEditor programId={ids.programId}
   release={{id:ids.versionId,revision:ids.expectedRevision,content}} onSaved={async()=>{}}/>);
  for(const label of ["Syllabus","Module title","Lesson title","Lesson reading","Add module","Add lesson","Add resource link","Save draft"])
   expect(html).toContain(label);
  expect(html).toContain("Publication is immutable and does not upgrade existing classes");
  expect(html).toContain('required="" minLength="10" maxLength="2000"');
  expect(html).toMatch(/<button type="submit" disabled=""[^>]*>Publish curriculum release<\/button>/);
 });
 it("renders structured lesson activities and authoring fields for real publisher drafts",()=>{
  const structured:ClassContent={...content,modules:[{...content.modules[0]!,
   lessons:[{...content.modules[0]!.lessons[0]!,
    learningTargets:["Recognize and explain a complete equivalent transformation"],
    standards:["A-REI.1"],estimatedMinutes:55,
    activities:[{id:"guided",kind:"guided_practice",title:"Guided fraction practice",
     instructions:"Show the same operation on both sides.",estimatedMinutes:12,evidence:"teacher_review"}],
   }],
  }]};
  expect(()=>assertPublishableCurriculum(structured)).not.toThrow();
  const html=renderToStaticMarkup(<CurriculumEditor programId={ids.programId}
   release={{id:ids.versionId,revision:ids.expectedRevision,content:structured}} onSaved={async()=>{}}/>);
  for(const text of ["Structured lesson activities","Add activity","Learning targets","Standards",
   "Total lesson minutes","Activity type","Student instructions","Guided fraction practice",
   "Move activity up","Remove activity"]){
    if(text==="Move activity up")continue; // Only rendered with 2+ activities.
    expect(html).toContain(text);
  }
  expect(html).toContain("teacher_review");
  expect(html).toContain("Show the same operation on both sides.");
 });
 it("renders empty publisher authority explicitly without exposing editing controls",()=>{
  state.data={ok:true,data:{programs:[],studio:null}};
  const Page=Route.options.component!;
  const html=renderToStaticMarkup(<Page/>);
  expect(html).toContain("No curriculum publisher grants");
  expect(html).not.toContain("Save draft");
 });
 it("shows immutable published releases without a draft editor",()=>{
  state.data={ok:true,data:{programs:[{id:ids.programId,name:"Academy"}],studio:{programId:ids.programId,courses:[
   {id:"course",code:"SCI",title:"Science",subject:"Science",releases:[
    {id:ids.versionId,version:1,status:"published",revision:ids.expectedRevision,content,publishedAt:null},
   ]},
  ]}}};
  const Page=Route.options.component!;
  const html=renderToStaticMarkup(<Page/>);
  expect(html).toContain("Immutable published release");
  expect(html).toContain("Create next draft");
  expect(html).not.toContain("Save draft");
 });
});
