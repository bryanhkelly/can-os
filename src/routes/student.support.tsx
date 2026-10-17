import { useEffect, useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { advanceSupportReferral, createSupportReferral, getSupportReferrals, listTeacherReferralStudents, saveSyntheticSupportPlan, scheduleSyntheticSupportService, completeSyntheticSupportService } from "@/modules/support/support-referrals.functions";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";

const loadSupportReferrals=()=>getSupportReferrals();
export const Route=createFileRoute("/student/support")({
 loader:safeLoader(loadSupportReferrals,{authMessage:"Sign in with an authorized student account to view student support."}),
 component:SupportPage,
});
const destinations=[
 {value:"academic",label:"Academic coaching"},{value:"attendance",label:"Attendance and engagement"},
 {value:"learning",label:"Learning specialist"},{value:"personal",label:"School counselor"},
 {value:"planning",label:"College and career planning"},
] as const;
const stages=["submitted","accepted","plan_created","in_service","review","closed"] as const;
function SupportPage(){
 const outcome=Route.useLoaderData();
 if(!outcome.ok)return <LoaderFailure eyebrow="CAN OS · Student support" title="Student support that follows through." outcome={outcome}/>;
 return <SupportView referrals={outcome.data}/>;
}
function SupportView({referrals}:{referrals:Awaited<ReturnType<typeof loadSupportReferrals>>}){
 const router=useRouter();
 const [role,setRole]=useState<"teacher"|"specialist"|null>(null);
 const [students,setStudents]=useState<{id:string;name:string;sectionTitle:string}[]>([]);
 const [studentProfileId,setStudentProfileId]=useState("");
 const [category,setCategory]=useState<typeof destinations[number]["value"]>("academic");
 const [priority,setPriority]=useState<"normal"|"high">("normal");
 const [observations,setObservations]=useState("");
 const [includeEvidence,setIncludeEvidence]=useState(true);
 const [selected,setSelected]=useState<string|null>(null);
 const [note,setNote]=useState("");
 const [goal,setGoal]=useState("Improve writing confidence and thesis development");
 const [intervention,setIntervention]=useState("Three academic coaching sessions with a targeted writing exercise");
 const [reviewDate,setReviewDate]=useState("2026-11-15");
 const [serviceDate,setServiceDate]=useState("2026-10-26T14:00");
 const [serviceKind,setServiceKind]=useState<"tutoring"|"coaching"|"planning"|"learning_support">("coaching");
 const [area,setArea]=useState<"academic"|"learning"|"counselor"|"planning">("academic");
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
 const chosen=referrals.find(r=>r.id===selected);
 useEffect(()=>{
  let active=true;
  fetch("/access/session",{credentials:"same-origin",cache:"no-store"})
   .then(async response=>{
    if(!response.ok)throw new Error("Session required");
    return response.json() as Promise<{role:string}>;
   }).then(async session=>{
    if(session.role!=="teacher"&&session.role!=="specialist")throw new Error("Authorized staff role required");
    if(!active)return;
    setRole(session.role);
    if(session.role==="teacher"){
     const rows=await listTeacherReferralStudents();
     if(active)setStudents(rows);
    }
   }).catch(()=>{if(active)setError("Open this workspace with an authorized teacher or specialist membership.");});
  return()=>{active=false;};
 },[]);
 useEffect(()=>{const params=new URLSearchParams(window.location.search);const referral=params.get("referral");const assessment=params.get("assessment");if(referral&&referrals.some(r=>r.id===referral))setSelected(referral);if(assessment){setCategory("academic");setObservations("Academic support requested after review of assignment "+assessment+". Please review the assessment evidence and plan targeted assistance.");setIncludeEvidence(true);}},[referrals]);
 async function execute(work:()=>Promise<unknown>,success:string) {
  setBusy(true);setError("");setMessage("");
  try{await work();await router.invalidate();setMessage(success);setNote("");}
  catch(e){setError(e instanceof Error?e.message:"Could not save changes");}
  finally{setBusy(false);}
 }
 const next=chosen?stages[stages.indexOf(chosen.stage as typeof stages[number])+1]:undefined;
 if(!role&& !error)return <main className="mx-auto max-w-6xl px-5 py-10" role="status">Loading authorized support workspace…</main>;
 return <main className="mx-auto max-w-6xl px-5 pb-24 pt-9">
  <Link to={role==="teacher"?"/teacher":"/coach"} className="text-xs font-semibold text-muted-foreground hover:underline">← Workspace home</Link>
  <p className="mt-8 text-xs font-bold uppercase tracking-widest text-muted-foreground">CAN OS · GF41 · SYNTHETIC DEVELOPMENT WORKSPACE</p>
  <h1 className="mt-2 font-serif text-5xl">Student support that follows through.</h1>
  <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">A teacher raises a concern, a support professional accepts responsibility, and everyone can see the appropriate status and next step.</p>
  <div className="mt-7 flex flex-wrap items-center gap-4">
   <span className="text-sm">Verified staff role: <strong>{role??"Unavailable"}</strong></span>
   <span className="rounded-full border border-border px-3 py-2 text-xs font-semibold">{referrals.length} referral(s)</span>
  </div>
  {error&&<p role="alert" className="mt-5 rounded-lg border border-red-300 p-3 text-sm">{error}</p>}
  {message&&<p role="status" className="mt-5 rounded-lg border border-emerald-300 p-3 text-sm">{message}</p>}
  <div className="mt-8 grid gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
   <section>
    <h2 className="font-serif text-3xl">{role==="teacher"?"My referrals":"Support caseload"}</h2>
    <div className="mt-4 space-y-3">
     {referrals.map(item=><button key={item.id} onClick={()=>{setSelected(item.id);setNote("");}} className={`w-full rounded-xl border bg-card p-5 text-left hover:border-foreground/40 ${selected===item.id?"border-foreground":"border-border"}`}>
      <div className="flex flex-wrap justify-between gap-2"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{item.category} · {item.priority}</p><span className="rounded-full bg-stone-warm px-2 py-1 text-xs">{item.stage.replaceAll("_"," ")}</span></div>
      <h3 className="mt-2 text-base font-semibold">{item.title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
      <p className="mt-3 text-xs text-muted-foreground">Assigned: {item.assignedTo}</p>
      {role==="teacher"&&item.academicRecommendation&&<p className="mt-2 rounded-lg bg-stone-warm p-3 text-xs">Academic update: {item.academicRecommendation}</p>}
     </button>)}
    </div>
   </section>
   {role==="teacher"?<section className="h-fit rounded-2xl border border-border bg-card p-6">
    <h2 className="font-serif text-3xl">Refer for support</h2>
    <label className="mt-3 block text-sm font-semibold">Student
     <select aria-label="Select student for referral" value={studentProfileId} onChange={event=>setStudentProfileId(event.target.value)} className="mt-2 w-full rounded-lg border bg-background p-3 text-sm">
      <option value="">Choose a student in your classes</option>
      {students.map(student=><option key={student.id} value={student.id}>{student.name} · {student.sectionTitle}</option>)}
     </select>
    </label>
    <label className="mt-5 block text-sm font-semibold">Reason
     <select value={category} onChange={e=>setCategory(e.target.value as typeof category)} className="mt-2 w-full rounded-lg border border-border bg-background p-3 text-sm">
      {destinations.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}
     </select>
    </label>
    <label className="mt-4 block text-sm font-semibold">Priority
     <select value={priority} onChange={e=>setPriority(e.target.value as typeof priority)} className="mt-2 w-full rounded-lg border border-border bg-background p-3 text-sm"><option value="normal">Routine</option><option value="high">Priority</option></select>
    </label>
    <label className="mt-4 block text-sm font-semibold">Observations
     <textarea value={observations} onChange={e=>setObservations(e.target.value)} rows={5} placeholder="Describe the learning concern, its impact and what has been tried" className="mt-2 w-full rounded-lg border border-border bg-background p-3 text-sm"/>
    </label>
    <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" checked={includeEvidence} onChange={e=>setIncludeEvidence(e.target.checked)} className="mt-1"/> Include relevant academic evidence</label>
    <p className="mt-4 rounded-lg bg-stone-warm p-3 text-xs">This routes to a designated support function. Urgent safeguarding concerns require a separate immediate-response pathway.</p>
    <button disabled={busy||!studentProfileId||observations.trim().length<3} onClick={()=>execute(()=>createSupportReferral({data:{category,priority,observations,includeEvidence,studentProfileId}}),"Referral saved for triage.")} className="mt-4 w-full rounded-xl bg-foreground px-4 py-3 text-sm font-semibold text-background disabled:opacity-40">Submit referral</button>
   </section>:<section className="h-fit rounded-2xl border border-border bg-card p-6">
    <h2 className="font-serif text-3xl">Triage & service record</h2>
    {chosen?<>
     <p className="mt-3 text-sm font-semibold">{chosen.title}</p>
     <p className="mt-2 text-sm text-muted-foreground">{chosen.description}</p>
     <p className="mt-4 text-xs text-muted-foreground">Current: {chosen.stage.replaceAll("_"," ")} · Owner: {chosen.assignedTo}</p>
     <label className="mt-5 block text-sm">Assign to
      <select value={area} onChange={e=>setArea(e.target.value as typeof area)} className="mt-2 w-full rounded-lg border border-border bg-background p-3 text-sm">
       <option value="academic">Academic Coach</option><option value="learning">Learning Specialist</option><option value="counselor">School Counselor</option><option value="planning">College & Career Advisor</option>
      </select>
     </label>
     <label className="mt-4 block text-sm">Support update
      <textarea value={note} onChange={e=>setNote(e.target.value)} rows={4} placeholder="Summarize action, academic recommendations or review outcome" className="mt-2 w-full rounded-lg border border-border bg-background p-3 text-sm"/>
     </label>
     {chosen.stage==="accepted"&&<div className="mt-5 rounded-xl border border-border p-4">
      <h3 className="font-semibold">Create support plan</h3>
      <label className="mt-3 block text-xs">Student goal<input value={goal} onChange={e=>setGoal(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm"/></label>
      <label className="mt-3 block text-xs">Intervention<textarea value={intervention} onChange={e=>setIntervention(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm"/></label>
      <label className="mt-3 block text-xs">Review target<input type="date" value={reviewDate} onChange={e=>setReviewDate(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm"/></label>
      <button disabled={busy} onClick={()=>execute(()=>saveSyntheticSupportPlan({data:{referralId:chosen.id,goal,intervention,targetDate:reviewDate}}),"Support plan saved to Neon.")} className="mt-3 rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background">Save support plan</button>
     </div>}
     {chosen.plan&&<div className="mt-5 rounded-xl bg-stone-warm p-4 text-sm"><p className="font-semibold">Support plan</p><p className="mt-2">Goal: {chosen.plan.goal}</p><p className="mt-2">Intervention: {chosen.plan.intervention}</p><p className="mt-2 text-xs">Review: {chosen.plan.targetDate.slice(0,10)}</p></div>}
     {["plan_created","in_service"].includes(chosen.stage)&&<div className="mt-5 rounded-xl border border-border p-4">
       <h3 className="font-semibold">Schedule student support</h3>
       <label className="mt-3 block text-xs">Service type<select value={serviceKind} onChange={e=>setServiceKind(e.target.value as typeof serviceKind)} className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm"><option value="coaching">Academic coaching</option><option value="tutoring">Tutoring</option><option value="learning_support">Learning support</option><option value="planning">College/career planning</option></select></label>
       <label className="mt-3 block text-xs">Meeting time<input type="datetime-local" value={serviceDate} onChange={e=>setServiceDate(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm"/></label>
       <button disabled={busy} onClick={()=>execute(()=>scheduleSyntheticSupportService({data:{referralId:chosen.id,kind:serviceKind,scheduledAt:new Date(serviceDate).toISOString()}}),"Support service scheduled in Neon.")} className="mt-3 rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background">Schedule service</button>
     </div>}
     {chosen.services.map(service=><div key={service.id} className="mt-3 rounded-xl border border-border p-4">
       <p className="text-sm font-semibold">{service.kind.replaceAll("_"," ")} · {service.status}</p>
       <p className="mt-1 text-xs text-muted-foreground">{new Date(service.scheduledAt).toLocaleString()}</p>
       {service.outcome&&<p className="mt-2 text-xs">Outcome: {service.outcome}</p>}
       {service.status==="scheduled"&&<button disabled={busy||note.trim().length<3} onClick={()=>execute(()=>completeSyntheticSupportService({data:{referralId:chosen.id,serviceId:service.id,outcome:note}}),"Service completion documented.")} className="mt-3 rounded-lg border border-border px-3 py-2 text-xs">Record completed service using note</button>}
     </div>)}
     {next&&next!=="plan_created"&&next!=="in_service"?<button disabled={busy||note.trim().length<3} onClick={()=>execute(()=>advanceSupportReferral({data:{referralId:chosen.id,nextStage:next,note,area}}),`Referral advanced to ${next.replaceAll("_"," ")}.`)} className="mt-4 w-full rounded-xl bg-foreground px-4 py-3 text-sm font-semibold text-background disabled:opacity-40">Move to {next.replaceAll("_"," ")}</button>:<p className="mt-4 text-sm font-semibold">Referral closed</p>}
    </>:<p className="mt-4 text-sm text-muted-foreground">Select a referral from your caseload to accept, plan, monitor or close it.</p>}
   </section>}
  </div>
  <p className="mt-8 text-xs leading-6 text-muted-foreground">Access is controlled by your verified staff membership and the student’s school and program relationships. Confidential safeguarding cases require a separate immediate-response pathway.</p>
 </main>;
}
