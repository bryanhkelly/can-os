import { useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { getAssignments, saveAssignmentResponse, gradeSyntheticAssignment, returnSyntheticAssignment } from "@/modules/student-experience/assignments.functions";

export const Route=createFileRoute("/student/assignments")({loader:()=>getAssignments(),component:AssignmentsPage});
function AssignmentsPage(){
 const {connected,assignments}=Route.useLoaderData();
 const router=useRouter();
 const [selected,setSelected]=useState<string|null>(null);
 const [role,setRole]=useState<"student"|"teacher">("student");
 const [draft,setDraft]=useState(""),[score,setScore]=useState(85),[feedback,setFeedback]=useState("");
 const [filter,setFilter]=useState("all"),[busy,setBusy]=useState(false),[notice,setNotice]=useState(""),[error,setError]=useState("");
 const chosen=assignments.find(x=>x.assessmentId===selected);
 const items=assignments.filter(x=>filter==="all"||(filter==="todo"&&(!x.status||x.status==="assigned"||x.status==="returned"))||(filter==="submitted"&&x.status==="submitted")||(filter==="feedback"&&x.status==="graded"));
 async function perform(fn:()=>Promise<unknown>,success:string) {
  setBusy(true);setNotice("");setError("");
  try{await fn();setNotice(success);await router.invalidate();}
  catch(err){setError(err instanceof Error?err.message:"Unable to save");}
  finally{setBusy(false);}
 }
 function open(id:string,text:string){setSelected(id);setDraft(text);setNotice("");setError("");}
 const date=(value:string|null)=>value?new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"}).format(new Date(value)):"No deadline";
 return <main className="mx-auto max-w-5xl px-5 py-9 pb-20">
  <Link to="/student" className="text-xs text-muted-foreground hover:underline">← Student Today</Link>
  <p className="mt-8 text-xs font-bold uppercase tracking-widest text-muted-foreground">CAN OS · ASSIGNMENTS · SYNTHETIC NEON</p>
  <h1 className="mt-2 font-serif text-5xl">Your learning work.</h1>
  <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">Start an assignment, submit work, receive teacher feedback, and revise. Everything here operates on our fictional development student and the real Neon assessment/submission tables.</p>
  <div className="mt-6 flex flex-wrap items-center gap-3">
   <label className="text-sm">Preview as <select value={role} onChange={e=>setRole(e.target.value as "student"|"teacher")} className="ml-2 rounded-lg border border-border bg-card p-2"><option value="student">Student</option><option value="teacher">Teacher</option></select></label>
   <span className="rounded-full border border-border px-3 py-2 text-xs font-semibold">{connected?"Synthetic Neon connected":"Not connected"}</span>
  </div>
  {notice&&<p role="status" className="mt-5 rounded-lg border border-emerald-300 bg-card p-3 text-sm">{notice}</p>}
  {error&&<p role="alert" className="mt-5 rounded-lg border border-red-300 bg-card p-3 text-sm">{error}</p>}
  <div className="mt-8 grid gap-3 sm:grid-cols-3">
   <div className="rounded-xl border border-border bg-card p-5"><p className="text-xs text-muted-foreground">Assigned</p><p className="mt-2 font-serif text-4xl">{assignments.length}</p></div>
   <div className="rounded-xl border border-border bg-card p-5"><p className="text-xs text-muted-foreground">Ready for feedback</p><p className="mt-2 font-serif text-4xl">{assignments.filter(x=>x.status==="submitted").length}</p></div>
   <div className="rounded-xl border border-border bg-card p-5"><p className="text-xs text-muted-foreground">Graded</p><p className="mt-2 font-serif text-4xl">{assignments.filter(x=>x.status==="graded").length}</p></div>
  </div>
  <div className="mt-8 flex flex-wrap gap-2">{([["all","All work"],["todo","To do / revise"],["submitted","Submitted"],["feedback","Feedback"]] as const).map(([id,label])=><button key={id} onClick={()=>setFilter(id)} className={`rounded-full border px-4 py-2 text-xs font-semibold ${filter===id?"bg-foreground text-background":"border-border bg-card"}`}>{label}</button>)}</div>
  <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
   <div className="space-y-3">{items.map(item=><button key={item.assessmentId} onClick={()=>open(item.assessmentId,item.responseText ?? "")} className={`w-full rounded-xl border bg-card p-5 text-left hover:border-foreground/40 ${selected===item.assessmentId?"border-foreground":"border-border"}`}>
    <p className="text-xs text-muted-foreground">{item.course} · {item.status??"not started"}</p><h3 className="mt-2 font-semibold">{item.title}</h3><p className="mt-2 text-xs text-muted-foreground">Due {date(item.dueAt)}</p>
    {item.score!==null&&item.score!==undefined&&<p className="mt-1 text-xs font-semibold">Score: {item.score} / {item.pointsPossible??100}</p>}
   </button>)}{!items.length&&<p className="rounded-xl border border-border p-5 text-sm text-muted-foreground">No assignments in this view.</p>}</div>
   <div className="min-w-0">{chosen?<div className="rounded-2xl border border-border bg-card p-6">
    <p className="text-xs text-muted-foreground">{chosen.course}</p><h2 className="mt-2 font-serif text-3xl">{chosen.title}</h2>
    <p className="mt-3 text-sm leading-7 text-muted-foreground">{chosen.instructions??"Follow the course instructions."}</p>
    <p className="mt-3 text-xs text-muted-foreground">Due: {date(chosen.dueAt)}</p>
    {chosen.feedbackText&&<div className="mt-5 rounded-xl bg-stone-warm p-4"><p className="text-xs font-bold">Teacher feedback</p><p className="mt-2 text-sm">{chosen.feedbackText}</p></div>}
    {role==="student"&&(!chosen.status||chosen.status==="assigned"||chosen.status==="returned")&&<div className="mt-6">
     <label className="text-sm font-semibold">Your response</label><textarea rows={7} maxLength={20000} value={draft} onChange={e=>setDraft(e.target.value)} className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-sm" placeholder="Write your response…"/>
     <button disabled={busy||draft.trim().length<3} onClick={()=>perform(()=>saveAssignmentResponse({data:{assessmentId:chosen.assessmentId,text:draft}}),"Your work has been submitted to Neon.")} className="mt-3 rounded-lg bg-foreground px-5 py-3 text-sm font-semibold text-background disabled:opacity-40">Submit work</button>
    </div>}
    {role==="student"&&chosen.status==="submitted"&&<p className="mt-5 rounded-xl bg-stone-warm p-4 text-sm">Submitted successfully. Your teacher can review your work.</p>}
    {role==="teacher"&&chosen.status==="submitted"&&chosen.submissionId&&<div className="mt-5 space-y-3">
     <p className="text-xs font-bold uppercase tracking-wider">Student response</p><p className="rounded-xl bg-stone-warm p-4 text-sm">{chosen.responseText}</p>
     <label className="block text-sm">Score (%) <input type="number" min={0} max={100} value={score} onChange={e=>setScore(Number(e.target.value))} className="ml-3 w-20 rounded-lg border border-border bg-background p-2"/></label>
     <textarea value={feedback} onChange={e=>setFeedback(e.target.value)} rows={3} className="w-full rounded-lg border border-border bg-background p-3 text-sm" placeholder="Useful feedback and next steps…"/>
     <button disabled={busy} onClick={()=>perform(()=>gradeSyntheticAssignment({data:{submissionId:chosen.submissionId!,score,comment:feedback}}),"Teacher grade and feedback saved.")} className="rounded-lg bg-foreground px-4 py-3 text-sm font-semibold text-background">Post grade</button>
    </div>}
    {role==="teacher"&&chosen.status==="graded"&&chosen.submissionId&&<button disabled={busy} onClick={()=>perform(()=>returnSyntheticAssignment({data:{submissionId:chosen.submissionId!}}),"Assignment returned for revision.")} className="mt-5 rounded-lg bg-foreground px-4 py-3 text-sm font-semibold text-background">Return for revision</button>}
   </div>:<div className="rounded-2xl border border-border bg-card p-7"><h2 className="font-serif text-2xl">Select an assignment</h2><p className="mt-3 text-sm text-muted-foreground">Open work on the left to see instructions, progress, feedback and available actions.</p></div>}</div>
  </div>
  <p className="mt-8 text-xs text-muted-foreground">Synthetic-only preview. Teacher/student selector is not authentication. Revisions update the synthetic submission record; multi-attempt version history is a future addition.</p>
 </main>;
}
