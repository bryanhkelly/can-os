import {useState} from "react";
import {createFileRoute,Link,useRouter} from "@tanstack/react-router";
import {getLaunchAcademicSetup,provisionLaunchSection,assignLaunchTeacher,publishLaunchTeacherPolicy,setLaunchSectionCredits} from "@/modules/programs/launch-academics.functions";
import {safeLoader} from "@/lib/safe-loader";
import {LoaderFailure} from "@/lib/loader-failure";
import {WorkspaceShell} from "@/components/workspace";
import { ProgramSiteAuthorizationPanel } from "@/components/operations/ProgramSiteAuthorizationPanel";
import { LocalSiteDelegationPanel } from "@/components/operations/LocalSiteDelegationPanel";
import {SectionLifecycleWorkspace} from "@/components/operations/SectionLifecycleManager";
import {Qualifications} from "@/components/profiles/Qualifications";
import {QualificationCatalog} from "@/components/profiles/QualificationCatalog";
import {TeacherPolicyRevisions} from "@/components/profiles/TeacherPolicyRevisions";
export const Route=createFileRoute("/operations/launch/$programId")({
 loader:({params})=>safeLoader(()=>getLaunchAcademicSetup({data:{programId:params.programId}}),
  {authMessage:"Sign in with a registrar grant for this program."})(),
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
 const selectedTerm=data.terms.find(t=>t.id===termId);
 const selectedYear=data.years.find(y=>y.id===selectedTerm?.schoolYearId);
 const selectedCourse=data.catalog.find(course=>course.versionId===versionId);
 const [code,setCode]=useState(""),[title,setTitle]=useState("");
 const [teacherId,setTeacherId]=useState("");
 const [courseCredits,setCourseCredits]=useState("");
 const [qualificationKeys,setQualificationKeys]=useState<string[]>([]);
 const [policyConfirmed,setPolicyConfirmed]=useState(false);
 const [reviewTeacherId,setReviewTeacherId]=useState("");
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 async function run(operation:()=>Promise<unknown>,message:string){
  setBusy(true);setError("");setNotice("");
  try{await operation();await router.invalidate();setNotice(message);}
  catch(e){setError(e instanceof Error?e.message:"Unable to save launch setup");}
  finally{setBusy(false);}
 }
 return <WorkspaceShell eyebrow="CAN OS · School launch" title={data.program.name+" · academic setup"}
  subtitle="Turn a launch journey into an actual instructional program with school-year dates, published course content and assigned instructors."
  actions={<Link to="/operations/launch" search={{siteId:data.program.siteId??undefined,programId:data.program.id}} className="rounded-lg border px-3 py-2 text-sm">Launch checklist →</Link>}>
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
  <ProgramSiteAuthorizationPanel programId={data.program.id}/>
  {data.program.siteId && <LocalSiteDelegationPanel programId={data.program.id}/> }
  {!data.years.length&&<p className="mt-6 rounded-lg border p-4 text-sm">
   This program has no configured academic year. <Link to="/operations/school-years" search={{siteId:data.program.siteId??undefined,programId:data.program.id}} className="underline">Set up the school year →</Link>
  </p>}
  {!data.catalog.length&&<p className="mt-6 rounded-lg border p-4 text-sm">
   No published course templates are available from this program's academic provider. Publish curriculum before creating sections.
  </p>}
  <QualificationCatalog programId={data.program.id} canAuthor={data.canAuthorCatalog}
   changed={async()=>{await router.invalidate();}}/>
  <section className="mt-7 rounded-xl border bg-card p-5">
   <h2 className="font-serif text-2xl">Teacher qualification policy</h2>
   {data.policyPublished?<p className="mt-3 text-sm">Program requirements are published. Each instructor is checked against every applicable published policy for the full instructional window.</p>:
    !data.canPublishTeacherPolicy?<p className="mt-3 text-sm">Only a verified, program-scoped institutional staffing-policy publisher can approve the initial teacher qualification requirements. Ask your school administrator to assign that authority.</p>:
    <form className="mt-3 space-y-3" onSubmit={e=>{
     e.preventDefault();void run(()=>publishLaunchTeacherPolicy({data:{
      programId:data.program.id,qualificationKeys,confirmed:true}}),"Teacher qualification policy published.");
    }}>
     <p className="text-sm">Assignment and opening require applicable published policies. Publish this program's reviewed requirements here; jurisdiction, organization and site policies also apply. Select every required qualification; all must be independently verified. Publishing does not certify legal or regulatory compliance.</p>
     <div className="space-y-2">{data.qualificationCatalog.map(qualification=>
      <label key={qualification.key} className="flex items-center gap-2 text-sm">
       <input type="checkbox" checked={qualificationKeys.includes(qualification.key)} onChange={e=>
        setQualificationKeys(keys=>e.target.checked?[...keys,qualification.key]:keys.filter(key=>key!==qualification.key))}/>
       {qualification.title} <span className="text-xs text-muted-foreground">({qualification.key})</span>
      </label>)}</div>
     {!data.qualificationCatalog.length&&<p role="alert" className="text-sm">No qualification catalog entries exist. Configure the shared qualification catalog before publishing requirements.</p>}
     <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={policyConfirmed}
      onChange={e=>setPolicyConfirmed(e.target.checked)}/>
      I confirm these requirements are reviewed for this program and apply to its instructional dates. Published requirements cannot be edited here.
     </label>
     <button disabled={busy||!policyConfirmed||!qualificationKeys.length} type="submit"
      className="rounded border px-3 py-2 text-sm disabled:opacity-50">Publish reviewed requirements</button>
    </form>}
   <TeacherPolicyRevisions programId={data.program.id} policies={data.teacherPolicies}
    catalog={data.qualificationCatalog} canRevise={data.canReviseTeacherPolicy}
    changed={async()=>{await router.invalidate();}}/>
  </section>
  <section className="mt-7 rounded-xl border bg-card p-5">
   <h2 className="font-serif text-2xl">Provision a class</h2>
   <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={e=>{
    e.preventDefault();void run(()=>provisionLaunchSection({data:{
     programId:data.program.id,termId,courseTemplateVersionId:versionId,
     code,title,...(teacherId?{teacherPersonId:teacherId}:{}),
     ...(courseCredits.trim()?{credits:Number(courseCredits)}:{})}}),"Class provisioned.");
   }}>
    <label className="text-sm">Academic term<select required value={termId} onChange={e=>setTermId(e.target.value)} className="mt-1 block w-full rounded border bg-background p-2">
     <option value="">Choose term</option>{data.terms.map(t=><option key={t.id} value={t.id}>{data.years.find(y=>y.id===t.schoolYearId)?.name??"School year"} · {t.name} ({t.startsOn}–{t.endsOn})</option>)}
    </select></label>
    <label className="text-sm">Published curriculum<select required value={versionId} onChange={e=>setVersionId(e.target.value)} className="mt-1 block w-full rounded border bg-background p-2">
     <option value="">Choose curriculum</option>{data.catalog.map(x=><option key={x.versionId} value={x.versionId}>
      {x.code} · {x.title} · v{x.version} · {x.origin==="adopted"?`Adopted from ${x.publisherName}`:"Institution-owned"}
     </option>)}
    </select></label>
    {selectedTerm&&<div className="sm:col-span-2 rounded border p-3 text-sm" role="status">
      <p>Scheduling for <strong>{selectedYear?.name??"the selected school year"}</strong> · {selectedTerm.name}.</p>
      {selectedCourse&&<p className="mt-1">
        Course release: {selectedCourse.code} · v{selectedCourse.version} ·
        {selectedCourse.origin==="adopted"?` Adopted publisher: ${selectedCourse.publisherName} · Pack: ${selectedCourse.packName}`:" Institution-owned curriculum"}.
        Existing sections retain their pinned version.
      </p>}
      <p className="mt-1 text-xs text-muted-foreground">Adoption eligibility is currently program-scoped, not yet versioned by academic year. Annual adoption rollover is a separate release.</p>
    </div>}
    <label className="text-sm">Class code<input value={code} required onChange={e=>setCode(e.target.value)} placeholder="BIO-101-A" className="mt-1 block w-full rounded border bg-background p-2"/></label>
    <label className="text-sm">Class title<input value={title} required onChange={e=>setTitle(e.target.value)} placeholder="Biology I" className="mt-1 block w-full rounded border bg-background p-2"/></label>
    <label className="text-sm sm:col-span-2">Instructor (optional)<select value={teacherId} onChange={e=>setTeacherId(e.target.value)} className="mt-1 block w-full rounded border bg-background p-2">
     <option value="">Assign later</option>{data.teachingStaff.map(t=><option value={t.personId} key={t.personId}>{t.first} {t.last}</option>)}
    </select></label>
    <label className="text-sm sm:col-span-2">Course credit units
     <input aria-label="Credit units for new section" type="number" min="0.01" max="10" step="0.01"
      value={courseCredits} onChange={e=>setCourseCredits(e.target.value)} placeholder="E.g. 0.50 or 1.00"
      className="mt-1 block w-full rounded border bg-background p-2"/>
     <span className="mt-1 block text-xs text-muted-foreground">Enter reviewed course credits. Missing units are shown as Not recorded on transcripts and must be resolved separately for graduation decisions.</span>
    </label>
    <button type="submit" disabled={busy||!termId||!versionId} className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50">Create section</button>
   </form>
  </section>
  <div className="mt-6 rounded-lg border p-4 text-sm">
   After provisioning sections, <Link to="/operations/course-policies" search={{siteId:data.program.siteId??undefined,programId:data.program.id}} className="font-semibold underline">
    configure enrollment windows, prerequisites, seat capacity and credit limits →
   </Link>
  </div>
  <section className="mt-8 space-y-3">
   <h2 className="font-serif text-2xl">Teaching assignments</h2>
   {data.sections.map(section=><SectionRow key={section.id+":"+String(section.creditUnits)} section={section}
    staff={data.teachingStaff} busy={busy}
    saveCredits={(credits,reason)=>run(()=>setLaunchSectionCredits({data:{
     programId:data.program.id,sectionId:section.id,credits,reason}}),"Academic credit units recorded.")}
    assign={(personId)=>run(()=>assignLaunchTeacher({data:{
     programId:data.program.id,sectionId:section.id,teacherPersonId:personId}}),"Instructor assigned.")}/>)}
   {!data.sections.length&&<p className="rounded-lg border p-4 text-sm text-muted-foreground">No sections have been provisioned for this program.</p>}
  </section>
  <section className="mt-7 rounded-xl border bg-card p-5">
   <h2 className="font-serif text-2xl">Independent credential review</h2>
   <p className="mt-2 text-sm">Teachers submit private evidence from their own profile. Review here requires an explicit credential-verifier grant and an institutional relationship; publishing requirements alone does not grant review authority.</p>
   <label className="mt-3 block text-sm">Teacher to review<select value={reviewTeacherId}
    onChange={event=>setReviewTeacherId(event.target.value)} className="mt-1 block w-full rounded border bg-background p-2">
    <option value="">Choose teacher</option>{data.teachingStaff.map(teacher=>
     <option key={teacher.personId} value={teacher.personId}>{teacher.first} {teacher.last}</option>)}
   </select></label>
   {reviewTeacherId&&<Qualifications key={reviewTeacherId} personId={reviewTeacherId}
    programId={data.program.id} onChanged={async()=>{await router.invalidate();}}/>}
  </section>
  <SectionLifecycleWorkspace programId={data.program.id} staff={data.teachingStaff}/>
 </WorkspaceShell>;
}
function SectionRow({section,staff,busy,assign,saveCredits}:{
 section:Snapshot["sections"][number],staff:Snapshot["teachingStaff"],busy:boolean,
 assign:(personId:string)=>Promise<void>,
 saveCredits:(credits:number,reason:string)=>Promise<void>
}){
 const [personId,setPersonId]=useState("");
 const [credits,setCredits]=useState(section.creditUnits?.toString()??"");
 const [creditReason,setCreditReason]=useState("");
 const candidate=section.candidates.find(candidate=>candidate.personId===personId);
 return <article className="rounded-lg border bg-card p-4">
  <h3 className="font-semibold">{section.title} · {section.code}</h3>
  <p className="mt-2 text-xs text-muted-foreground">
   {section.teachers.length?section.teachers.map(t=>t.first+" "+t.last).join(", "):"Instructor not yet assigned"}
  </p>
  <form className="mt-3 grid gap-2 sm:grid-cols-[1fr_2fr_auto] sm:items-end" onSubmit={e=>{
    e.preventDefault();void saveCredits(Number(credits),creditReason);
   }}>
    <label className="text-xs">Recorded credit units
     <input type="number" min="0.01" max="10" step="0.01" required value={credits}
      onChange={e=>setCredits(e.target.value)} className="mt-1 w-full rounded border bg-background p-2"/>
    </label>
    <label className="text-xs">Reason for academic credit decision
     <input value={creditReason} minLength={5} maxLength={500} required
      onChange={e=>setCreditReason(e.target.value)}
      placeholder="Reviewed against this program's course credit requirements"
      className="mt-1 w-full rounded border bg-background p-2"/>
    </label>
    <button type="submit" disabled={busy||!credits||creditReason.trim().length<5}
      className="rounded border px-3 py-2 text-xs disabled:opacity-50">Record credits</button>
   </form>
   <p className="mt-2 text-xs text-muted-foreground">The school sets actual credit units. Changes are audited and locked after finalized grades.</p>
   <div className="mt-3 grid gap-2 sm:grid-cols-4">
   <div className="rounded border p-2 text-xs"><span className="text-muted-foreground">Enrollment</span><br/>{section.readiness.metrics.activeEnrollment}/{section.readiness.metrics.enrollmentCapacity}</div>
   <div className="rounded border p-2 text-xs"><span className="text-muted-foreground">Forecast</span><br/>{section.readiness.metrics.expectedDemand??"Not set"}</div>
   <div className="rounded border p-2 text-xs"><span className="text-muted-foreground">Reserved seats</span><br/>{section.readiness.metrics.reservedInstructionalSeats}</div>
   <div className="rounded border p-2 text-xs"><span className="text-muted-foreground">Readiness</span><br/>{section.readiness.ready?"Ready":"Needs attention"}</div>
  </div>
  <div className="mt-3 flex flex-wrap gap-2">
   {section.readiness.items.filter(item=>item.state!=="ready").map(item=>
    <span key={item.key} className="rounded border px-2 py-1 text-xs">
     {item.state==="blocked"?"Blocked":"Review"} · {item.message}
    </span>)}
  </div>
  <div className="mt-3 flex flex-wrap items-end gap-2">
   <label className="min-w-48 flex-1 text-xs">Assign instructor<select className="mt-1 block w-full rounded border bg-background p-2" value={personId} onChange={e=>setPersonId(e.target.value)}>
    <option value="">Choose teacher</option>{staff.filter(t=>!section.teachers.some(a=>a.personId===t.personId))
      .map(t=><option key={t.personId} value={t.personId}>{t.first} {t.last}</option>)}
   </select></label>
   <button type="button" disabled={busy||!section.active||!personId||!candidate?.eligible} onClick={()=>assign(personId)}
    className="rounded border px-3 py-2 text-sm disabled:opacity-50">Add instructor</button>
  </div>
  {candidate&&<div className="mt-3 text-sm" role="status">
   <p>Instructional coverage: {candidate.from} to {candidate.through} (end exclusive).</p>
   {candidate.eligible?<p>Eligible for this instructional window. Existing co-teachers retain their assignments.</p>:
    <ul className="list-inside list-disc">{candidate.reasons.map(reason=><li key={reason}>{reason}</li>)}</ul>}
  </div>}
 </article>;
}
