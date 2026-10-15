import { RubricGrader } from "@/components/student/RubricGrader";
import { useEffect, useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { getAssignments, saveAssignmentResponse, gradeSyntheticAssignment, returnSyntheticAssignment, createSyntheticAssignment, getSyntheticAssignmentHistory, saveSyntheticAssignmentDraft, manageSyntheticAssignment } from "@/modules/student-experience/assignments.functions";

export const Route=createFileRoute("/student/assignments")({loader:()=>getAssignments(),component:AssignmentsPage});
function AssignmentsPage(){
 const {connected,assignments}=Route.useLoaderData();
 const router=useRouter();
 const [selected,setSelected]=useState<string|null>(null);
 const [role,setRole]=useState<"student"|"teacher">("student");
 const [newTitle,setNewTitle]=useState(""),[newInstructions,setNewInstructions]=useState(""),[newRubric,setNewRubric]=useState(""),[newSection,setNewSection]=useState(""),[newDue,setNewDue]=useState("2026-11-15T16:00"),[newPoints,setNewPoints]=useState(100);
 const [draft,setDraft]=useState(""),[score,setScore]=useState(85),[feedback,setFeedback]=useState("");
 const [filter,setFilter]=useState("all"),[busy,setBusy]=useState(false),[notice,setNotice]=useState(""),[error,setError]=useState("");
 const [draftState,setDraftState]=useState<"idle"|"saving"|"saved"|"error">("idle");
 const chosen=assignments.find(x=>x.assessmentId===selected);
 useEffect(()=>{const value=new URLSearchParams(window.location.search).get("assessment");if(value&&assignments.some(x=>x.assessmentId===value))setSelected(value);},[assignments]);
 const sections=[...new Map(assignments.map(x=>[x.sectionId,{id:x.sectionId,course:x.course}])).values()];
 const items=assignments.filter(x=>filter==="all"||(filter==="todo"&&(!x.status||x.status==="assigned"||x.status==="returned"))||(filter==="submitted"&&x.status==="submitted")||(filter==="feedback"&&x.status==="graded"));
 async function perform(fn:()=>Promise<unknown>,success:string) {
  setBusy(true);setNotice("");setError("");
  try{await fn();setNotice(success);await router.invalidate();}
  catch(err){setError(err instanceof Error?err.message:"Unable to save");}
  finally{setBusy(false);}
 }
 function open(id:string,text:string){setSelected(id);setDraft(text);setDraftState("idle");setNotice("");setError("");}
 useEffect(()=>{
  if(!chosen||role!=="student"||!(!chosen.status||chosen.status==="assigned"||chosen.status==="returned")||chosen.assessmentStatus!=="published"||draft===chosen.responseText)return;
  const timer=setTimeout(()=>{
   setDraftState("saving");
   saveSyntheticAssignmentDraft({data:{assessmentId:chosen.assessmentId,text:draft}})
    .then(()=>setDraftState("saved")).catch(()=>setDraftState("error"));
  },900);
  return ()=>clearTimeout(timer);
 },[chosen?.assessmentId,chosen?.status,chosen?.responseText,role,draft]);
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
  {role==="teacher"&&<section className="mt-7 rounded-2xl border border-border bg-card p-5">
   <h2 className="font-serif text-2xl">Create assignment</h2>
   <div className="mt-4 grid gap-3 sm:grid-cols-2">
    <label className="text-sm">Course<select className="mt-1 w-full rounded-lg border border-border bg-background p-2" value={newSection} onChange={e=>setNewSection(e.target.value)}><option value="">Select course</option>{sections.map(x=><option key={x.id} value={x.id}>{x.course}</option>)}</select></label>
    <label className="text-sm">Due date<input type="datetime-local" value={newDue} onChange={e=>setNewDue(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background p-2"/></label>
    <input aria-label="Assignment title" placeholder="Assignment title" value={newTitle} onChange={e=>setNewTitle(e.target.value)} className="rounded-lg border border-border bg-background p-3 text-sm"/>
    <input aria-label="Points possible" type="number" min={1} max={1000} value={newPoints} onChange={e=>setNewPoints(Number(e.target.value))} className="rounded-lg border border-border bg-background p-3 text-sm"/>
   </div>
   <textarea aria-label="Instructions" rows={3} placeholder="Instructions" value={newInstructions} onChange={e=>setNewInstructions(e.target.value)} className="mt-3 w-full rounded-lg border border-border bg-background p-3 text-sm"/>
   <textarea aria-label="Rubric" rows={2} placeholder="Rubric or grading criteria" value={newRubric} onChange={e=>setNewRubric(e.target.value)} className="mt-3 w-full rounded-lg border border-border bg-background p-3 text-sm"/>
   <button disabled={busy||!newSection||newTitle.trim().length<3} onClick={()=>perform(()=>createSyntheticAssignment({data:{sectionId:newSection,title:newTitle,instructions:newInstructions,dueAt:new Date(newDue).toISOString(),pointsPossible:newPoints,rubric:newRubric}}),"Published and assigned to active students.")} className="mt-3 rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50">Publish assignment</button>
  </section>}
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
    <p className="mt-3 text-xs text-muted-foreground">Due: {date(chosen.dueAt)} · {chosen.assessmentStatus}</p>
    {typeof chosen.metadata?.rubric==="string"&&chosen.metadata.rubric&&<div className="mt-4 rounded-xl bg-stone-warm p-4 text-sm"><strong>Rubric:</strong> {chosen.metadata.rubric}</div>}
    {chosen.attempts.length>1&&<div className="mt-4 rounded-xl border border-border p-4"><p className="text-xs font-bold">Revision history</p>{[...chosen.attempts].sort((a,b)=>b.attempt-a.attempt).map(attempt=><p key={attempt.attempt} className="mt-2 text-xs">Attempt {attempt.attempt} · {attempt.status}{attempt.score!==null?` · ${attempt.score} points`:""}{attempt.feedback?` · ${attempt.feedback}`:""}</p>)}</div>}
    {chosen.rubricResult&&<div className="mt-4 rounded-xl border border-border p-4"><p className="font-semibold text-sm">Criterion results</p><pre className="mt-2 overflow-auto text-xs">{JSON.stringify(chosen.rubricResult,null,2)}</pre></div>}
    {role==="teacher"&&<Link to="/student/support" className="mt-4 block rounded-xl border border-border bg-stone-warm p-4 text-sm font-semibold hover:border-foreground/40">Refer this student for academic support →</Link>}
    {chosen.feedbackText&&<div className="mt-5 rounded-xl bg-stone-warm p-4"><p className="text-xs font-bold">Teacher feedback</p><p className="mt-2 text-sm">{chosen.feedbackText}</p></div>}
    {role==="student"&&chosen.assessmentStatus==="published"&&(!chosen.status||chosen.status==="assigned"||chosen.status==="returned")&&<div className="mt-6">
     <label className="text-sm font-semibold">Your response</label><textarea rows={7} maxLength={20000} value={draft} onChange={e=>setDraft(e.target.value)} className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-sm" placeholder="Write your response…"/>
     <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">Draft: {draftState==="saving"?"Saving…":draftState==="saved"?"Saved to Neon":draftState==="error"?"Could not autosave":"Ready"}</p>
     <button disabled={busy||draft.trim().length<3} onClick={()=>perform(()=>saveAssignmentResponse({data:{assessmentId:chosen.assessmentId,text:draft}}),"Your work has been submitted to Neon.")} className="mt-3 rounded-lg bg-foreground px-5 py-3 text-sm font-semibold text-background disabled:opacity-40">Submit work</button>
    </div>}
    {role==="student"&&chosen.status==="submitted"&&<p className="mt-5 rounded-xl bg-stone-warm p-4 text-sm">Submitted successfully. Your teacher can review your work.</p>}
    {role==="teacher"&&chosen.status==="submitted"&&chosen.submissionId&&chosen.metadata.criteria.length>0&&<RubricGrader submissionId={chosen.submissionId} criteria={chosen.metadata.criteria} onSaved={()=>router.invalidate()}/>}
    {role==="teacher"&&chosen.status==="submitted"&&chosen.submissionId&&chosen.metadata.criteria.length===0&&<div className="mt-5 space-y-3">
     <p className="text-xs font-bold uppercase tracking-wider">Student response</p><p className="rounded-xl bg-stone-warm p-4 text-sm">{chosen.responseText}</p>
     <label className="block text-sm">Score (%) <input type="number" min={0} max={100} value={score} onChange={e=>setScore(Number(e.target.value))} className="ml-3 w-20 rounded-lg border border-border bg-background p-2"/></label>
     <textarea value={feedback} onChange={e=>setFeedback(e.target.value)} rows={3} className="w-full rounded-lg border border-border bg-background p-3 text-sm" placeholder="Useful feedback and next steps…"/>
     <button disabled={busy} onClick={()=>perform(()=>gradeSyntheticAssignment({data:{submissionId:chosen.submissionId!,score,comment:feedback}}),"Teacher grade and feedback saved.")} className="rounded-lg bg-foreground px-4 py-3 text-sm font-semibold text-background">Post grade</button>
    </div>}
    {role==="teacher"&&chosen.metadata?.synthetic===true&&<div className="mt-5 flex flex-wrap gap-2"><button onClick={()=>perform(()=>manageSyntheticAssignment({data:{assessmentId:chosen.assessmentId,action:"close"}}),"Assignment closed.")} className="rounded-lg border border-border px-3 py-2 text-xs">Close</button><button onClick={()=>perform(()=>manageSyntheticAssignment({data:{assessmentId:chosen.assessmentId,action:"reopen"}}),"Assignment reopened.")} className="rounded-lg border border-border px-3 py-2 text-xs">Reopen</button></div>}
    {role==="teacher"&&chosen.status==="graded"&&chosen.submissionId&&<button disabled={busy} onClick={()=>perform(()=>returnSyntheticAssignment({data:{submissionId:chosen.submissionId!}}),"Assignment returned for revision.")} className="mt-5 rounded-lg bg-foreground px-4 py-3 text-sm font-semibold text-background">Return for revision</button>}
   </div>:<div className="rounded-2xl border border-border bg-card p-7"><h2 className="font-serif text-2xl">Select an assignment</h2><p className="mt-3 text-sm text-muted-foreground">Open work on the left to see instructions, progress, feedback and available actions.</p></div>}</div>
  </div>
  <p className="mt-8 text-xs text-muted-foreground">Synthetic-only preview. Teacher/student selector is not authentication. Revisions update the synthetic submission record; multi-attempt version history is a future addition.</p>
 </main>;
}
