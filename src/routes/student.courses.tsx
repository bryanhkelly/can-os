import { hasRegistrarAuthority } from "@/domain/school-roles";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { getCourseRegistration, requestCourseChange, decideCourseChange } from "@/modules/learning/course-registration.functions";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { getAssignments } from "@/modules/student-experience/assignments.functions";
import { WorkspaceShell, WorkspacePanel, DetailNavigation, SectionTab, StatusBadge, EmptyState, StatCard, WorkspaceNotice } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { getMyStudentClasses } from "@/modules/classes/native-class-student-home.functions";
import { NativeStudentClassHome } from "@/components/learning/NativeStudentClassHome";
import { ClassroomWorkspace } from "@/components/learning/ClassroomWorkspace";
import { StudentAssignmentLink } from "@/components/student/StudentAssignmentLink";
import { dateKeyInTimezone } from "@/modules/calendar/timezone";
import { useHydrated } from "@/lib/use-hydrated";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import { agree } from "@/lib/format";

const loadCourseRegistration=async(section?:string)=>{
 const registration=await getCourseRegistration();
 const enrolled=registration.viewerRole==="student"&&registration.sections.some(item=>item.id===section&&item.enrollmentStatus==="active");
 const classwork=enrolled?(await getAssignments()).assignments.filter(item=>item.sectionId===section):[];
 const native = registration.viewerRole==="student" ? await safeLoader(() => getMyStudentClasses())() : null;
 return {...registration,classwork,native};
};
export const Route=createFileRoute("/student/courses")({
 validateSearch:(search:Record<string,unknown>):{section?:string;view?:"catalog";tab?:"overview"|"classwork"|"grades"}=>({
  section:typeof search.section==="string"?search.section:undefined,
  view:search.view==="catalog"?"catalog":undefined,
  tab:search.tab==="overview"||search.tab==="classwork"||search.tab==="grades"?search.tab:undefined,
 }),
 loaderDeps:({search})=>({section:search.view==="catalog"?undefined:search.section}),
 loader:({deps})=>safeLoader(()=>loadCourseRegistration(deps.section),{authMessage:"Sign in with an authorized student account to view your classes."})(),
 component:CourseRegistrationPage,
});
function CourseRegistrationPage(){
 const outcome=Route.useLoaderData();
 const search=Route.useSearch();
 if(!outcome.ok)return <LoaderFailure eyebrow="Academics" title="Choose your classes." outcome={outcome}/>;
 if(outcome.data.viewerRole==="student"&&search.view!=="catalog") {
   if(!search.section && outcome.data.native?.ok && outcome.data.native.data.kind==="student" &&
     outcome.data.native.data.classes.some(item=>item.status==="active" || item.status==="pending")) {
     const requests=outcome.data.requests.filter(item=>["open","in_progress","waiting"].includes(item.status));
     return <NativeStudentClassHome classes={outcome.data.native.data.classes} navigation={<>
       <Button asChild variant="outline"><Link to="/student/courses" search={{view:"catalog"}}>Course catalog / registration</Link></Button>
       {requests.length>0&&<WorkspacePanel title="Pending class changes" className="mt-4">
         {requests.map(request=><p key={request.id} className="mt-2 text-sm"><Link to="/student/courses" search={{view:"catalog",section:request.sectionId}} className="underline">{request.title}</Link> · {request.status}</p>)}
       </WorkspacePanel>}
     </>}/>;
   }
   if(!search.section && outcome.data.native && !outcome.data.native.ok)
     return <LoaderFailure eyebrow="Academics" title="Your classes" outcome={outcome.data.native}/>;
   return <StudentClasses data={outcome.data}/>;
 }
 return <CourseRegistrationView data={outcome.data}/>;
}
function CourseRegistrationView({data}:{data:Awaited<ReturnType<typeof loadCourseRegistration>>}){
 const {connected,sections,requests,viewerRole:role}=data;
 const {section}=Route.useSearch();
 const visibleSections=section?sections.filter(item=>item.id===section):sections;
  const router=useRouter();
 const hydrated=useHydrated();
 const mutation=useMutationFeedback(()=>router.invalidate());
 const actionBusy=!hydrated||mutation.pending||mutation.refreshFailed;
 async function run(fn:()=>Promise<unknown>,message:string){
  await mutation.run(fn,{successMessage:message,commandErrorMessage:"Unable to save course request."});
 }
 const active=sections.filter(s=>s.enrollmentStatus==="active");
 const credits=active.reduce((n,s)=>n+s.credits,0);
 const today=new Date();
 return <WorkspaceShell width="standard" eyebrow="Course registration" title="Choose your classes." subtitle="Review your school’s available classes and request a schedule change. A registrar reviews each request before enrollment changes. Drops and withdrawals have different deadlines and academic consequences." breadcrumbs={<>
   {role==="student"&&<Link to="/student/courses" className="text-xs font-semibold underline">My classes</Link>}
   <Link to="/home" search={{siteId:undefined,programId:undefined}} className="text-xs text-muted-foreground hover:underline">Back to workspace</Link>
   {role==="student"&&<Link to="/groups" className="text-xs font-semibold underline underline-offset-4">Study groups</Link>}
  </>} className="pb-20">
  <div className="mt-6 flex flex-wrap items-center gap-3">
   <StatusBadge tone="neutral">Signed in as {hasRegistrarAuthority(role)?"School Registrar":"Student"}</StatusBadge>
   <StatusBadge tone={connected?"success":"attention"}>{connected?"School records connected":"School records unavailable"}</StatusBadge>
  </div>
  <MutationFeedback state={mutation} className="mt-4" pendingMessage="Saving course request..."/>
  <div className="mt-8 grid gap-4 sm:grid-cols-3">
   <StatCard label="Enrolled courses" value={active.length}/>
   <StatCard label="Current credits" value={credits}/>
   <StatCard label="Open requests" value={requests.filter(r=>r.status==="open").length}/>
  </div>
  <h2 className="mt-9 font-serif text-3xl">Course catalog</h2>
  {section&&<Link to="/student/courses" search={{view:"catalog"}} className="mt-3 inline-block text-sm underline">View full course catalog</Link>}
  {section&&!visibleSections.length&&<WorkspaceNotice tone="danger" className="mt-4">This course is unavailable in your current workspace.</WorkspaceNotice>}
  <div className="mt-4 space-y-3">{visibleSections.map(s=>{
   const enrolled=s.enrollmentStatus==="active";
   const pending=requests.find(r=>r.sectionId===s.id&&["open","in_progress","waiting"].includes(r.status));
   return <article key={s.id} className=" border border-border bg-card p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
     <div><p className="text-xs font-semibold text-muted-foreground">{s.code} · {s.subject} · {s.mode}</p>
      <h3 className="mt-2 font-serif text-2xl"><Link to="/student/courses" search={{section:s.id,view:"catalog"}} className="hover:underline">{s.title}</Link></h3><p className="mt-2 text-sm text-muted-foreground">{s.description??"Course delivered through the CAN learning model."}</p>
      {enrolled&&role==="student"&&<Link to="/student/assignments" search={{section:s.id}} className="mt-3 inline-block text-sm font-semibold underline">View class assignments</Link>}
      <p className="mt-2 text-xs text-muted-foreground">{s.credits} {agree(Number(s.credits), "credit", "credits")} · {enrolled?"Enrolled":s.enrollmentStatus==="withdrawn"?"Previously withdrawn":s.enrollmentStatus==="cancelled"?"Previously dropped":s.contentReady?"Available to request":"School content setup pending"}</p>
      {!enrolled && !s.contentReady && <p className="mt-2 text-sm">
        The school must publish student-accessible lesson content and assign that release to this class before enrollment can be approved.
        You may still request the class; a request does not reserve a seat or enroll you.
      </p>}
      <p className="mt-1 text-xs text-muted-foreground">Add/drop deadline: {s.policy.addDropEndsOn} · Withdrawal deadline: {s.policy.withdrawalEndsOn}</p>
      {s.policy.prerequisites.length>0&&<p className="mt-1 text-xs text-muted-foreground">Prerequisites: {s.policy.prerequisites.join(", ")}</p>}
      {s.policy.guardianApprovalRequired&&<p className="mt-1 text-xs text-warning">This class requires guardian permission. Your guardian can review your pending request under Family → Course approvals.</p>}
      {s.withdrawalNotation&&<p className="mt-1 text-xs font-semibold">Transcript notation: {String(s.withdrawalNotation)}</p>}
     </div>
     {hasRegistrarAuthority(role)?<span className=" border border-border px-3 py-2 text-xs font-semibold">Decision mode below</span>:
     <div className="flex flex-wrap gap-2">
      {pending?<span className=" bg-stone-warm px-3 py-2 text-xs font-semibold">
       Request pending - {pending.operation==="add"&&!s.contentReady?"school content setup needed":pending.operation==="add"&&s.policy.guardianApprovalRequired?"school review; guardian permission required":"registrar review needed"}
      </span>:enrolled?<>
       {dateKeyInTimezone(today.toISOString(),s.timezone)<=s.policy.addDropEndsOn&&<Button type="button" variant="outline" size="sm" disabled={actionBusy} onClick={()=>run(()=>requestCourseChange({data:{sectionId:s.id,operation:"drop"}}),"Drop request sent to the registrar.")}>Request drop</Button>}
       {dateKeyInTimezone(today.toISOString(),s.timezone)<=s.policy.withdrawalEndsOn&&<Button type="button" size="sm" disabled={actionBusy} onClick={()=>run(()=>requestCourseChange({data:{sectionId:s.id,operation:"withdraw"}}),"Withdrawal request sent for review.")}>Request withdrawal</Button>}
       {dateKeyInTimezone(today.toISOString(),s.timezone)>s.policy.withdrawalEndsOn&&<span className="text-xs text-muted-foreground">Change period closed</span>}
      </>:dateKeyInTimezone(today.toISOString(),s.timezone)<=s.policy.addDropEndsOn?<Button type="button" size="sm" disabled={actionBusy} onClick={()=>run(()=>requestCourseChange({data:{sectionId:s.id,operation:"add"}}),"Course request sent to the registrar.")}>{s.policy.guardianApprovalRequired?"Request guardian approval":"Request class"}</Button>:<span className="text-xs text-muted-foreground">Registration closed</span>}
     </div>}
    </div>
   </article>;
  })}</div>
  <h2 className="mt-10 font-serif text-3xl">Course change requests</h2>
  <p className="mt-2 text-sm text-muted-foreground">Each request belongs to the signed-in student and an authorized school program. Registrar decisions update the enrollment record and notify the student.</p>
  <div className="mt-4 space-y-3">{requests.map(r=><div key={r.id} className="flex flex-wrap items-center gap-3  border border-border bg-card p-4">
   <div className="flex-1"><p className="text-sm font-semibold">{r.title}</p><p className="mt-1 text-xs text-muted-foreground">{String(r.operation)} · {r.status}</p></div>
   {hasRegistrarAuthority(role)&&r.status==="open"&&<div className="flex flex-wrap gap-2">
    <Link to="/operations/course-requests" search={{siteId:undefined,programId:undefined}} className="px-3 py-2 text-xs underline">Review approval blockers</Link>
    <Button type="button" variant="outline" size="sm" disabled={actionBusy} onClick={()=>run(()=>decideCourseChange({data:{requestId:r.id,approve:false}}),"Request declined.")}>Decline</Button>
    <Button type="button" size="sm" disabled={actionBusy||(r.operation==="add"&&!sections.some(s=>s.id===r.sectionId&&s.contentReady))} onClick={()=>run(()=>decideCourseChange({data:{requestId:r.id,approve:true}}),"Enrollment decision recorded.")}>Approve</Button>
   </div>}
  </div>)}{!requests.length&&<EmptyState title="No course change requests yet."/>}</div>
  <p className="mt-9 text-xs leading-6 text-muted-foreground">A withdrawal retains a W notation on the enrollment record. Class additions that require guardian permission remain pending until an authorized guardian approves and the registrar finalizes the change. Schedule conflicts, prerequisites, capacity and credits are rechecked by the enrollment service when adding a class.</p>
 </WorkspaceShell>;
}

/** Same V6.1 class actions in every student context; no parallel navigation path. */
function StudentClassActions({sectionId}:{sectionId:string}) {
 return <nav aria-label="Class learning actions" className="mt-5 flex flex-wrap gap-3">
  <Button asChild><Link to="/class" >Choose native classroom</Link></Button>
  <Button asChild variant="outline"><Link to="/student/assignments" search={{section:sectionId}}>Classwork</Link></Button>
 </nav>;
}

function StudentClasses({data}:{data:Awaited<ReturnType<typeof loadCourseRegistration>>}){
 const {section,tab="overview"}=Route.useSearch();
 const enrolled=data.sections.filter(item=>item.enrollmentStatus==="active");
 const pendingRequests=data.requests.filter(request=>["open","in_progress","waiting"].includes(request.status));
 const course=enrolled.find(item=>item.id===section);
 const work=(data.classwork??[]).filter(item=>item.sectionId===course?.id);
 
 const connections=course?<WorkspacePanel title="Class connections">
   <nav aria-label="Class connections" className="grid gap-4 text-sm">
    <Link to="/class"  className="underline">Choose native classroom</Link>
    <Link to="/student/assignments" search={{section:course.id}} className="underline">View class assignments</Link>
    <Link to="/student/discussions" search={{section:course.id}} className="underline">Class discussion</Link>
    <Link to="/calendar" search={{section:course.id}} className="underline">Class schedule</Link>
    <Link to="/student/report-card" className="underline">Published report card</Link>
    <Link to="/groups" className="underline">Study groups</Link>
    <Link to="/student/courses" search={{view:"catalog",section:course.id}} className="underline">Registration and change deadlines</Link>
   </nav>
  </WorkspacePanel>:undefined;
 const content=<>
  {section&&!course?<WorkspaceNotice tone="danger" className="mt-6">This course is unavailable in your current workspace. Only actively enrolled classes appear here.</WorkspaceNotice>:
   !course?<div className="mt-7 grid gap-4 md:grid-cols-2">
    {!data.connected&&<WorkspaceNotice tone="attention" className="md:col-span-2">School records are currently unavailable. Do not assume your classes or pending requests have been cleared. Try again when the connection is restored.</WorkspaceNotice>}
    {!enrolled.length&&data.connected&&<EmptyState title="Your classes will appear here after placement." description="Your school assigns classes after enrollment. You can also review available classes in the course catalog."/>}
    {enrolled.map(item=><WorkspacePanel key={item.id} title={item.title} description={`${item.code} · ${item.subject}`}
     actions={<StatusBadge tone="success">Enrolled</StatusBadge>}>
     <p className="text-sm text-muted-foreground">{item.description??"Your classwork and feedback, in one place."}</p>
     <p className="mt-3 text-sm">Teaching team: {item.teachers?.length?item.teachers.map((teacher,index)=><span key={teacher.personId}>{index>0?", ":""}<Link to="/profiles" search={{person:teacher.personId}} className="underline">{teacher.name}</Link></span>):"Not assigned"}</p>
     <StudentClassActions sectionId={item.id}/>
    </WorkspacePanel>)}
    {pendingRequests.length>0&&<WorkspacePanel title="Pending class changes"
     description="A request is not an enrollment. The registrar reviews class availability, and some additions also require guardian permission."
     className="md:col-span-2">
     <ul className="divide-y divide-border">
      {pendingRequests.map(request=><li key={request.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
       <div className="min-w-0">
        <p className="text-sm font-semibold">{request.title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{String(request.operation)} · {request.status==="waiting"?"Waiting":request.status==="in_progress"?"In review":"Awaiting review"}</p>
       </div>
       <Link to="/student/courses" search={{view:"catalog",section:request.sectionId}}
        className="text-sm font-semibold text-primary underline underline-offset-4">Review request</Link>
      </li>)}
     </ul>
    </WorkspacePanel>}
   </div>:<>
    <DetailNavigation label="Class detail">
     <SectionTab current={tab==="overview"} link={{to:"/student/courses",search:{section:course.id,tab:"overview"}}}>Overview</SectionTab>
     <SectionTab current={false} link={{to:"/class"}}>Native classes</SectionTab>
     {(["classwork","grades"] as const).map(value=><SectionTab key={value} current={tab===value} link={{to:"/student/courses",search:{section:course.id,tab:value}}}>{value==="classwork"?"Classwork":"Grades & feedback"}</SectionTab>)}
    </DetailNavigation>
    {tab==="overview" ? <WorkspacePanel title="Class overview" description={course.description??"Your classwork and feedback in one place."}>
      <p className="text-sm text-muted-foreground">Teaching team: {course.teachers?.length ? course.teachers.map((teacher,index)=><span key={teacher.personId}>{index>0?", ":""}<Link to="/profiles" search={{person:teacher.personId}} className="underline">{teacher.name}</Link></span>) : "Not assigned"}</p>
      <StudentClassActions sectionId={course.id}/>
    </WorkspacePanel> : <WorkspacePanel title={tab==="grades"?"Grades & feedback":"Classwork"}
     description={tab==="grades"?"Assignment scores are not a finalized course grade. See your published report card for official results.":"Open an assignment to read instructions, submit your work or review feedback."}>
     <div className="divide-y">{work.filter(item=>tab!=="grades"||item.status==="graded"||item.status==="returned").map(item=><article key={item.assessmentId} className="flex flex-wrap items-start justify-between gap-3 py-4 first:pt-0">
      <div className="min-w-0"><h3 className="font-semibold"><StudentAssignmentLink assessmentId={item.assessmentId} sectionId={course.id} className="underline">{item.title}</StudentAssignmentLink></h3>
       <p className="mt-1 text-sm text-muted-foreground">{item.dueAt?`Due ${new Date(item.dueAt).toLocaleDateString()}`:"No due date"}{item.score!==null?` · ${item.score} / ${item.pointsPossible??"—"}`:""}</p>
       {tab==="grades"&&item.feedbackText&&<p className="mt-2 whitespace-pre-wrap text-sm">{item.feedbackText}</p>}</div>
      <StatusBadge tone={item.timeliness==="missing"?"attention":item.status==="graded"?"success":"neutral"}>{item.timeliness==="missing"?"Missing":item.status??"Assigned"}</StatusBadge>
     </article>)}</div>
     {!work.some(item=>tab!=="grades"||item.status==="graded"||item.status==="returned")&&<p className="text-sm text-muted-foreground">{tab==="grades"?"No graded work or revision feedback yet.":"No published assignments in this class yet."}</p>}
    </WorkspacePanel>}
   </>}
 </>;
 return course?<ClassroomWorkspace title={course.title}
  subtitle={`${course.code} · ${course.subject} · ${course.credits} ${agree(Number(course.credits), "credit", "credits")}`}
  rail={connections}>{content}</ClassroomWorkspace>:
  <WorkspaceShell width="wide" eyebrow="Student learning" title="My classes"
   subtitle="Enter an enrolled class to see your work, feedback and next steps."
   breadcrumbs={<><Link to="/home" className="underline">Today</Link><span>/</span><span>My classes</span></>}
   actions={<Button asChild variant="outline"><Link to="/student/courses" search={{view:"catalog"}}>Course catalog / registration</Link></Button>}>
   {content}
  </WorkspaceShell>;
}
