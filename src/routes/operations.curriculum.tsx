import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useRef, useState } from "react";
import {uuidProgramSelectionSchema} from "@/lib/route-search";
import { CurriculumEditor } from "@/components/learning/CurriculumEditor";
import { PublisherPackComposer } from "@/components/learning/PublisherPackComposer";
import { CurriculumLibrary } from "@/components/learning/CurriculumLibrary";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { getCurriculumAdopterPrograms, getCurriculumMarketplace } from "@/modules/learning/curriculum-marketplace.functions";
import { getPublisherPackStudio } from "@/modules/learning/publisher-pack-authoring.functions";
import { createAuthoredCourse, getCurriculumStudio, startCurriculumDraft } from "@/modules/learning/curriculum-authoring.functions";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { CreateAction, EmptyState, secondaryActionClassName } from "@/components/workspace";

export const loadCurriculum=(programId?:string)=>safeLoader(async()=>{
  const programs=await getCurriculumAdopterPrograms();
  const programIds=programId?[programId]:programs.map(program=>program.id);
  const marketplaces=await Promise.all(programIds.map(programId=>getCurriculumMarketplace({data:{programId}})));
  const publisherProgram=marketplaces.find(market=>market.canPublish);
  const [studio,publisherPacks]=publisherProgram?await Promise.all([
   getCurriculumStudio({data:{programId:publisherProgram.program.id}}),
   getPublisherPackStudio({data:{programId:publisherProgram.program.id}}),
  ]):[null,null];
  return {programs,marketplaces,studio,publisherPacks};
 },{authMessage:"Sign in with an authorized school curriculum membership."})();
export const Route=createFileRoute("/operations/curriculum")({
 validateSearch:(search:Record<string,unknown>)=>uuidProgramSelectionSchema.parse(search),
 loaderDeps:({search})=>({programId:search.programId}),
 loader:({deps})=>loadCurriculum(deps.programId),
 component:CurriculumPage,
});
function CurriculumPage(){
 const outcome=Route.useLoaderData();
 if(!outcome.ok)return <LoaderFailure title="Curriculum" outcome={outcome}/>;
 return <CurriculumView key={outcome.data.studio?.programId??"none"} data={outcome.data}/>;
}
export function CurriculumView({data,mode="library",courseId}:{mode?:"library"|"create"|"author"|"publish";courseId?:string;data:{
 programs:Awaited<ReturnType<typeof getCurriculumAdopterPrograms>>;
 marketplaces:Awaited<ReturnType<typeof getCurriculumMarketplace>>[];
 studio:Awaited<ReturnType<typeof getCurriculumStudio>>|null;
 publisherPacks:Awaited<ReturnType<typeof getPublisherPackStudio>>|null;
}}){
 const router=useRouter();
 const mutation=useMutationFeedback(()=>router.invalidate());
 const busy=mutation.pending||mutation.refreshFailed;
 const [code,setCode]=useState(""),[title,setTitle]=useState(""),[subject,setSubject]=useState("");
 const [courseAttempted,setCourseAttempted]=useState(false);
 const requestId=useRef<string|null>(null);
 const draftRequests=useRef(new Map<string,string>());
 const studio=data.studio;
 const selectedCourse=studio?.courses.find(course=>course.id===courseId);
 return <WorkspaceShell title={mode==="create"?"Create course":mode==="author"?selectedCourse?.title??"Course unavailable":mode==="publish"?"Publish curriculum":"Curriculum library"} eyebrow="Academic operations" width="wide"
  breadcrumbs={mode!=="library"?<Link to="/operations/curriculum" search={{programId:studio?.programId}} className="underline">Curriculum library</Link>:undefined}
  actions={studio&&mode==="library"?<div className="flex flex-wrap gap-2">
   <CreateAction><Link to="/operations/curriculum/new" search={{programId:studio.programId}}>Create course</Link></CreateAction>
   <Link to="/operations/curriculum/publishing" search={{programId:studio.programId}} className={secondaryActionClassName}>Publishing</Link>
  </div>:undefined}>
  <div className="space-y-8 pt-6">
  {data.programs.length>1&&<nav aria-label="Curriculum program scope" className="flex flex-wrap gap-3">
   <Link to="/operations/curriculum" search={{}} aria-current={data.marketplaces.length>1?"page":undefined}
    className="rounded border px-3 py-2 text-sm">All programs</Link>
   {data.programs.map(program=>
   <Link key={program.id} to="/operations/curriculum" search={{programId:program.id}} aria-current={data.marketplaces.length===1&&data.marketplaces[0]?.program.id===program.id?"page":undefined}
    className="rounded border px-3 py-2 text-sm">{program.name}</Link>)}</nav>}
  {!data.programs.length&&<p role="status">No curriculum access grants are available in this membership. An administrator must assign institutional curriculum authority.</p>}
  {mode==="library"&&<CurriculumLibrary marketplaces={data.marketplaces}/>}
  {!studio&&mode!=="library"&&<EmptyState title="Publisher workspace unavailable" description="No authorized publishing Program is available in this scope."/>}
  {studio&&<div className="space-y-6">
   {mode!=="library"&&<>
   <p className="text-sm text-muted-foreground">Author reusable courses and immutable releases with your institutional publisher grant. Existing classes keep their pinned version.</p>
   <MutationFeedback state={mutation} pendingMessage="Saving curriculum change..."/>
   <Link to="/launch/school/$programId" params={{programId:studio.programId}} className="inline-block text-sm underline">Use published releases in section setup</Link></>}
  {mode==="create"&&<form noValidate className="space-y-3" onSubmit={async event=>{
    event.preventDefault();
   setCourseAttempted(true);
   if(code.trim().length<2||!/^[A-Za-z0-9_-]+$/.test(code.trim())||title.trim().length<2||subject.trim().length<2)return;
    const requestIdValue=requestId.current??crypto.randomUUID();
    requestId.current=requestIdValue;
    await mutation.run(async()=>{
     await createAuthoredCourse({data:{programId:studio.programId,code,title,subject,requestId:requestIdValue}});
    requestId.current=null;setCode("");setTitle("");setSubject("");setCourseAttempted(false);
    },{
     successMessage:"Course created.",
     commandErrorMessage:"Unable to create course.",
    });
   }}>
    <h2 className="text-lg font-semibold">Create course</h2>
    <Field label="Course code" required error={courseAttempted&&code.trim().length<2?"Enter a course code with at least 2 characters.":courseAttempted&&!/^[A-Za-z0-9_-]+$/.test(code.trim())?"Use letters, numbers, underscores, or hyphens in the course code.":undefined}>
     <Input minLength={2} maxLength={32} pattern="[A-Za-z0-9_-]+" value={code} onChange={event=>{requestId.current=null;setCode(event.target.value);}}/>
    </Field>
    <Field label="Course title" required error={courseAttempted&&title.trim().length<2?"Enter a course title with at least 2 characters.":undefined}>
     <Input minLength={2} maxLength={160} value={title} onChange={event=>{requestId.current=null;setTitle(event.target.value);}}/>
    </Field>
    <Field label="Subject" required error={courseAttempted&&subject.trim().length<2?"Enter a subject with at least 2 characters.":undefined}>
     <Input minLength={2} maxLength={100} value={subject} onChange={event=>{requestId.current=null;setSubject(event.target.value);}}/>
    </Field>
    <Button type="submit" variant="outline" disabled={busy}>Create course</Button>
  </form>}
  {mode!=="create"&&(courseId?studio.courses.filter(course=>course.id===courseId):studio.courses).map(course=><section key={course.id} className="border-t py-5">
    <h2 className="text-xl font-semibold">{course.code} · {course.title}</h2><p className="text-sm">{course.subject}</p>
   <div className="mt-3 flex flex-wrap gap-3">
    <Link to="/operations/curriculum/$courseId" params={{courseId:course.id}} search={{programId:studio.programId}} className="text-sm underline">Author course</Link>
    <Link to="/operations/curriculum/publishing" search={{programId:studio.programId,course:course.id}} className="text-sm underline">Review publication</Link>
   </div>
   {mode==="author"&&!course.releases.some(release=>release.status==="draft")&&<button disabled={busy}
     className="mt-3 rounded border px-3 py-2 text-sm" onClick={async()=>{
      const source=course.releases.find(release=>release.status==="published");
      const key=course.id+":"+(source?.id??"empty");
      const id=draftRequests.current.get(key)??crypto.randomUUID();draftRequests.current.set(key,id);
      await mutation.run(
       ()=>startCurriculumDraft({data:{programId:studio.programId,courseId:course.id,sourceVersionId:source?.id,requestId:id}}),
       {successMessage:"Curriculum draft created.",commandErrorMessage:"Unable to create draft."},
      );
     }}>Create next draft{course.releases.length?" from latest release":""}</button>}
    {(mode==="author"||mode==="publish")&&course.releases.map(release=><details key={release.id} open={release.status==="draft"} className="mt-4 border-t pt-3">
     <summary>Version {release.version} · {release.status}{release.publishedAt?" · "+new Date(release.publishedAt).toLocaleDateString():""}</summary>
    {release.status==="draft"?<CurriculumEditor key={release.id} programId={studio.programId} courseCode={course.code} release={release} mode={mode==="publish"?"publish":"author"}
      onSaved={async()=>{await router.invalidate();}}/>:<div className="mt-3 text-sm">
       <p>Immutable published release. Existing sections remain pinned to their selected release.</p>
       <p>{release.content?.modules.length??0} modules · {release.content?.modules.reduce((count,module)=>count+module.lessons.length,0)??0} lessons</p>
       <p className="mt-2 whitespace-pre-wrap">{release.content?.syllabus??"No learning content configured."}</p>
      </div>}
    </details>)}
   </section>)}
  {courseId&&!selectedCourse&&<EmptyState title="Course unavailable" description="This course is unavailable in your authorized publisher scope."/>}
   {!studio.courses.length&&<p>No courses are owned by this program's organization yet.</p>}
  {mode==="publish"&&!courseId&&data.publisherPacks&&<PublisherPackComposer key={studio.programId} studio={data.publisherPacks} onSaved={async()=>{await router.invalidate();}}/>}
   </div>
  }
  </div>
 </WorkspaceShell>;
}
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
