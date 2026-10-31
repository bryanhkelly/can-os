import { LaunchTeacherQualificationPolicy } from "@/components/operations/LaunchTeacherQualificationPolicy";
import { useWorkspaceMutation } from "@/hooks/useWorkspaceMutation";
import { LaunchSectionRow } from "@/components/operations/LaunchSectionRow";
import {useState} from "react";
import { prepareLaunchAcademicYear } from "@/modules/programs/launch-year-preparation.functions";
import {Link,useRouter} from "@tanstack/react-router";
import {getLaunchAcademicSetup,provisionLaunchSection,assignLaunchTeacher,setLaunchSectionCredits} from "@/modules/programs/launch-academics.functions";
import {WorkspaceShell} from "@/components/workspace";
import { ProgramSiteAuthorizationPanel } from "@/components/operations/ProgramSiteAuthorizationPanel";
import { SchoolOpeningEvidencePanel } from "@/components/operations/SchoolOpeningEvidencePanel";
import { LocalSiteDelegationPanel } from "@/components/operations/LocalSiteDelegationPanel";
import { SectionFacilitatorPanel } from "@/components/operations/SectionFacilitatorPanel";
import {SectionLifecycleWorkspace} from "@/components/operations/SectionLifecycleManager";
import {Qualifications} from "@/components/profiles/Qualifications";
import {QualificationCatalog} from "@/components/profiles/QualificationCatalog";

export type Snapshot=Awaited<ReturnType<typeof getLaunchAcademicSetup>>;
export function LaunchAcademicSetupWorkspace({data}:{data:Snapshot}){
 const router=useRouter();
 const [termId,setTermId]=useState(data.terms[0]?.id??"");
 const [versionId,setVersionId]=useState(data.catalog.find(course=>course.recommendation.recommended)?.versionId??data.catalog[0]?.versionId??"");
 const selectedTerm=data.terms.find(t=>t.id===termId);
 const selectedYear=data.years.find(y=>y.id===selectedTerm?.schoolYearId);
 const selectedCourse=data.catalog.find(course=>course.versionId===versionId);
 const [code,setCode]=useState(""),[title,setTitle]=useState("");
 const [createdSectionId,setCreatedSectionId]=useState<string|null>(null);
 const [teacherId,setTeacherId]=useState("");
 const effectiveTeacherId=teacherId|| (data.teachingStaff.length===1?data.teachingStaff[0]!.personId:"");
 const [scheduleId,setScheduleId]=useState("");
 const suggestedSchedule=data.scheduleOptions.find(option=>option.schoolYearId===selectedTerm?.schoolYearId);
 const effectiveScheduleId=data.scheduleOptions.some(option=>option.id===scheduleId&&option.schoolYearId===selectedTerm?.schoolYearId)?scheduleId:suggestedSchedule?.id||"";
 const [courseCredits,setCourseCredits]=useState("");
 const [reviewTeacherId,setReviewTeacherId]=useState("");
 const [error,setError]=useState(""),[notice,setNotice]=useState("");
 const mutation=useWorkspaceMutation({mutationFn: (operation:()=>Promise<unknown>)=>operation(),invalidateRouter:()=>router.invalidate()});
 const busy=mutation.isSubmitting;
 async function run(operation:()=>Promise<unknown>,message:string){
  setError("");setNotice("");
  try{
   const submission=await mutation.submit(operation);
   if(submission.status === "ignored") return;
   if(submission.refreshError){setError("Saved successfully, but refresh failed. Reopen this workspace; do not resubmit.");return;}
   setNotice(message);
  }catch(e){setError(e instanceof Error?e.message:"Unable to save launch setup");}
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
  <ProgramSiteAuthorizationPanel key={data.program.id} programId={data.program.id}/>
  {(!data.academicAuthority.teacherAssignment||!data.academicAuthority.creditConfiguration)&&
   <p role="status" className="mt-4 rounded-lg border border-warning/40 p-4 text-sm">
    Current academic authority is incomplete. Existing assignments, credits and official records remain visible,
    but new instructor assignments or issuer-bearing credit changes are disabled until the required CAN–church
    agreement services are current. Planning and revocation remain available.
   </p>}
  {data.program.deliveryModel.onsite&&
    data.program.academicProviderOrganizationId!==data.program.organizationId&&
    <SchoolOpeningEvidencePanel programId={data.program.id}/>}
  {data.program.siteId && <>
    <LocalSiteDelegationPanel programId={data.program.id}/>
    <SectionFacilitatorPanel programId={data.program.id}/>
  </>}
  {!data.years.length&&<section className="mt-6 rounded-lg border p-4">
   <h2 className="font-semibold">Prepare the recommended school year</h2>
   <p className="mt-2 text-sm">Use the saved launch date to prepare a school year, standard grading scale,
    two terms, grading periods and a draft instructional calendar. Review local holidays,
    teaching schedules and instructional days before activation. This does not approve opening.</p>
   <div className="mt-3 flex flex-wrap gap-3">
    <button type="button" disabled={busy||!data.program.siteId}
     onClick={()=>void run(()=>prepareLaunchAcademicYear({data:{programId:data.program.id}}),
      "Academic year draft prepared. Review calendar and local operating dates before activation.")}
     className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50">
     Prepare recommended year
    </button>
    <Link to="/operations/school-years" search={{siteId:data.program.siteId??undefined,programId:data.program.id}}
     className="rounded-lg border px-4 py-2 text-sm font-semibold">Advanced school-year studio</Link>
   </div>
  </section>}
  <section className="mt-6 rounded-lg border p-4 text-sm" aria-label="Classroom setup guidance">
   <h2 className="font-semibold">Classroom setup prerequisites</h2>
   <ul className="mt-2 list-disc space-y-2 pl-5">
    {!data.terms.length&&<li>Prepare an academic year and its terms using the recommended-year action above.</li>}
    {!data.scheduleOptions.some(option=>option.schoolYearId===selectedTerm?.schoolYearId)&&<li>No instructional schedule exists for the selected year. <Link to="/operations/school-years" search={{siteId:data.program.siteId??undefined,programId:data.program.id}} className="underline">Configure and review a school-year schedule</Link>.</li>}
    {!data.catalog.some(course=>course.recommendation.recommended)&&<li>No available published course has an accessible first lesson. <Link to="/operations/curriculum" className="underline">Review and publish instruction-ready curriculum</Link>.</li>}
    {!data.teachingStaff.length&&<li>Assign an authorized instructor and verify qualifications using the staffing controls below.</li>}
    {!data.academicAuthority.teacherAssignment&&<li>Complete institutional instructional service authorization before assigning teachers.</li>}
    {data.terms.length>0&&data.scheduleOptions.some(option=>option.schoolYearId===selectedTerm?.schoolYearId)&&data.catalog.some(course=>course.recommendation.recommended)&&data.teachingStaff.length>0&&data.academicAuthority.teacherAssignment&&<li>Reviewed choices are available. The recommended course and a matching schedule are preselected; a sole authorized instructor is suggested but must be reviewed.</li>}
   </ul>
  </section>
  {!data.catalog.length&&<p className="mt-6 rounded-lg border p-4 text-sm">
   No published course templates are available from this program's academic provider. Publish curriculum before creating sections.
  </p>}
  <QualificationCatalog programId={data.program.id} canAuthor={data.canAuthorCatalog}
   changed={async()=>{await router.invalidate();}}/>
  <LaunchTeacherQualificationPolicy data={data} busy={busy} run={run}/>
  <section className="mt-7 rounded-xl border bg-card p-5">
   <h2 className="font-serif text-2xl">Set up your first classroom</h2>
   <p className="mt-2 text-sm">Choose a course, term and instructor together. This saves the real Section and teacher assignment; scheduling and first-week readiness remain explicit checks, not automatic approvals.</p>
   <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={e=>{
    e.preventDefault();void run(async()=>{const result=await provisionLaunchSection({data:{
     programId:data.program.id,termId,courseTemplateVersionId:versionId,
     code:code.trim()||(selectedCourse?selectedCourse.code+"-A":""),title:title.trim()||selectedCourse?.title||"",teacherPersonId:effectiveTeacherId,scheduleTemplateId:effectiveScheduleId,
     ...(courseCredits.trim()?{credits:Number(courseCredits)}:{})}});setCreatedSectionId(result.sectionId);},"Class saved. Review its schedule and first-week readiness below.");
   }}>
    <label className="text-sm">Academic term<select required value={termId} onChange={e=>setTermId(e.target.value)} className="mt-1 block w-full rounded border bg-background p-2">
     <option value="">Choose term</option>{data.terms.map(t=><option key={t.id} value={t.id}>{data.years.find(y=>y.id===t.schoolYearId)?.name??"School year"} · {t.name} ({t.startsOn}–{t.endsOn})</option>)}
    </select></label>
    <label className="text-sm">Published curriculum<select required value={versionId} onChange={e=>setVersionId(e.target.value)} className="mt-1 block w-full rounded border bg-background p-2">
     <option value="">Choose curriculum</option>{data.catalog.map(x=><option key={x.versionId} value={x.versionId}>
      {x.code} · {x.title} · v{x.version} · {x.origin==="adopted"?`Adopted from ${x.publisherName}`:"Institution-owned"} · {x.recommendation.recommended?"Recommended for a first class":"Needs instructional content"}
     </option>)}
    </select></label>
    {selectedTerm&&<div className="sm:col-span-2 rounded border p-3 text-sm" role="status">
      <p>Scheduling for <strong>{selectedYear?.name??"the selected school year"}</strong> · {selectedTerm.name}.</p>
      {selectedCourse&&<div className="mt-1">
        <p>Course release: {selectedCourse.code} · v{selectedCourse.version} ·
        {selectedCourse.origin==="adopted"?` Adopted publisher: ${selectedCourse.publisherName} · Pack: ${selectedCourse.packName}`:" Institution-owned curriculum"}.
        Existing sections retain their pinned version.</p>
        <p className="mt-2 font-medium">{selectedCourse.recommendation.recommended?"Recommended course option":"Content blocker"}</p>
        <p className="mt-1">{selectedCourse.recommendation.explanation}</p>
        <p className="mt-1 text-xs text-muted-foreground">Available: {selectedCourse.recommendation.available?"published":"unavailable"} · License: {selectedCourse.recommendation.licensed===null?"institution-owned":selectedCourse.recommendation.licensed?"active":"not active"} · Adoption: {selectedCourse.recommendation.adopted===null?"not required":selectedCourse.recommendation.adopted?"active for this program":"not adopted"} · Instruction: {selectedCourse.recommendation.instructionReady?"real introductory lesson":"not ready"}.</p>
      </div>}
      <p className="mt-1 text-xs text-muted-foreground">Adoption eligibility is currently program-scoped, not yet versioned by academic year. Annual adoption rollover is a separate release.</p>
    </div>}
    <label className="text-sm sm:col-span-2">Instructional schedule<select required value={effectiveScheduleId} onChange={e=>setScheduleId(e.target.value)} className="mt-1 block w-full rounded border bg-background p-2">
     <option value="">Choose a school-year schedule</option>{data.scheduleOptions.filter(option=>option.schoolYearId===selectedTerm?.schoolYearId).map(option=><option key={option.id} value={option.id}>{option.name}</option>)}
    </select></label>
    <label className="text-sm">Class code<input value={code} onChange={e=>setCode(e.target.value)} placeholder="BIO-101-A" className="mt-1 block w-full rounded border bg-background p-2"/></label>
    <label className="text-sm">Class title<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Biology I" className="mt-1 block w-full rounded border bg-background p-2"/></label>
    <label className="text-sm sm:col-span-2">Instructor (required for guided launch)<select required value={effectiveTeacherId} disabled={!data.academicAuthority.teacherAssignment} onChange={e=>setTeacherId(e.target.value)} className="mt-1 block w-full rounded border bg-background p-2 disabled:opacity-50">
     <option value="">Assign later</option>{data.teachingStaff.map(t=><option value={t.personId} key={t.personId}>{t.first} {t.last}</option>)}
    </select></label>
    <label className="text-sm sm:col-span-2">Course credit units
     <input aria-label="Credit units for new section" type="number" min="0.01" max="10" step="0.01"
      value={courseCredits} disabled={!data.academicAuthority.creditConfiguration} onChange={e=>setCourseCredits(e.target.value)} placeholder="E.g. 0.50 or 1.00"
      className="mt-1 block w-full rounded border bg-background p-2 disabled:opacity-50"/>
     <span className="mt-1 block text-xs text-muted-foreground">Enter reviewed course credits. Missing units are shown as Not recorded on transcripts and must be resolved separately for graduation decisions.</span>
    </label>
    <button type="submit" disabled={busy||!termId||!versionId||!effectiveScheduleId||!effectiveTeacherId||(!selectedCourse?.recommendation.recommended||!selectedCourse?.recommendation.instructionReady)||!data.academicAuthority.teacherAssignment||(Boolean(courseCredits.trim())&&!data.academicAuthority.creditConfiguration)} className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50">Save classroom and instructor</button>
   </form>
  </section>
  {createdSectionId&&<div role="status" className="mt-4 rounded-lg border p-4 text-sm">
   <strong>Classroom saved.</strong> The schedule, instructor and learner-facing first lesson were checked.
   {data.sections.find(section=>section.id===createdSectionId)?<div className="mt-3">
    <p className="font-medium">Remaining first-day requirements</p>
    {data.sections.find(section=>section.id===createdSectionId)!.classroom.blockers.length?
     <ul className="mt-2 list-inside list-disc space-y-1">{data.sections.find(section=>section.id===createdSectionId)!.classroom.blockers.map(blocker=><li key={blocker.key}>{blocker.message}</li>)}</ul>:
     <p className="mt-2">First-week classroom checks are satisfied.</p>}
   </div>:<p className="mt-2">Refresh the classroom checklist to see live readiness.</p>}
   <div className="mt-3 flex flex-wrap gap-3">
    <a href={"#classroom-"+createdSectionId} className="rounded border px-3 py-2 font-semibold">Review classroom readiness</a>
    <Link to="/operations/course-policies" search={{siteId:data.program.siteId??undefined,programId:data.program.id}} className="rounded border px-3 py-2">Set enrollment policies</Link>
    <Link to="/operations/launch" search={{siteId:data.program.siteId??undefined,programId:data.program.id}} className="rounded border px-3 py-2">Return to launch checklist</Link>
   </div>
  </div>}
  <div className="mt-6 rounded-lg border p-4 text-sm">
   After provisioning sections, <Link to="/operations/course-policies" search={{siteId:data.program.siteId??undefined,programId:data.program.id}} className="font-semibold underline">
    configure enrollment windows, prerequisites, seat capacity and credit limits →
   </Link>
  </div>
  <section className="mt-8 space-y-3">
   <h2 className="font-serif text-2xl">Teaching assignments</h2>
   {data.sections.map(section=><div id={"classroom-"+section.id} key={section.id}><LaunchSectionRow section={section}
    staff={data.teachingStaff} busy={busy} authority={data.academicAuthority}
    saveCredits={(credits,reason)=>run(()=>setLaunchSectionCredits({data:{
     programId:data.program.id,sectionId:section.id,credits,reason}}),"Academic credit units recorded.")}
    assign={(personId)=>run(()=>assignLaunchTeacher({data:{
     programId:data.program.id,sectionId:section.id,teacherPersonId:personId}}),"Instructor assigned.")}/></div>)}
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
