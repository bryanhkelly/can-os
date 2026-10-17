import { useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { getCourseRegistration, requestCourseChange, decideCourseChange } from "@/modules/learning/course-registration.functions";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";

const loadCourseRegistration=()=>getCourseRegistration();
export const Route=createFileRoute("/student/courses")({
 loader:safeLoader(loadCourseRegistration,{authMessage:"Sign in with an authorized student account to choose your classes."}),
 component:CourseRegistrationPage,
});
function CourseRegistrationPage(){
 const outcome=Route.useLoaderData();
 if(!outcome.ok)return <LoaderFailure eyebrow="CAN OS · Academics" title="Choose your classes." outcome={outcome}/>;
 return <CourseRegistrationView data={outcome.data}/>;
}
function CourseRegistrationView({data}:{data:Awaited<ReturnType<typeof loadCourseRegistration>>}){
 const {connected,sections,requests,viewerRole:role}=data;
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
   <Link to="/student" className="text-xs text-muted-foreground hover:underline">← Student Today</Link>
   {role==="student"&&<Link to="/groups" className="text-xs font-semibold underline underline-offset-4">Study groups</Link>}
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
  <div className="mt-4 space-y-3">{sections.map(s=>{
   const enrolled=s.enrollmentStatus==="active";
   const pending=requests.find(r=>r.sectionId===s.id&&["open","in_progress","waiting"].includes(r.status));
   return <article key={s.id} className="rounded-2xl border border-border bg-card p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
     <div><p className="text-xs font-semibold text-muted-foreground">{s.code} · {s.subject} · {s.mode}</p>
      <h3 className="mt-2 font-serif text-2xl">{s.title}</h3><p className="mt-2 text-sm text-muted-foreground">{s.description??"Course delivered through the CAN learning model."}</p>
      <p className="mt-2 text-xs text-muted-foreground">{s.credits} credit(s) · {enrolled?"Enrolled":s.enrollmentStatus==="withdrawn"?"Previously withdrawn":s.enrollmentStatus==="cancelled"?"Previously dropped":"Available"}</p>
      <p className="mt-1 text-xs text-muted-foreground">Add/drop deadline: {s.policy.addDropEndsOn} · Withdrawal deadline: {s.policy.withdrawalEndsOn}</p>
      {s.policy.prerequisites.length>0&&<p className="mt-1 text-xs text-muted-foreground">Prerequisites: {s.policy.prerequisites.join(", ")}</p>}
      {s.policy.guardianApprovalRequired&&<p className="mt-1 text-xs text-amber-700">This class requires guardian permission. Your guardian can review the request under Family → Study group permissions → Course approvals.</p>}
      {s.withdrawalNotation&&<p className="mt-1 text-xs font-semibold">Transcript notation: {String(s.withdrawalNotation)}</p>}
     </div>
     {role==="registrar"?<span className="rounded-lg border border-border px-3 py-2 text-xs font-semibold">Decision mode below</span>:
     <div className="flex flex-wrap gap-2">
      {pending?<span className="rounded-lg bg-stone-warm px-3 py-2 text-xs font-semibold">Request pending</span>:enrolled?<>
       {today<=s.policy.addDropEndsOn&&<button disabled={busy} onClick={()=>run(()=>requestCourseChange({data:{sectionId:s.id,operation:"drop"}}),"Drop request sent to the registrar.")} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold disabled:opacity-50">Request drop</button>}
       {today<=s.policy.withdrawalEndsOn&&<button disabled={busy} onClick={()=>run(()=>requestCourseChange({data:{sectionId:s.id,operation:"withdraw"}}),"Withdrawal request sent for review.")} className="rounded-lg bg-foreground px-3 py-2 text-xs font-semibold text-background disabled:opacity-50">Request withdrawal</button>}
       {today>s.policy.withdrawalEndsOn&&<span className="text-xs text-muted-foreground">Change period closed</span>}
      </>:today<=s.policy.addDropEndsOn?<button disabled={busy} onClick={()=>run(()=>requestCourseChange({data:{sectionId:s.id,operation:"add"}}),"Course request sent to the registrar.")} className="rounded-lg bg-foreground px-4 py-2 text-xs font-semibold text-background disabled:opacity-50">{s.policy.guardianApprovalRequired?"Request guardian approval":"Request class"}</button>:<span className="text-xs text-muted-foreground">Registration closed</span>
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
