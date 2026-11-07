import { useSchoolConfigurationNavigation } from "@/components/launch-studio/SchoolConfigurationContext";
import { mutationErrorMessage } from "@/lib/mutation-feedback";
import { LaunchTeacherQualificationPolicy } from "@/components/operations/LaunchTeacherQualificationPolicy";
import { SchoolYearScheduleSetup } from "@/components/operations/SchoolYearScheduleSetup";
import { useWorkspaceMutation } from "@/hooks/useWorkspaceMutation";
import { LaunchSectionRow } from "@/components/operations/LaunchSectionRow";
import {useState} from "react";
import { prepareLaunchAcademicYear } from "@/modules/programs/launch-year-preparation.functions";
import {Link,useRouter} from "@tanstack/react-router";
import {getLaunchAcademicSetup,provisionLaunchSection,assignLaunchTeacher,setLaunchSectionCredits,declineLaunchClassRequest} from "@/modules/programs/launch-academics.functions";
import {WorkspaceNotice} from "@/components/workspace";
import { LaunchStudioShell } from "@/components/launch-studio/LaunchStudioShell";
import { schoolLaunchSteps } from "@/domain/launch-studio";
import { ProgramSiteAuthorizationPanel } from "@/components/operations/ProgramSiteAuthorizationPanel";
import { SchoolOpeningEvidencePanel } from "@/components/operations/SchoolOpeningEvidencePanel";
import { LocalSiteDelegationPanel } from "@/components/operations/LocalSiteDelegationPanel";
import { SectionFacilitatorPanel } from "@/components/operations/SectionFacilitatorPanel";
import {SectionLifecycleWorkspace} from "@/components/operations/SectionLifecycleManager";
import {Qualifications} from "@/components/profiles/Qualifications";
import {QualificationCatalog} from "@/components/profiles/QualificationCatalog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { StatCard } from "@/components/workspace/stat-card";
import { SchoolRoomsSetup } from "@/components/operations/SchoolRoomsSetup";

export type Snapshot=Awaited<ReturnType<typeof getLaunchAcademicSetup>>;
export function LaunchAcademicSetupWorkspace({data,hubMode=false}:{data:Snapshot;hubMode?:boolean}){
 const navigation=useSchoolConfigurationNavigation();
 const router=useRouter();
 const [termId,setTermId]=useState(data.terms.find(term=>data.scheduleOptions.some(schedule=>schedule.schoolYearId===term.schoolYearId))?.id??data.terms[0]?.id??"");
 const [versionId,setVersionId]=useState(data.catalog.find(course=>course.recommendation.recommended)?.versionId??data.catalog[0]?.versionId??"");
 const selectedTerm=data.terms.find(t=>t.id===termId);
 const selectedYear=data.years.find(y=>y.id===selectedTerm?.schoolYearId);
 const selectedCourse=data.catalog.find(course=>course.versionId===versionId);
 const [code,setCode]=useState(""),[title,setTitle]=useState("");
 const matchingSection=data.sections.find(section=>section.termId===termId&&section.code.toLowerCase()===(code.trim()||(selectedCourse?selectedCourse.code+"-A":"")).toLowerCase());
 const reviewedSectionAlreadyExists=Boolean(matchingSection);
 const [createdSectionId,setCreatedSectionId]=useState<string|null>(null);
 const [classRequestId,setClassRequestId]=useState<string|null>(null);
 const [declineReasons,setDeclineReasons]=useState<Record<string,string>>({});
 const [teacherId,setTeacherId]=useState("");
 const effectiveTeacherId=teacherId|| (data.teachingStaff.length===1?data.teachingStaff[0]!.personId:"");
 const [scheduleId,setScheduleId]=useState("");
 const suggestedSchedule=data.scheduleOptions.find(option=>option.schoolYearId===selectedTerm?.schoolYearId);
 const effectiveScheduleId=data.scheduleOptions.some(option=>option.id===scheduleId&&option.schoolYearId===selectedTerm?.schoolYearId)?scheduleId:suggestedSchedule?.id||"";
 const [courseCredits,setCourseCredits]=useState("");
 const [creationAttempted,setCreationAttempted]=useState(false);
 const [reviewTeacherId,setReviewTeacherId]=useState("");
 const [error,setError]=useState(""),[notice,setNotice]=useState("");
 const mutation=useWorkspaceMutation({mutationFn: (operation:()=>Promise<unknown>)=>operation(),invalidateRouter:()=>router.invalidate()});
 const busy=mutation.isSubmitting||!!mutation.refreshError;
 async function retryRefresh(){
  const outcome=await mutation.retryRefresh();
  if(outcome.status==="refreshed"){
   setError("");setNotice("Saved launch setup records refreshed. You may continue working.");
  }
 }
 async function run(operation:()=>Promise<unknown>,message:string){
  setError("");setNotice("");
  try{
   const submission=await mutation.submit(operation);
   if(submission.status === "ignored") return;
   if(submission.refreshError){setError("The server accepted the command, but fresh records could not be loaded. Reopen this workspace to verify before retrying.");return;}
   setNotice(message);
  }catch(e){setError(mutationErrorMessage(e, "Unable to save launch setup"));}
 }
 return <LaunchStudioShell focused={hubMode} role="School setup" subject={data.program.name} title="Prepare your classrooms."
  description="Prepare the school year, published curriculum and responsible Section staffing."
  steps={schoolLaunchSteps.map(id=>({id,title:{welcome:"Welcome",school:"School details",academics:"Academics",website:"School website",families:"Families & staff",readiness:"Readiness review",next:"What's next"}[id]}))}
  currentId="academics" onStepChange={id=>{
    const step=schoolLaunchSteps.find(item=>item===id);
    if(step)void router.navigate({to:"/launch/school",search:{siteId:data.program.siteId??undefined,programId:data.program.id,step}});
  }}
  exit={hubMode ? <Link to={navigation.homePath} search={{siteId:data.program.siteId??undefined}} className="text-primary">Back to {navigation.homeLabel}</Link> : <Link to="/home" search={{siteId:data.program.siteId??undefined,programId:data.program.id}} className="underline">Skip to dashboard</Link>}
  actions={!hubMode && <Button asChild variant="outline" size="sm">
   <Link to="/launch/school" search={{siteId:data.program.siteId??undefined,programId:data.program.id}}>Launch checklist →</Link>
  </Button>}>
  {error&&<WorkspaceNotice tone="danger" className="mt-5">{error}</WorkspaceNotice>}
  {mutation.refreshError&&<Button type="button" variant="outline" className="mt-3"
   disabled={mutation.isSubmitting} onClick={()=>void retryRefresh()}>Retry saved setup refresh</Button>}
  {notice&&<WorkspaceNotice tone="success" className="mt-5">{notice}</WorkspaceNotice>}
  <div className="mt-7 grid gap-3 sm:grid-cols-3">
   <StatCard label="School years" value={data.years.length}/>
   <StatCard label="Published course versions" value={data.catalog.length}/>
   <StatCard label="Sections provisioned" value={data.sections.length}/>
  </div>
  <section aria-label="Instruction and support readiness" className="mt-5 rounded-xl border bg-card p-5">
    <h2 className="font-serif text-2xl">Instruction and support readiness</h2>
    <p className="mt-2 text-sm text-muted-foreground">
      Published curriculum determines the instructional content. Each Section still needs a verified responsible instructor for academic records, oversight and support. This administrative assignment does not select the presenter of recorded lessons or require live teaching.
    </p>
    <Button asChild variant="outline" className="mt-3">
     <Link to="/operations/teacher-marketplace" search={{programId:data.program.id}}>
      Review instructor staffing for this curriculum
     </Link>
    </Button>
  </section>
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
    <SchoolRoomsSetup key={data.program.id} programId={data.program.id}/>
    <LocalSiteDelegationPanel programId={data.program.id}/>
    <SectionFacilitatorPanel programId={data.program.id}/>
  </>}
  {!data.years.length&&<section className="mt-6 rounded-lg border p-4">
   <h2 className="font-semibold">Prepare the recommended school year</h2>
   <p className="mt-2 text-sm">Use the saved launch date to prepare a school year, standard grading scale,
    two terms, grading periods and a draft instructional calendar. Review local holidays,
    teaching schedules and instructional days before activation. This does not approve opening.</p>
   <div className="mt-3 flex flex-wrap gap-3">
    <Button type="button" disabled={busy||!data.program.siteId}
     onClick={()=>void run(()=>prepareLaunchAcademicYear({data:{programId:data.program.id}}),
      "Academic year draft prepared. Review calendar and local operating dates before activation.")}>
     Prepare recommended year
    </Button>
    <Button asChild variant="outline">
     <Link to="/operations/school-years" search={{siteId:data.program.siteId??undefined,programId:data.program.id}}>
      Advanced school-year studio
     </Link>
    </Button>
   </div>
  </section>}
  <section className="mt-6 rounded-lg border p-4 text-sm" aria-label="Classroom setup guidance">
   <h2 className="font-semibold">Classroom setup prerequisites</h2>
   <ul className="mt-2 list-disc space-y-2 pl-5">
    {!data.terms.length&&<li>Prepare an academic year and its terms using the recommended-year action above.</li>}
    {!data.scheduleOptions.some(option=>option.schoolYearId===selectedTerm?.schoolYearId)&&<li>No instructional schedule exists for the selected year. <Link to="/operations/school-years" search={{siteId:data.program.siteId??undefined,programId:data.program.id}} className="underline">Configure and review a school-year schedule</Link>.</li>}
    {!data.catalog.some(course=>course.recommendation.recommended)&&<li>No available published course has an accessible first lesson. <Link to="/operations/curriculum" className="underline">Review and publish instruction-ready curriculum</Link>.</li>}
    {!data.teachingStaff.length&&<li>No eligible instructor is assigned to this school. Ask your CAN academic staffing administrator to assign a teacher to this Program, then refresh this workspace. The teacher must submit qualification evidence from their profile for independent review.</li>}
    {!data.academicAuthority.teacherAssignment&&<li>Complete institutional instructional service authorization before assigning teachers.</li>}
    {data.terms.length>0&&data.scheduleOptions.some(option=>option.schoolYearId===selectedTerm?.schoolYearId)&&data.catalog.some(course=>course.recommendation.recommended)&&data.teachingStaff.length>0&&data.academicAuthority.teacherAssignment&&<li>Reviewed choices are available. The recommended course and a matching schedule are preselected; a sole authorized instructor is suggested but must be reviewed.</li>}
   </ul>
  </section>
  {selectedYear&&!suggestedSchedule&&<SchoolYearScheduleSetup key={selectedYear.id}
   schoolYearId={selectedYear.id} programId={data.program.id} startsOn={selectedYear.startsOn}
   endsOn={selectedYear.endsOn} timezone={selectedYear.timezone} disabled={busy}
   changed={()=>router.invalidate()}/>}
  {!data.teachingStaff.length&&<section aria-label="Instructor staffing handoff" className="mt-4 rounded-xl border bg-card p-5 text-sm">
   <h3 className="font-semibold">Get your instructor assigned</h3>
   <p className="mt-2">Request an instructor for {data.program.name} from your CAN academic staffing administrator. Include the planned course and term. A local website or registrar invitation does not appoint a CAN teacher.</p>

   <Button type="button" variant="outline" size="sm" disabled={busy} onClick={()=>void router.invalidate()} className="mt-3">Refresh instructor choices</Button>
  </section>}
  <section className="mt-7 rounded-xl border bg-card p-5" aria-labelledby="teacher-class-requests">
   <h2 id="teacher-class-requests" className="font-serif text-2xl">Teacher class requests</h2>
   <p className="mt-2 text-sm text-muted-foreground">Review teacher proposals here. Creating a request does not create a Section; approved course content, school-year schedule, instructor qualifications and the existing launch checks still apply.</p>
   <div className="mt-4 space-y-3">
    {data.classRequests.map(request=><article key={request.id} className="rounded-lg border p-4">
     <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
       <p className="text-xs text-muted-foreground">Requested by {request.requesterName} · {request.requestedCourseOrSubject} · {request.desiredTerm}</p>
       <h3 className="mt-1 font-semibold">{request.requestedClassTitle}</h3>
       {request.schedulePreference&&<p className="mt-2 text-sm">Schedule preference: {request.schedulePreference}</p>}
       {request.notes&&<p className="mt-2 whitespace-pre-wrap text-sm">{request.notes}</p>}
      </div>
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={()=>{
       setClassRequestId(request.id);
       setTitle(request.requestedClassTitle);
       setCode("");
       const course=data.catalog.find(item=>
        item.code.toLowerCase()===request.requestedCourseOrSubject.toLowerCase()||
        item.title.toLowerCase()===request.requestedCourseOrSubject.toLowerCase());
       if(course)setVersionId(course.versionId);
       const normalizedTerm=request.desiredTerm.trim().toLowerCase();
       const term=data.terms.find(item=>item.name.toLowerCase()===normalizedTerm||
        data.years.find(year=>year.id===item.schoolYearId)?.name.toLowerCase()===normalizedTerm);
       if(term)setTermId(term.id);
       setTeacherId(data.teachingStaff.some(staff=>staff.personId===request.requesterPersonId)
        ?request.requesterPersonId:"");
       document.getElementById("classroom-create")?.scrollIntoView({behavior:"smooth"});
      }}>
       Prepare class setup
      </Button>
     </div>
     <details className="mt-3 border-t pt-3">
      <summary className="cursor-pointer text-sm font-medium">Decline request</summary>
      <form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={event=>{
       event.preventDefault();
       const reason=declineReasons[request.id]?.trim();
       if(!reason)return;
       if(classRequestId===request.id)setClassRequestId(null);
       void run(()=>declineLaunchClassRequest({data:{programId:data.program.id,
        requestId:request.id,reason}}),"Class request declined with a recorded reason.");
      }}>
       <Label className="min-w-60 flex-1">Reason
        <Textarea required minLength={5} maxLength={1000} value={declineReasons[request.id]??""}
         onChange={event=>setDeclineReasons(current=>({...current,[request.id]:event.target.value}))}
         rows={2} className="mt-1"/>
       </Label>
       <Button type="submit" variant="outline" size="sm"
        disabled={busy||(declineReasons[request.id]?.trim().length??0)<5}>Decline request</Button>
      </form>
     </details>
    </article>)}
    {!data.classRequests.length&&<p role="status" className="rounded-lg border p-4 text-sm text-muted-foreground">No pending teacher class requests for this program.</p>}
   </div>
  </section>
  {!data.catalog.length&&<p className="mt-6 rounded-lg border p-4 text-sm">
   No published course templates are available from this program's academic provider. Publish curriculum before creating sections.
  </p>}
  <details className="mt-5 rounded-xl border bg-card p-4"><summary className="cursor-pointer text-sm font-semibold">Teacher requirements and shared qualification definitions</summary>
   <p className="mt-2 text-sm">Review existing requirements before creating definitions or publishing a new policy. These controls are for authorized academic administrators.</p>
   <p className="mt-2 text-sm">Your school chooses which documented qualifications its program requires, such as degrees, licenses or training.
    Teacher evidence is reusable across schools. Applicable institutional and jurisdiction requirements still apply; catalog entries alone are not mandatory.</p>
   <QualificationCatalog programId={data.program.id} canAuthor={data.canAuthorCatalog}
    changed={async()=>{await router.invalidate();}}/>
   <LaunchTeacherQualificationPolicy data={data} busy={busy} run={run}/>
  </details>
  <section id="classroom-create" className="mt-7 rounded-xl border bg-card p-5">
   <h2 className="font-serif text-2xl">Set up your first classroom</h2>
   {reviewedSectionAlreadyExists&&<p role="status" className="mt-2 rounded-lg border p-3 text-sm">A class with this code already exists in the selected term. <a href={"#classroom-"+matchingSection!.id} className="font-semibold underline">Resume its saved classroom and instructor assignment</a> instead of submitting a duplicate.</p>}
   <p className="mt-2 text-sm">Choose published curriculum and a term, then assign a verified responsible instructor to the Section. This administrative assignment does not determine who produced its lessons or require live classes. Scheduling and readiness remain separate checks.</p>
   <form noValidate className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={e=>{
    e.preventDefault();setCreationAttempted(true);
    if(!termId||!versionId||!effectiveScheduleId||!effectiveTeacherId||
      !selectedCourse?.recommendation.recommended||!selectedCourse.recommendation.instructionReady||
      !data.academicAuthority.teacherAssignment||reviewedSectionAlreadyExists)return;
    void run(async()=>{const result=await provisionLaunchSection({data:{
     programId:data.program.id,termId,courseTemplateVersionId:versionId,
     code:code.trim()||(selectedCourse?selectedCourse.code+"-A":""),title:title.trim()||selectedCourse?.title||"",teacherPersonId:effectiveTeacherId,scheduleTemplateId:effectiveScheduleId,
     ...(classRequestId?{classRequestId}:{}),
     ...(courseCredits.trim()?{credits:Number(courseCredits)}:{})}});setCreatedSectionId(result.sectionId);
     setClassRequestId(null);
    },classRequestId?"Requested class provisioned. Verify its saved Section and first-week readiness below.":"Class command accepted. Verify the saved Section and first-week readiness below.");
   }}>
    <Field label="Academic term" required error={creationAttempted&&!termId?"Choose an academic term.":undefined}><Select value={termId} onChange={e=>setTermId(e.target.value)}>
     <option value="">Choose term</option>{data.terms.map(t=><option key={t.id} value={t.id}>{data.years.find(y=>y.id===t.schoolYearId)?.name??"School year"} · {t.name} ({t.startsOn}–{t.endsOn})</option>)}
    </Select></Field>
    <Field label="Published curriculum" required
      error={creationAttempted&&!versionId?"Choose published curriculum.":creationAttempted&&selectedCourse&&!selectedCourse.recommendation.recommended?selectedCourse.recommendation.explanation:undefined}>
     <Select value={versionId} onChange={e=>setVersionId(e.target.value)}>
     <option value="">Choose curriculum</option>{data.catalog.map(x=><option key={x.versionId} value={x.versionId}>
      {x.code} · {x.title} · v{x.version} · {x.origin==="adopted"?`Adopted from ${x.publisherName}`:"Institution-owned"} · {x.recommendation.recommended?"Recommended for a first class":"Needs instructional content"}
     </option>)}
    </Select></Field>
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
    <Field className="sm:col-span-2" label="Instructional schedule" required
      error={creationAttempted&&!effectiveScheduleId?"Choose a schedule for the selected academic term.":undefined}><Select value={effectiveScheduleId} onChange={e=>setScheduleId(e.target.value)}>
     <option value="">Choose a school-year schedule</option>{data.scheduleOptions.filter(option=>option.schoolYearId===selectedTerm?.schoolYearId).map(option=><option key={option.id} value={option.id}>{option.name}</option>)}
    </Select></Field>
    <Label>Class code<Input value={code} onChange={e=>setCode(e.target.value)} placeholder="BIO-101-A" className="mt-1"/></Label>
    <Label>Class title<Input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Biology I" className="mt-1"/></Label>
    <Field className="sm:col-span-2" label="Responsible Section instructor (required for academic records)" required
      error={creationAttempted&&!effectiveTeacherId?"Choose an authorized instructor.":undefined}><Select value={effectiveTeacherId} disabled={!data.academicAuthority.teacherAssignment||!data.teachingStaff.length} onChange={e=>setTeacherId(e.target.value)}>
     <option value="">{data.teachingStaff.length?"Choose responsible instructor":"Awaiting instructor assignment"}</option>{data.teachingStaff.map(t=><option value={t.personId} key={t.personId}>{t.first} {t.last}</option>)}
    </Select></Field>
    <Label className="sm:col-span-2">Course credit units
     <Input aria-label="Credit units for new section" type="number" min="0.01" max="10" step="0.01"
      value={courseCredits} disabled={!data.academicAuthority.creditConfiguration} onChange={e=>setCourseCredits(e.target.value)} placeholder="E.g. 0.50 or 1.00"
      className="mt-1"/>
     <span className="mt-1 block text-xs text-muted-foreground">Enter reviewed course credits. Missing units are shown as Not recorded on transcripts and must be resolved separately for graduation decisions.</span>
    </Label>
    <Button type="submit" disabled={busy||reviewedSectionAlreadyExists||!data.academicAuthority.teacherAssignment||(Boolean(courseCredits.trim())&&!data.academicAuthority.creditConfiguration)}>{reviewedSectionAlreadyExists?"Class already saved":"Save classroom and staffing assignment"}</Button>
   </form>
  </section>
  {createdSectionId&&<div role="status" className="mt-4 rounded-lg border p-4 text-sm">
   <strong>Section command accepted.</strong> The server validated the requested Section and assignment. Confirm the latest persisted readiness after refreshing; this is not an opening approval.
   {data.sections.find(section=>section.id===createdSectionId)?<div className="mt-3">
    <p className="font-medium">Remaining first-day requirements</p>
    {data.sections.find(section=>section.id===createdSectionId)!.classroom.blockers.length?
     <ul className="mt-2 list-inside list-disc space-y-1">{data.sections.find(section=>section.id===createdSectionId)!.classroom.blockers.map(blocker=><li key={blocker.key}>{blocker.message}</li>)}</ul>:
     <p className="mt-2">First-week classroom checks are satisfied in the currently loaded snapshot. Refresh for the latest state.</p>}
   </div>:<p className="mt-2">Refresh the classroom checklist to see live readiness.</p>}
   <div className="mt-3 flex flex-wrap gap-3">
    <Button asChild variant="outline" size="sm"><a href={"#classroom-"+createdSectionId}>Review classroom readiness</a></Button>
    <Button asChild variant="outline" size="sm">
     <Link to="/operations/course-policies" search={{siteId:data.program.siteId??undefined,programId:data.program.id}}>Set enrollment policies</Link>
    </Button>
    <Button asChild variant="outline" size="sm">
     <Link {...(hubMode?{to:navigation.modulePath,params:{module:"compliance"},search:{siteId:data.program.siteId??undefined,programId:data.program.id}}:{to:"/launch/school" as const,search:{siteId:data.program.siteId??undefined,programId:data.program.id}})}>{navigation.context==="settings" ? "Review compliance" : "Return to launch checklist"}</Link>
    </Button>
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
   <Label className="mt-3 block">Teacher to review<Select value={reviewTeacherId}
    onChange={event=>setReviewTeacherId(event.target.value)} className="mt-1">
    <option value="">Choose teacher</option>{data.teachingStaff.map(teacher=>
     <option key={teacher.personId} value={teacher.personId}>{teacher.first} {teacher.last}</option>)}
   </Select></Label>
   {reviewTeacherId&&<Qualifications key={reviewTeacherId} personId={reviewTeacherId}
    programId={data.program.id} onChanged={async()=>{await router.invalidate();}}/>}
  </section>
  <SectionLifecycleWorkspace programId={data.program.id} staff={data.teachingStaff}/>
 </LaunchStudioShell>;
}
