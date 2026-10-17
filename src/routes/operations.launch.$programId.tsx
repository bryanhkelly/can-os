import {useState} from "react";
import {createFileRoute,Link,useRouter} from "@tanstack/react-router";
import {getLaunchAcademicSetup,provisionLaunchSection,assignLaunchTeacher} from "@/modules/programs/launch-academics.functions";
import {safeLoader} from "@/lib/safe-loader";
import {LoaderFailure} from "@/lib/loader-failure";
import {WorkspaceShell} from "@/components/workspace";
export const Route=createFileRoute("/operations/launch/$programId")({
 loader:({params})=>safeLoader(()=>getLaunchAcademicSetup({data:{programId:params.programId}}),
  {authMessage:"Sign in with a registrar grant for this program."}),
 component:LaunchAcademicSetup
});
function LaunchAcademicSetup(){
 const result=Route.useLoaderData();
 if(!result.ok)return <LoaderFailure eyebrow="CAN OS · School launch" title="Academic provisioning" outcome={result}/>;
 return <Setup data={result.data}/>;
}
type Snapshot=Awaited<ReturnType<typeof getLaunchAcademicSetup>>;
function Setup({data}:{data:Snapshot}){
 const router=useRouter();
 const [termId,setTermId]=useState(data.terms[0]?.id??"");
 const [versionId,setVersionId]=useState(data.catalog[0]?.versionId??"");
 const [code,setCode]=useState(""),[title,setTitle]=useState("");
 const [teacherId,setTeacherId]=useState("");
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 async function run(operation:()=>Promise<unknown>,message:string){
  setBusy(true);setError("");setNotice("");
  try{await operation();await router.invalidate();setNotice(message);}
  catch(e){setError(e instanceof Error?e.message:"Unable to save launch setup");}
  finally{setBusy(false);}
 }
 return <WorkspaceShell eyebrow="CAN OS · School launch" title={data.program.name+" · academic setup"}
  subtitle="Turn a launch journey into an actual instructional program with school-year dates, published course content and assigned instructors."
  actions={<Link to="/operations/launch" className="rounded-lg border px-3 py-2 text-sm">Launch checklist →</Link>}>
  {error&&<p role="alert" className="mt-5 rounded-lg border border-red-500 p-3 text-sm">{error}</p>}
  {notice&&<p role="status" className="mt-5 rounded-lg border p-3 text-sm">{notice}</p>}
  <div className="mt-7 grid gap-3 sm:grid-cols-3">
   {[
    ["School years",data.years.length],
    ["Published course versions",data.catalog.length],
    ["Sections provisioned",data.sections.length],
   ].map(([label,count])=><div key={label} className="rounded-xl border bg-card p-4">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="mt-1 font-serif text-3xl">{count}</p>
   </div>)}
  </div>
  {!data.years.length&&<p className="mt-6 rounded-lg border p-4 text-sm">
   This program has no configured academic year. <Link to="/operations/school-years" className="underline">Set up the school year →</Link>
  </p>}
  {!data.catalog.length&&<p className="mt-6 rounded-lg border p-4 text-sm">
   No published course templates are available from this program's academic provider. Publish curriculum before creating sections.
  </p>}
  <section className="mt-7 rounded-xl border bg-card p-5">
   <h2 className="font-serif text-2xl">Provision a class</h2>
   <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={e=>{
    e.preventDefault();void run(()=>provisionLaunchSection({data:{
     programId:data.program.id,termId,courseTemplateVersionId:versionId,
     code,title,...(teacherId?{teacherPersonId:teacherId}:{})}}),"Class provisioned.");
   }}>
    <label className="text-sm">Academic term<select required value={termId} onChange={e=>setTermId(e.target.value)} className="mt-1 block w-full rounded border bg-background p-2">
     <option value="">Choose term</option>{data.terms.map(t=><option key={t.id} value={t.id}>{t.name} ({t.startsOn}–{t.endsOn})</option>)}
    </select></label>
    <label className="text-sm">Published curriculum<select required value={versionId} onChange={e=>setVersionId(e.target.value)} className="mt-1 block w-full rounded border bg-background p-2">
     <option value="">Choose curriculum</option>{data.catalog.map(x=><option key={x.versionId} value={x.versionId}>{x.title} · v{x.version}</option>)}
    </select></label>
    <label className="text-sm">Class code<input value={code} required onChange={e=>setCode(e.target.value)} placeholder="BIO-101-A" className="mt-1 block w-full rounded border bg-background p-2"/></label>
    <label className="text-sm">Class title<input value={title} required onChange={e=>setTitle(e.target.value)} placeholder="Biology I" className="mt-1 block w-full rounded border bg-background p-2"/></label>
    <label className="text-sm sm:col-span-2">Instructor (optional)<select value={teacherId} onChange={e=>setTeacherId(e.target.value)} className="mt-1 block w-full rounded border bg-background p-2">
     <option value="">Assign later</option>{data.teachingStaff.map(t=><option value={t.personId} key={t.personId}>{t.first} {t.last}</option>)}
    </select></label>
    <button type="submit" disabled={busy||!termId||!versionId} className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50">Create section</button>
   </form>
  </section>
  <section className="mt-8 space-y-3">
   <h2 className="font-serif text-2xl">Teaching assignments</h2>
   {data.sections.map(section=><SectionRow key={section.id} section={section}
    staff={data.teachingStaff} busy={busy}
    assign={(personId)=>run(()=>assignLaunchTeacher({data:{
     programId:data.program.id,sectionId:section.id,teacherPersonId:personId}}),"Instructor assigned.")}/>)}
   {!data.sections.length&&<p className="rounded-lg border p-4 text-sm text-muted-foreground">No sections have been provisioned for this program.</p>}
  </section>
 </WorkspaceShell>;
}
function SectionRow({section,staff,busy,assign}:{
 section:Snapshot["sections"][number],staff:Snapshot["teachingStaff"],busy:boolean,
 assign:(personId:string)=>Promise<void>
}){
 const [personId,setPersonId]=useState("");
 return <article className="rounded-lg border bg-card p-4">
  <h3 className="font-semibold">{section.title} · {section.code}</h3>
  <p className="mt-2 text-xs text-muted-foreground">
   {section.teachers.length?section.teachers.map(t=>t.first+" "+t.last).join(", "):"Instructor not yet assigned"}
  </p>
  <div className="mt-3 flex flex-wrap items-end gap-2">
   <label className="min-w-48 flex-1 text-xs">Assign instructor<select className="mt-1 block w-full rounded border bg-background p-2" value={personId} onChange={e=>setPersonId(e.target.value)}>
    <option value="">Choose teacher</option>{staff.filter(t=>!section.teachers.some(a=>a.personId===t.personId))
      .map(t=><option key={t.personId} value={t.personId}>{t.first} {t.last}</option>)}
   </select></label>
   <button type="button" disabled={busy||!personId} onClick={()=>assign(personId)}
    className="rounded border px-3 py-2 text-sm disabled:opacity-50">Assign teacher</button>
  </div>
 </article>;
}
