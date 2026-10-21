import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { z } from "zod";
import { CurriculumEditor } from "@/components/learning/CurriculumEditor";
import { createAuthoredCourse, getCurriculumPrograms, getCurriculumStudio, startCurriculumDraft } from "@/modules/learning/curriculum-authoring.functions";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";

export const Route=createFileRoute("/operations/curriculum")({
 validateSearch:(search:Record<string,unknown>)=>z.object({programId:z.string().uuid().optional()}).parse(search),
 loaderDeps:({search})=>({programId:search.programId}),
 loader:({deps})=>safeLoader(async()=>({
  programs:await getCurriculumPrograms(),
  studio:deps.programId?await getCurriculumStudio({data:{programId:deps.programId}}):null,
 }),{authMessage:"Sign in with an explicitly authorized curriculum publisher membership."})(),
 component:CurriculumStudio,
});
function CurriculumStudio(){
 const outcome=Route.useLoaderData();
 if(!outcome.ok)return <LoaderFailure title="Curriculum Studio" outcome={outcome}/>;
 return <StudioView data={outcome.data}/>;
}
function StudioView({data}:{data:{
 programs:Awaited<ReturnType<typeof getCurriculumPrograms>>;studio:Awaited<ReturnType<typeof getCurriculumStudio>>|null;
}}){
 const router=useRouter();
 const [error,setError]=useState(""),[busy,setBusy]=useState(false);
 const [code,setCode]=useState(""),[title,setTitle]=useState(""),[subject,setSubject]=useState("");
 const requestId=useRef<string|null>(null);
 const draftRequests=useRef(new Map<string,string>());
 const studio=data.studio;
 return <main className="mx-auto max-w-5xl space-y-6 px-5 py-10">
  <h1 className="font-serif text-4xl">Curriculum Studio</h1>
  <Link to="/operations/curriculum-marketplace" search={{programId:studio?.programId}} className="inline-block rounded border px-3 py-2 text-sm underline">Browse curriculum marketplace →</Link>
  <p>Author reusable courses and immutable curriculum releases. Only an explicit institutional publisher grant permits changes.
   Courses are shared within the owning organization; existing classes keep their pinned version.</p>
  <nav aria-label="Curriculum program scope" className="flex flex-wrap gap-3">{data.programs.map(program=>
   <Link key={program.id} to="/operations/curriculum" search={{programId:program.id}} aria-current={studio?.programId===program.id?"page":undefined}
    className="rounded border px-3 py-2 text-sm">{program.name}</Link>)}</nav>
  {error&&<p role="alert" className="rounded border p-3">{error}</p>}
  {!studio&&<p>Select a program to verify your publisher authority and open its organization's curriculum.</p>}
  {!data.programs.length&&<p role="status">No curriculum publisher grants are available in this membership. An administrator must assign explicit institutional authority.</p>}
  {studio&&<>
   <Link to="/operations/launch/$programId" params={{programId:studio.programId}} className="inline-block text-sm underline">Use published releases in section setup</Link>
   <form className="space-y-3 rounded border p-4" onSubmit={async event=>{
    event.preventDefault();setBusy(true);setError("");
    requestId.current??=crypto.randomUUID();
    try{
     await createAuthoredCourse({data:{programId:studio.programId,code,title,subject,requestId:requestId.current}});
     requestId.current=null;setCode("");setTitle("");setSubject("");await router.invalidate();
    }catch(cause){setError(cause instanceof Error?cause.message:"Unable to create course");}
    finally{setBusy(false);}
   }}>
    <h2 className="text-lg font-semibold">Create course</h2>
    <label className="block text-sm">Course code<input required minLength={2} maxLength={32} pattern="[A-Za-z0-9_-]+"
     value={code} onChange={event=>{requestId.current=null;setCode(event.target.value);}} className="ml-3 rounded border bg-background p-2"/></label>
    <label className="block text-sm">Course title<input required minLength={2} maxLength={160}
     value={title} onChange={event=>{requestId.current=null;setTitle(event.target.value);}} className="ml-3 rounded border bg-background p-2"/></label>
    <label className="block text-sm">Subject<input required minLength={2} maxLength={100}
     value={subject} onChange={event=>{requestId.current=null;setSubject(event.target.value);}} className="ml-3 rounded border bg-background p-2"/></label>
    <button disabled={busy} className="rounded border px-4 py-2 text-sm">Create course</button>
   </form>
   {studio.courses.map(course=><section key={course.id} className="rounded border p-5">
    <h2 className="text-xl font-semibold">{course.code} · {course.title}</h2><p className="text-sm">{course.subject}</p>
    {!course.releases.some(release=>release.status==="draft")&&<button disabled={busy}
     className="mt-3 rounded border px-3 py-2 text-sm" onClick={async()=>{
      setBusy(true);setError("");
      const source=course.releases.find(release=>release.status==="published");
      const key=course.id+":"+(source?.id??"empty");
      const id=draftRequests.current.get(key)??crypto.randomUUID();draftRequests.current.set(key,id);
      try{await startCurriculumDraft({data:{programId:studio.programId,courseId:course.id,sourceVersionId:source?.id,requestId:id}});
       await router.invalidate();
      }catch(cause){setError(cause instanceof Error?cause.message:"Unable to create draft");}
      finally{setBusy(false);}
     }}>Create next draft{course.releases.length?" from latest release":""}</button>}
    {course.releases.map(release=><details key={release.id} open={release.status==="draft"} className="mt-4 border-t pt-3">
     <summary>Version {release.version} · {release.status}{release.publishedAt?" · "+new Date(release.publishedAt).toLocaleDateString():""}</summary>
     {release.status==="draft"?<CurriculumEditor key={release.id} programId={studio.programId} release={release}
      onSaved={async()=>{await router.invalidate();}}/>:<div className="mt-3 text-sm">
       <p>Immutable published release. Existing sections remain pinned to their selected release.</p>
       <p>{release.content?.modules.length??0} modules · {release.content?.modules.reduce((count,module)=>count+module.lessons.length,0)??0} lessons</p>
       <p className="mt-2 whitespace-pre-wrap">{release.content?.syllabus??"No learning content configured."}</p>
      </div>}
    </details>)}
   </section>)}
   {!studio.courses.length&&<p>No courses are owned by this program's organization yet.</p>}
  </>}
 </main>;
}
