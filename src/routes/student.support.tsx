import { useEffect, useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { advanceSupportReferral, createSupportReferral, getSupportReferrals, getSupportViewerRole, listTeacherReferralStudents, saveSupportPlan, scheduleSupportService, completeSupportService } from "@/modules/support/support-referrals.functions";
import { safeLoader } from "@/lib/safe-loader";
import {getQuickWinActions,requestQuickWinHelp} from "@/modules/actions/student-actions.functions";
import { LoaderFailure } from "@/lib/loader-failure";
import { isStudentSupportAction } from "@/modules/actions/student-action-policy";
import { EmptyState, StatusBadge, WorkspaceNotice, WorkspacePanel, WorkspaceShell } from "@/components/workspace";

const loadSupportReferrals=async()=>{
 const viewer=await getSupportViewerRole();
 if(viewer.role==="student"){
  const data=await getQuickWinActions();
  return {viewerRole:"student" as const,actions:data.actions};
 }
 return {viewerRole:viewer.role,referrals:await getSupportReferrals()};
};
export const Route=createFileRoute("/student/support")({
 validateSearch:(search:Record<string,unknown>):{referral?:string;assessment?:string}=>({
  referral:typeof search.referral==="string"?search.referral:undefined,
  assessment:typeof search.assessment==="string"?search.assessment:undefined,
 }),
 loader:safeLoader(loadSupportReferrals,{authMessage:"Sign in with an authorized student, teacher, or specialist account to view support."}),
 component:SupportPage,
});
function StudentSupportView({actions}:{actions:Awaited<ReturnType<typeof getQuickWinActions>>["actions"]}){
 const router=useRouter();
 const [message,setMessage]=useState("");
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState("");
 const [error,setError]=useState("");
 const relevant=actions.filter(action=>isStudentSupportAction(action.type));
 async function askForHelp(){
  setBusy(true);setError("");setNotice("");
  try{
   await requestQuickWinHelp({data:{message}});
   setMessage("");
   await router.invalidate();
   setNotice("Your support request has been recorded.");
  }catch(cause){
   setError(cause instanceof Error?cause.message:"Unable to request support");
  }finally{setBusy(false);}
 }
 return <WorkspaceShell eyebrow="CAN OS · Student support" title="Get help and follow through."
  subtitle="Your open support requests and recovery actions appear here. Teachers and support staff manage the private referral and service records in their own workspaces."
  breadcrumbs={<Link to="/student" className="underline">Student Today</Link>}>
  {error&&<WorkspaceNotice tone="danger" className="mb-5">{error}</WorkspaceNotice>}
  {notice&&<WorkspaceNotice tone="success" className="mb-5">{notice}</WorkspaceNotice>}
  <WorkspacePanel title="Ask your school for help">
   <label className="block text-sm">What do you need help with?
    <textarea value={message} onChange={event=>setMessage(event.target.value)}
      rows={4} maxLength={1000} className="mt-2 w-full rounded border bg-background p-3"
      placeholder="Describe the schoolwork, learning, or support concern"/>
   </label>
   <button type="button" disabled={busy||message.trim().length<3}
     onClick={askForHelp} className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40">Send request</button>
  </WorkspacePanel>
  <section className="mt-7">
   <h2 className="font-serif text-2xl">Your support actions</h2>
   {relevant.length===0&&<EmptyState className="mt-3" title="No support actions recorded yet."/>}
   <div className="mt-3 space-y-3">{relevant.map(action=>{
    const target=action.subjectType==="assessment"&&action.subjectId
     ?{to:"/student/assignments" as const,search:{assessment:action.subjectId}}
     :{to:"/student/experiences" as const,search:{action:action.id}};
    return <article key={action.id} className="rounded-xl border bg-card p-4">
    <p className="font-semibold"><Link {...target} className="hover:underline">{action.title}</Link></p>
    <p className="mt-2 text-sm text-muted-foreground">{action.description}</p>
    <StatusBadge tone={action.status==="resolved"?"success":"info"}>Status: {action.status.replaceAll("_"," ")}</StatusBadge>
    <Link {...target} className="mt-3 inline-block text-sm underline">{target.to==="/student/assignments"?"Review assignment":"Review action"} →</Link>
   </article>;})}</div>
  </section>
 </WorkspaceShell>;
}

const destinations=[
 {value:"academic",label:"Academic coaching"},{value:"attendance",label:"Attendance and engagement"},
 {value:"learning",label:"Learning specialist"},{value:"personal",label:"School counselor"},
 {value:"planning",label:"College and career planning"},
] as const;
const stages=["submitted","accepted","plan_created","in_service","review","closed"] as const;
function SupportPage(){
 const outcome=Route.useLoaderData();
 const search=Route.useSearch();
 if(!outcome.ok)return <LoaderFailure eyebrow="CAN OS · Student support" title="Student support that follows through." outcome={outcome}/>;
 if(outcome.data.viewerRole==="student")return <StudentSupportView actions={outcome.data.actions}/>;
 return <SupportView key={JSON.stringify(search)} referrals={outcome.data.referrals} role={outcome.data.viewerRole} search={search}/>;
}
export function SupportView({referrals,role,search,route="/student/support"}:{referrals:Awaited<ReturnType<typeof getSupportReferrals>>;role:"teacher"|"specialist"|"counselor";search:{referral?:string;assessment?:string};route?:"/student/support"|"/support"}){
 const router=useRouter();
 const [students,setStudents]=useState<{id:string;name:string;sectionTitle:string}[]>([]);
 const [studentProfileId,setStudentProfileId]=useState("");
 const [category,setCategory]=useState<typeof destinations[number]["value"]>("academic");
 const [priority,setPriority]=useState<"normal"|"high">("normal");
 const [observations,setObservations]=useState("");
 const [includeEvidence,setIncludeEvidence]=useState(true);
 const selected=search.referral??null;
 const [note,setNote]=useState("");
 const [goal,setGoal]=useState("");
 const [intervention,setIntervention]=useState("");
 const [reviewDate,setReviewDate]=useState("");
 const [serviceDate,setServiceDate]=useState("");
 const [serviceKind,setServiceKind]=useState<"tutoring"|"coaching"|"planning"|"learning_support">("coaching");
 const [area,setArea]=useState<"academic"|"learning"|"counselor"|"planning">(()=>referrals.find(item=>item.id===search.referral)?.requestedArea??(role==="counselor"?"counselor":"academic"));
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
 const chosen=referrals.find(r=>r.id===selected);
 useEffect(()=>{
  if(role!=="teacher")return;
  let active=true;
  listTeacherReferralStudents().then(rows=>{if(active)setStudents(rows);})
   .catch(()=>{if(active)setError("Unable to load students for referral.");});
  return()=>{active=false;};
 },[role]);
 useEffect(()=>{if(search.assessment){setCategory("academic");setObservations("Academic support requested after review of assignment "+search.assessment+". Please review the assessment evidence and plan targeted assistance.");setIncludeEvidence(true);}},[search.assessment]);
 async function execute(work:()=>Promise<unknown>,success:string) {
  setBusy(true);setError("");setMessage("");
  try{await work();await router.invalidate();setMessage(success);setNote("");}
  catch(e){setError(e instanceof Error?e.message:"Could not save changes");}
  finally{setBusy(false);}
 }
 const next=chosen?stages[stages.indexOf(chosen.stage as typeof stages[number])+1]:undefined;
 return <WorkspaceShell width="wide" eyebrow="CAN OS · Student support" title="Student support that follows through."
  subtitle={<>A teacher raises a concern, a support professional accepts responsibility, and everyone can see the appropriate status and next step.<span className="mt-2 block text-xs">School-support records are shared with authorized staff. Do not enter clinical or private counseling notes here.</span></>}
  breadcrumbs={<Link to={role==="teacher"?"/teacher":role==="counselor"?"/counselor":"/coach"} className="underline">Workspace home</Link>}
  actions={<StatusBadge tone="info">{referrals.length} referral(s)</StatusBadge>}>
  <p className="mb-5 text-sm">Verified staff role: <strong>{role??"Unavailable"}</strong></p>
  {error&&<WorkspaceNotice tone="danger" className="mb-5">{error}</WorkspaceNotice>}
  {message&&<WorkspaceNotice tone="success" className="mb-5">{message}</WorkspaceNotice>}
  {selected&&<Link to={route} search={{}} className="mb-4 inline-block text-sm underline">View all referrals</Link>}
  {selected&&!chosen&&<WorkspaceNotice tone="danger" className="mb-4">This referral is unavailable in your current support workspace.</WorkspaceNotice>}
  <div className="mt-8 grid gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
   <section>
    <h2 className="font-serif text-3xl">{role==="teacher"?"My referrals":"Support caseload"}</h2>
    <div className="mt-4 space-y-3">
     {referrals.filter(item=>!selected||item.id===selected).map(item=><Link key={item.id} to={route} search={{referral:item.id}} className={`block w-full rounded-xl border bg-card p-5 text-left hover:border-foreground/40 ${selected===item.id?"border-foreground":"border-border"}`}>
      <div className="flex flex-wrap justify-between gap-2"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{item.category} · {item.priority}</p><StatusBadge tone={item.stage==="closed"?"success":"info"}>{item.stage.replaceAll("_"," ")}</StatusBadge></div>
      <h3 className="mt-2 text-base font-semibold">{item.title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
      <p className="mt-3 text-xs text-muted-foreground">Assigned: {item.assignedTo}</p>
      {role==="teacher"&&item.academicRecommendation&&<p className="mt-2 rounded-lg bg-muted p-3 text-xs">Academic update: {item.academicRecommendation}</p>}
     </Link>)}
     {!referrals.length&&<EmptyState title="No support referrals are available in your workspace."/>}
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
    <p className="mt-4 rounded-lg bg-muted p-3 text-xs">This routes to a designated support function. Urgent safeguarding concerns require a separate immediate-response pathway.</p>
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
      <button disabled={busy||goal.trim().length<3||intervention.trim().length<3||!reviewDate} onClick={()=>execute(()=>saveSupportPlan({data:{referralId:chosen.id,goal,intervention,targetDate:reviewDate}}),"Support plan saved.")} className="mt-3 rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-40">Save support plan</button>
     </div>}
     {chosen.plan&&<div className="mt-5 rounded-xl bg-muted p-4 text-sm"><p className="font-semibold">Support plan</p><p className="mt-2">Goal: {chosen.plan.goal}</p><p className="mt-2">Intervention: {chosen.plan.intervention}</p><p className="mt-2 text-xs">Review: {chosen.plan.targetDate.slice(0,10)}</p></div>}
     {["plan_created","in_service"].includes(chosen.stage)&&<div className="mt-5 rounded-xl border border-border p-4">
       <h3 className="font-semibold">Schedule student support</h3>
       <label className="mt-3 block text-xs">Service type<select value={serviceKind} onChange={e=>setServiceKind(e.target.value as typeof serviceKind)} className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm"><option value="coaching">Academic coaching</option><option value="tutoring">Tutoring</option><option value="learning_support">Learning support</option><option value="planning">College/career planning</option></select></label>
       <label className="mt-3 block text-xs">Meeting time<input type="datetime-local" value={serviceDate} onChange={e=>setServiceDate(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm"/></label>
       <button disabled={busy||!serviceDate} onClick={()=>execute(()=>scheduleSupportService({data:{referralId:chosen.id,kind:serviceKind,scheduledAt:new Date(serviceDate).toISOString()}}),"Support service scheduled.")} className="mt-3 rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-40">Schedule service</button>
     </div>}
     {chosen.services.map(service=><div key={service.id} className="mt-3 rounded-xl border border-border p-4">
       <p className="text-sm font-semibold">{service.kind.replaceAll("_"," ")} · {service.status}</p>
       <p className="mt-1 text-xs text-muted-foreground">{new Date(service.scheduledAt).toLocaleString()}</p>
       {service.outcome&&<p className="mt-2 text-xs">Outcome: {service.outcome}</p>}
       {service.status==="scheduled"&&<button disabled={busy||note.trim().length<3} onClick={()=>execute(()=>completeSupportService({data:{referralId:chosen.id,serviceId:service.id,outcome:note}}),"Service completion documented.")} className="mt-3 rounded-lg border border-border px-3 py-2 text-xs">Record completed service using note</button>}
     </div>)}
     {next&&next!=="plan_created"&&next!=="in_service"?<button disabled={busy||note.trim().length<3} onClick={()=>execute(()=>advanceSupportReferral({data:{referralId:chosen.id,nextStage:next,note,area}}),`Referral advanced to ${next.replaceAll("_"," ")}.`)} className="mt-4 w-full rounded-xl bg-foreground px-4 py-3 text-sm font-semibold text-background disabled:opacity-40">Move to {next.replaceAll("_"," ")}</button>:<p className="mt-4 text-sm font-semibold">{chosen.stage==="closed"?"Referral closed":chosen.stage==="accepted"?"Create the support plan to continue.":"Schedule and complete services before review."}</p>}
    </>:<p className="mt-4 text-sm text-muted-foreground">Select a referral from your caseload to accept, plan, monitor or close it.</p>}
   </section>}
  </div>
  <p className="mt-8 text-xs leading-6 text-muted-foreground">Access is controlled by your verified staff membership and the student’s school and program relationships. Confidential safeguarding cases require a separate immediate-response pathway.</p>
 </WorkspaceShell>;
}
