import { useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { getCourseRegistration, requestCourseChange, decideCourseChange } from "@/modules/learning/course-registration.functions";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { getAssignments } from "@/modules/student-experience/assignments.functions";
import { WorkspaceShell, WorkspacePanel, DetailNavigation, StatCard, StatusBadge, EmptyState } from "@/components/workspace";

const loadCourseRegistration=async(section?:string)=>{
 const registration=await getCourseRegistration();
 const enrolled=registration.viewerRole==="student"&&registration.sections.some(item=>item.id===section&&item.enrollmentStatus==="active");
 const classwork=enrolled?(await getAssignments()).assignments.filter(item=>item.sectionId===section):[];
 return {...registration,classwork};
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
 if(!outcome.ok)return <LoaderFailure eyebrow="CAN OS · Academics" title="Choose your classes." outcome={outcome}/>;
 if(outcome.data.viewerRole==="student"&&search.view!=="catalog")return <StudentClasses data={outcome.data}/>;
 return <CourseRegistrationView data={outcome.data}/>;
}
function CourseRegistrationView({data}:{data:Awaited<ReturnType<typeof loadCourseRegistration>>}){
 const {connected,sections,requests,viewerRole:role}=data;
 const {section}=Route.useSearch();
 const visibleSections=section?sections.filter(item=>item.id===section):sections;
  const router=useRouter();
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 async function run(fn:()=>Promise<unknown>,message:string){
  setBusy(true);setError("");setNotice("");
  try{await fn();await router.invalidate();setNotice(message)}
  catch(e){setError(e instanceof Error?e.message:"Unable to save")}
  finally{setBusy(false)}
 }
 const active=sections.filter(s=>s.enrollmentStatus==="active");
 const credits=active.reduce((n,s)=>n+s.credits,0);
 const today=new Date().toISOString().slice(0,10);
 return <main className="mx-auto max-w-5xl px-5 py-9 pb-20">
  <nav className="flex flex-wrap items-center gap-4">
   {role==="student"&&<Link to="/student/courses" className="text-xs font-semibold underline">My classes</Link>}
   <Link to={role==="registrar"?"/operations":"/student"} search={{siteId:undefined,programId:undefined}} className="text-xs text-muted-foreground hover:underline">Back to workspace</Link>
   {role==="student"&&<Link to="/student/study-groups" className="text-xs font-semibold underline underline-offset-4">Study groups</Link>}
  </nav>
  <p className="mt-8 text-xs font-bold uppercase tracking-widest text-muted-foreground">CAN OS · Course registration</p>
  <h1 className="mt-2 font-serif text-5xl">Choose your classes.</h1>
  <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">Review your school’s available classes and request a schedule change. A registrar reviews each request before enrollment changes. Drops and withdrawals have different deadlines and academic consequences.</p>
  <div className="mt-6 flex flex-wrap items-center gap-3">
   <span className="rounded-full border border-border px-3 py-2 text-xs font-semibold">Signed in as {role==="registrar"?"School Registrar":"Student"}</span>
   <span className="rounded-full border border-border px-3 py-2 text-xs font-semibold">{connected?"School records connected":"School records unavailable"}</span>
  </div>
  {error&&<p role="alert" className="mt-4 rounded-lg border border-red-300 p-3 text-sm">{error}</p>}
  {notice&&<p role="status" className="mt-4 rounded-lg border border-emerald-300 p-3 text-sm">{notice}</p>}
  <div className="mt-8 grid gap-4 sm:grid-cols-3">
   <div className="rounded-xl border border-border bg-card p-5"><p className="text-xs text-muted-foreground">Enrolled courses</p><p className="mt-2 font-serif text-4xl">{active.length}</p></div>
   <div className="rounded-xl border border-border bg-card p-5"><p className="text-xs text-muted-foreground">Current credits</p><p className="mt-2 font-serif text-4xl">{credits}</p></div>
   <div className="rounded-xl border border-border bg-card p-5"><p className="text-xs text-muted-foreground">Open requests</p><p className="mt-2 font-serif text-4xl">{requests.filter(r=>r.status==="open").length}</p></div>
  </div>
  <h2 className="mt-9 font-serif text-3xl">Course catalog</h2>
  {section&&<Link to="/student/courses" search={{view:"catalog"}} className="mt-3 inline-block text-sm underline">View full course catalog</Link>}
  {section&&!visibleSections.length&&<p role="alert" className="mt-4 rounded-xl border p-4">This course is unavailable in your current workspace.</p>}
  <div className="mt-4 space-y-3">{visibleSections.map(s=>{
   const enrolled=s.enrollmentStatus==="active";
   const pending=requests.find(r=>r.sectionId===s.id&&["open","in_progress","waiting"].includes(r.status));
   return <article key={s.id} className="rounded-2xl border border-border bg-card p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
     <div><p className="text-xs font-semibold text-muted-foreground">{s.code} · {s.subject} · {s.mode}</p>
      <h3 className="mt-2 font-serif text-2xl"><Link to="/student/courses" search={{section:s.id,view:"catalog"}} className="hover:underline">{s.title}</Link></h3><p className="mt-2 text-sm text-muted-foreground">{s.description??"Course delivered through the CAN learning model."}</p>
      {enrolled&&role==="student"&&<Link to="/student/assignments" search={{section:s.id}} className="mt-3 inline-block text-sm font-semibold underline">View class assignments</Link>}
      <p className="mt-2 text-xs text-muted-foreground">{s.credits} credit(s) · {enrolled?"Enrolled":s.enrollmentStatus==="withdrawn"?"Previously withdrawn":s.enrollmentStatus==="cancelled"?"Previously dropped":"Available"}</p>
      <p className="mt-1 text-xs text-muted-foreground">Add/drop deadline: {s.policy.addDropEndsOn} · Withdrawal deadline: {s.policy.withdrawalEndsOn}</p>
      {s.policy.prerequisites.length>0&&<p className="mt-1 text-xs text-muted-foreground">Prerequisites: {s.policy.prerequisites.join(", ")}</p>}
      {s.policy.guardianApprovalRequired&&<p className="mt-1 text-xs text-amber-700">This class requires guardian permission. Your guardian can review your pending request under Family → Course approvals.</p>}
      {s.withdrawalNotation&&<p className="mt-1 text-xs font-semibold">Transcript notation: {String(s.withdrawalNotation)}</p>}
     </div>
     {role==="registrar"?<span className="rounded-lg border border-border px-3 py-2 text-xs font-semibold">Decision mode below</span>:
     <div className="flex flex-wrap gap-2">
      {pending?<span className="rounded-lg bg-stone-warm px-3 py-2 text-xs font-semibold">Request pending</span>:enrolled?<>
       {today<=s.policy.addDropEndsOn&&<button disabled={busy} onClick={()=>run(()=>requestCourseChange({data:{sectionId:s.id,operation:"drop"}}),"Drop request sent to the registrar.")} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold disabled:opacity-50">Request drop</button>}
       {today<=s.policy.withdrawalEndsOn&&<button disabled={busy} onClick={()=>run(()=>requestCourseChange({data:{sectionId:s.id,operation:"withdraw"}}),"Withdrawal request sent for review.")} className="rounded-lg bg-foreground px-3 py-2 text-xs font-semibold text-background disabled:opacity-50">Request withdrawal</button>}
       {today>s.policy.withdrawalEndsOn&&<span className="text-xs text-muted-foreground">Change period closed</span>}
      </>:today<=s.policy.addDropEndsOn?<button disabled={busy} onClick={()=>run(()=>requestCourseChange({data:{sectionId:s.id,operation:"add"}}),"Course request sent to the registrar.")} className="rounded-lg bg-foreground px-4 py-2 text-xs font-semibold text-background disabled:opacity-50">{s.policy.guardianApprovalRequired?"Request guardian approval":"Request class"}</button>:<span className="text-xs text-muted-foreground">Registration closed</span>}
     </div>}
    </div>
   </article>;
  })}</div>
  <h2 className="mt-10 font-serif text-3xl">Course change requests</h2>
  <p className="mt-2 text-sm text-muted-foreground">Each request belongs to the signed-in student and an authorized school program. Registrar decisions update the enrollment record and notify the student.</p>
  <div className="mt-4 space-y-3">{requests.map(r=><div key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
   <div className="flex-1"><p className="text-sm font-semibold">{r.title}</p><p className="mt-1 text-xs text-muted-foreground">{String(r.operation)} · {r.status}</p></div>
   {role==="registrar"&&r.status==="open"&&<div className="flex gap-2"><button disabled={busy} onClick={()=>run(()=>decideCourseChange({data:{requestId:r.id,approve:false}}),"Request declined.")} className="rounded-lg border border-border px-3 py-2 text-xs">Decline</button><button disabled={busy} onClick={()=>run(()=>decideCourseChange({data:{requestId:r.id,approve:true}}),"Enrollment decision recorded.")} className="rounded-lg bg-foreground px-3 py-2 text-xs text-background">Approve</button></div>}
  </div>)}{!requests.length&&<p className="rounded-xl border border-border p-4 text-sm text-muted-foreground">No course change requests yet.</p>}</div>
  <p className="mt-9 text-xs leading-6 text-muted-foreground">A withdrawal retains a W notation on the enrollment record; official transcript display and guardian consent for classes that require it are not yet finalized. Schedule conflicts, prerequisites, capacity and credits are rechecked by the enrollment service when adding a class.</p>
 </main>;
}

function StudentClasses({data}:{data:Awaited<ReturnType<typeof loadCourseRegistration>>}){
 const {section,tab="overview"}=Route.useSearch();
 const enrolled=data.sections.filter(item=>item.enrollmentStatus==="active");
 const course=enrolled.find(item=>item.id===section);
 const work=(data.classwork??[]).filter(item=>item.sectionId===course?.id);
 return <WorkspaceShell width="wide" eyebrow="CAN OS · Student learning"
  title={course?.title??"My classes"}
  subtitle={course?`${course.code} · ${course.subject} · ${course.credits} credit(s)`:"Enter an enrolled class to see your work, feedback and next steps."}
  breadcrumbs={<><Link to="/student" className="underline">Today</Link><span>/</span><Link to="/student/courses" className="underline">My classes</Link>{course&&<><span>/</span><span>{course.title}</span></>}</>}
  actions={<Link to="/student/courses" search={{view:"catalog"}} className="rounded-lg border bg-card px-4 py-2 text-sm font-semibold">Course catalog / registration</Link>}
  rail={course?<WorkspacePanel title="Class connections">
   <nav aria-label="Class connections" className="grid gap-4 text-sm">
    <Link to="/classes" search={{section:course.id}} className="underline">Class lessons, files and announcements</Link>
    <Link to="/student/assignments" search={{section:course.id}} className="underline">View class assignments</Link>
    <Link to="/student/discussions" search={{section:course.id}} className="underline">Class discussion</Link>
    <Link to="/calendar" search={{section:course.id}} className="underline">Class schedule</Link>
    <Link to="/student/report-card" className="underline">Published report card</Link>
    <Link to="/student/study-groups" className="underline">Study groups</Link>
    <Link to="/student/courses" search={{view:"catalog",section:course.id}} className="underline">Registration and change deadlines</Link>
   </nav>
  </WorkspacePanel>:undefined}>
  {section&&!course?<p role="alert" className="mt-6 rounded-xl border p-5">This course is unavailable in your current workspace. Only actively enrolled classes appear here.</p>:
   !course?<div className="mt-7 grid gap-4 md:grid-cols-2">
    {!enrolled.length&&<EmptyState title="Your classes will appear here after placement." description="Your school assigns classes after enrollment. You can also review available classes in the course catalog."/>}
    {enrolled.map(item=><WorkspacePanel key={item.id} title={item.title} description={`${item.code} · ${item.subject}`}
     actions={<StatusBadge tone="success">Enrolled</StatusBadge>}>
     <p className="text-sm text-muted-foreground">{item.description??"Your classwork and feedback, in one place."}</p>
     <p className="mt-3 text-sm">Teaching team: {item.teachers?.length?item.teachers.map((teacher,index)=><span key={teacher.personId}>{index>0?", ":""}<Link to="/profiles" search={{person:teacher.personId}} className="underline">{teacher.name}</Link></span>):"Not assigned"}</p>
     <div className="mt-5 flex flex-wrap gap-3 text-sm">
      <Link to="/student/courses" search={{section:item.id}} className="rounded-lg bg-foreground px-4 py-2 font-semibold text-background">Open class</Link>
      <Link to="/student/assignments" search={{section:item.id}} className="rounded-lg border px-4 py-2">Classwork</Link>
      <Link to="/classes" search={{section:item.id,tab:"lessons"}} className="rounded-lg border px-4 py-2">Lessons & resources</Link>
     </div>
    </WorkspacePanel>)}
   </div>:<>
    <DetailNavigation label="Class detail">
     {(["overview","classwork","grades"] as const).map(value=><Link key={value} to="/student/courses" search={{section:course.id,tab:value}} aria-current={tab===value?"page":undefined}>{value==="overview"?"Overview":value==="classwork"?"Classwork":"Grades & feedback"}</Link>)}
    </DetailNavigation>
    {tab==="overview"&&<>
     <div className="mb-6 grid gap-3 sm:grid-cols-3">
      <StatCard label="Assignments" value={work.length}/>
      <StatCard label="Missing work" value={work.filter(item=>item.timeliness==="missing").length}/>
      <StatCard label="Awaiting feedback" value={work.filter(item=>item.status==="submitted").length}/>
     </div>
     <WorkspacePanel title="About this class"><p className="text-sm leading-7">{course.description??"Your school has not provided a class description yet."}</p><p className="mt-3 text-sm text-muted-foreground">Delivery: {course.mode} · Enrolled</p>
      <p className="mt-3 text-sm">Teaching team: {course.teachers?.length?course.teachers.map((teacher,index)=><span key={teacher.personId}>{index>0?", ":""}<Link to="/profiles" search={{person:teacher.personId}} className="underline">{teacher.name}</Link></span>):"Not assigned"}</p></WorkspacePanel>
    </>}
    <WorkspacePanel className={tab==="overview"?"mt-6":""} title={tab==="grades"?"Grades & feedback":tab==="overview"?"Classwork at a glance":"Classwork"}
     description={tab==="grades"?"Assignment scores are not a finalized course grade. See your published report card for official results.":"Open an assignment to read instructions, submit your work or review feedback."}>
     <div className="divide-y">{work.filter(item=>tab!=="grades"||item.status==="graded"||item.status==="returned").map(item=><article key={item.assessmentId} className="flex flex-wrap items-start justify-between gap-3 py-4 first:pt-0">
      <div className="min-w-0"><h3 className="font-semibold"><Link to="/student/assignments" search={{section:course.id,assessment:item.assessmentId}} className="underline">{item.title}</Link></h3>
       <p className="mt-1 text-sm text-muted-foreground">{item.dueAt?`Due ${new Date(item.dueAt).toLocaleDateString()}`:"No due date"}{item.score!==null?` · ${item.score} / ${item.pointsPossible??"—"}`:""}</p>
       {tab==="grades"&&item.feedbackText&&<p className="mt-2 whitespace-pre-wrap text-sm">{item.feedbackText}</p>}</div>
      <StatusBadge tone={item.timeliness==="missing"?"attention":item.status==="graded"?"success":"neutral"}>{item.timeliness==="missing"?"Missing":item.status??"Assigned"}</StatusBadge>
     </article>)}</div>
     {!work.some(item=>tab!=="grades"||item.status==="graded"||item.status==="returned")&&<p className="text-sm text-muted-foreground">{tab==="grades"?"No graded work or revision feedback yet.":"No published assignments in this class yet."}</p>}
    </WorkspacePanel>
   </>}
 </WorkspaceShell>;
}
