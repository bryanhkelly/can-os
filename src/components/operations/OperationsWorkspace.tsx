import { useWorkspaceMutation } from "@/hooks/useWorkspaceMutation";
import { EmptyState, QueryState, StatCard, StatusBadge, WorkspaceNotice, WorkspaceShell } from "@/components/workspace";
import { ArrowUpRight, ClipboardList, School, ShieldCheck } from "lucide-react";
import { getLiveOperationsCommandCenter, getLiveFullFlowOperations } from "@/modules/operations/command-center.functions";
import { type listLaunches } from "@/modules/programs/launch.functions";
import { GuidedSchoolJourney } from "@/components/operations/GuidedSchoolJourney";
import { OutboxHealthPanel } from "@/components/operations/OutboxHealthPanel";
import { isGuidedAcademicSchool } from "@/domain/guided-school-journey";
import {useRef,useState} from "react";
import {Link,useRouter} from "@tanstack/react-router";
import {getReleaseHealth} from "@/modules/operations/release-health.functions";
import {getOperationsActions,updateOperationsAction,assignOperationsAction,setOperationsActionDeadline} from "@/modules/operations/action-workspace.functions";
import {completeRegistrarEnrollmentExit} from "@/modules/enrollment/registrar-enrollment-exit.functions";
import {AttentionQueue} from "@/components/operations/AttentionQueue";
import {buildDailyOperationsAttention} from "@/domain/daily-operations";

export type OperationsWorkspaceData = {
 operations: Awaited<ReturnType<typeof getOperationsActions>> | null;
 health: Awaited<ReturnType<typeof getReleaseHealth>> | null;
 commandCenter: Awaited<ReturnType<typeof getLiveOperationsCommandCenter>> | null;
 dashboard: Awaited<ReturnType<typeof getLiveFullFlowOperations>> | null;
 launches: Awaited<ReturnType<typeof listLaunches>> | null;
 authError: string;
};

export function OperationsWorkspace({data: loaderData,selected}: {data:OperationsWorkspaceData;selected:{siteId?:string;programId?:string;action?:string}}){
 const {operations:data,health,commandCenter,dashboard,launches,authError}:{
  operations:Awaited<ReturnType<typeof getOperationsActions>>|null;
  health:Awaited<ReturnType<typeof getReleaseHealth>>|null;
  commandCenter:Awaited<ReturnType<typeof getLiveOperationsCommandCenter>>|null;
  dashboard:Awaited<ReturnType<typeof getLiveFullFlowOperations>>|null;
  launches:Awaited<ReturnType<typeof listLaunches>>|null;
  authError:string;
 }=loaderData;
 const selectScope=(siteId?:string,programId?:string)=>{
  const query=new URLSearchParams();
  if(siteId)query.set("siteId",siteId);
  if(programId)query.set("programId",programId);
  void router.navigate({href:"/operations"+(query.size?"?"+query.toString():"")});
 };
 const router=useRouter();
 const mutation=useWorkspaceMutation({mutationFn:(operation:()=>Promise<unknown>)=>operation(),invalidateRouter:()=>router.invalidate()});
 const exitMutation=useWorkspaceMutation({mutationFn:(input:{actionId:string;resolutionNote:string})=>completeRegistrarEnrollmentExit({data:{actionId:input.actionId,confirmInstitutionalReview:true,resolutionNote:input.resolutionNote}}),invalidateRouter:()=>router.invalidate()});
 const [busy,setBusy]=useState<string|null>(null);
 const actionInFlight=useRef(false);
 async function submitAction(id:string, operation:()=>Promise<unknown>){
  if(actionInFlight.current||exitMutation.isSubmitting)return false;
  actionInFlight.current=true;
  setBusy(id);
  try{const submission=await mutation.submit(operation);
   if(submission.status === "ignored")return false;
   if(submission.refreshError)setError("Action saved, but refresh failed. Reopen the action; do not resubmit.");
   return !submission.refreshError;}
  finally{actionInFlight.current=false;setBusy(null);}
 }
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [dueDrafts,setDueDrafts]=useState<Record<string,string>>({});
 if(authError||!data)return <WorkspaceShell width="wide" eyebrow="CAN OS · Operations" title="Needs You"
  subtitle="Review actions and launch readiness for an authorized school and program.">
  <QueryState error={authError||"Operations data is unavailable. No operational changes were made."}/>
 </WorkspaceShell>;
 async function moveAction(id:string,status:"in_progress"|"waiting"|"resolved"){
  setError("");
  try{const resolutionNote=status==="resolved"?window.prompt("Resolution note (required)"):undefined;if(status==="resolved"&&!resolutionNote?.trim())return;await submitAction(id,()=>updateOperationsAction({data:{id,status,resolutionNote:resolutionNote?.trim()}}));}
  catch(e){setError(e instanceof Error?e.message:"Unable to update action");}
 }

 async function completeEnrollmentExit(id:string,kind:"withdrawal"|"transfer"){
  const note=window.prompt("Record the institutional "+kind+" decision and academic records handoff (at least 20 characters):");
  if(!note?.trim()||note.trim().length<20)return;
  if(!window.confirm("Confirm the registrar verified this exit? Active Program and class memberships end immediately. The student login at this school may also be revoked."))return;
  setError("");setNotice("");
  try{
   const submission=await exitMutation.submit({actionId:id,resolutionNote:note.trim()});
   if(submission.status === "ignored")return;
   const result=submission.value;
   setNotice(result.completed?"Official "+kind+" recorded. Enrollment and student access were updated.":"This request was already completed.");
   if(submission.refreshError)setError("The institutional change was saved, but the list could not refresh. Do not submit it again; reopen the Action.");
  }catch(e){setError(e instanceof Error?e.message:"Unable to complete institutional enrollment change");}
 }

 async function assignAction(id:string,ownerPersonId:string|null,priority:"normal"|"high"|"urgent"){
  setError("");
  try{await submitAction(id,()=>assignOperationsAction({data:{id,ownerPersonId,priority}}));}
  catch(e){setError(e instanceof Error?e.message:"Unable to assign action");}
 }

 async function changeDeadline(id:string,value:string){
   const reason=window.prompt("Reason for the deadline change (required)");
   if(!reason?.trim()||reason.trim().length<5)return;
   setError("");
   try{
     const saved=await submitAction(id,()=>setOperationsActionDeadline({data:{
       id,dueAt:value?new Date(value).toISOString():null,reason:reason.trim(),
     }}));
     if(!saved)return;
     setDueDrafts(prev=>{const next={...prev};delete next[id];return next;});

   }catch(e){setError(e instanceof Error?e.message:"Unable to save deadline");}
 }
 function localDue(iso:string|null){
   if(!iso)return "";
   const date=new Date(iso);
   return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
 }
 const attentionItems=buildDailyOperationsAttention({
   role:"registrar",actorPersonId:"verified-server-session",
   actions:data.items.filter(item=>!selected.action||item.id===selected.action),
   staffingIssues:commandCenter?.issues??[],
   programs:dashboard?.programs??[],
 });
 return <WorkspaceShell width="wide" eyebrow="CAN OS · School operations" title="Needs You"
  subtitle="Review actions and launch readiness for an authorized school and program. Operational actions remain subject to their existing permissions."
  actions={<div className="flex flex-wrap gap-2"><Link to="/operations/launch" className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">School launches</Link><Link to="/operations/workflows" className="inline-flex min-h-11 items-center rounded-xl border bg-background px-4 py-2 text-sm font-semibold hover:bg-muted">Workflows</Link><Link to="/operations/family-alerts" className="inline-flex min-h-11 items-center rounded-xl border bg-background px-4 py-2 text-sm font-semibold hover:bg-muted">Notify families</Link></div>}>
  {notice&&<p role="status" className="mb-4 rounded-xl border p-4 text-sm">{notice}</p>}
  <section aria-label="Operations filters" className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
   <h2 className="text-sm font-semibold">Filter operational records</h2>
   <div className="mt-3 flex flex-wrap gap-4">
    <label className="min-w-52 flex-1 text-sm">School
     <select aria-label="Filter operations by school" value={selected.siteId??""} onChange={event=>selectScope(event.target.value||undefined)} className="mt-2 block min-h-11 w-full rounded-lg border bg-background px-3 py-2">
      <option value="">All authorized schools</option>
      {data.sites.map(site=><option key={site.id} value={site.id}>{site.name}</option>)}
     </select>
    </label>
    <label className="min-w-52 flex-1 text-sm">Program
     <select aria-label="Filter operations by program" value={selected.programId??""} onChange={event=>selectScope(selected.siteId,event.target.value||undefined)} className="mt-2 block min-h-11 w-full rounded-lg border bg-background px-3 py-2">
      <option value="">All authorized programs</option>
      {data.programs.map(program=><option key={program.id} value={program.id}>{program.name}</option>)}
     </select>
    </label>
   </div>
  </section>
  {health ? <p className="mt-4 rounded-xl border p-3 text-xs text-muted-foreground">Release: {health.buildId} · Database compatibility: {health.schemaStatus.replace("_"," ")}. {health.details}</p> : <p className="mt-4 text-xs text-muted-foreground">Release health is temporarily unavailable; core operations remain accessible.</p>}
  <OutboxHealthPanel/>
  {error&&<WorkspaceNotice tone="danger" className="mt-4">No operational change was completed. {error}</WorkspaceNotice>}
  <AttentionQueue items={attentionItems}/>
  {commandCenter&&<section aria-label="Operations exception summary" className="mt-8">
    <h2 className="font-serif text-3xl font-semibold">Operational health</h2>
    <p className="mt-2 text-sm text-muted-foreground">Prioritize verified staffing and capacity exceptions before routine school monitoring. Readiness approvals remain controlled by their owning workflows.</p>
    <div className="mt-5 grid gap-4 md:grid-cols-3">
      <div className="rounded-2xl border border-destructive/40 bg-card p-5">
        <h3 className="text-sm font-semibold">Needs intervention</h3>
        <p className="mt-2 text-3xl font-semibold">{commandCenter.issues.length}</p>
        <p className="mt-2 text-xs text-muted-foreground">Reported staffing and capacity exceptions</p>
      </div>
      <div className="rounded-2xl border bg-card p-5">
        <h3 className="text-sm font-semibold">Watching</h3>
        <p className="mt-2 text-sm text-muted-foreground">Use the existing action workspace and live program details to review emerging concerns. No inferred warning counts.</p>
      </div>
      <div className="rounded-2xl border bg-muted/30 p-5">
        <h3 className="text-sm font-semibold">Healthy</h3>
        <p className="mt-2 text-sm text-muted-foreground">{commandCenter.summary.sections} active sections in scope. Individual readiness is not inferred from this count.</p>
      </div>
    </div>
    {commandCenter.issues.length>0&&<div className="mt-5 divide-y rounded-2xl border bg-card">
      {commandCenter.issues.map(issue=><article key={issue.kind+issue.sectionId} className="flex flex-wrap items-start justify-between gap-4 p-5">
        <div><h3 className="font-semibold">{issue.title}</h3><p className="mt-1 text-sm text-muted-foreground">{issue.description}</p></div>
        <Link to="/operations/launch/$programId" params={{programId:issue.programId}} search={{siteId:undefined,programId:undefined}} className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold">Review workflow <ArrowUpRight className="size-4"/></Link>
      </article>)}
    </div>}
  </section>}
  {commandCenter&&<section className="mt-7 rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
    <h2 className="font-serif text-2xl">Live school operations</h2>
    <div className="mt-3 flex flex-wrap gap-4 text-sm">
     <span>{commandCenter.summary.sections} active sections</span>
     <span>{commandCenter.summary.unstaffed} unstaffed</span>
     <span>{commandCenter.summary.underCapacity} capacity gaps</span>
     <span>{commandCenter.summary.waitlisted} waiting students</span>
    </div>
    <div className="mt-4 space-y-2">
     {commandCenter.issues.map(issue=><div key={issue.kind+issue.sectionId} className="rounded border p-3 text-sm">
       <strong>{issue.title}</strong><p className="text-muted-foreground">{issue.description}</p>
       <Link className="mt-2 inline-block underline" to="/operations/launch/$programId"
        params={{programId:issue.programId}} search={{siteId:undefined,programId:undefined}}>Review lifecycle →</Link>
     </div>)}
     {!commandCenter.issues.length&&<p className="text-sm">No staffing or capacity exceptions detected.</p>}
    </div>
   </section>}
  {dashboard&&<section className="mt-7 space-y-4" aria-label="Guided school launch and operations">
    <h2 className="font-serif text-2xl">Get your first students into class</h2>
    <p className="text-sm text-muted-foreground">Follow the existing launch, course, admissions and classroom workflows for each school. A website is optional to begin registrar-assisted applications; school opening and child attendance still require independent approvals.</p>
    {dashboard.programs.filter(p=>isGuidedAcademicSchool(p.type))
      .slice(0,selected.programId?1:4).map(program=>
       <GuidedSchoolJourney key={program.id} program={program}
        journey={launches?.launches.find(launch=>launch.id===program.id)??null}/>)}
    {!dashboard.programs.some(p=>isGuidedAcademicSchool(p.type))&&
      <div className="rounded-xl border-2 border-primary/30 p-5">
        <p className="font-semibold">Your school is not set up yet.</p>
        <p className="mt-1 text-sm text-muted-foreground">There are no academic school programs in this scope. Launch Mode creates the canonical Program and Launch Journey, then guides the remaining setup; it never authorizes opening by itself.</p>
        <Link to="/operations/launch" search={{siteId:undefined,programId:undefined}}
          className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground">
          Launch a school →
        </Link>
      </div>}
  </section>}
  <section className="mt-7 rounded-xl border bg-card p-5" aria-label="FullFlow operational record">
   <h2 className="font-serif text-2xl">Connected school operational record</h2>
   <p className="mt-2 text-sm text-muted-foreground">Live records from the same authorized school programs, curriculum releases, enrollments, classrooms, grades and guardian follow-ups. Numbers are not simulated readiness approvals.</p>
   {!dashboard ? <p className="mt-4 text-sm" role="alert">The connected school record could not be loaded. Launch and grading status cannot be verified from this screen.</p> : <>
    <p className="mt-2 text-xs text-muted-foreground">Refreshed {new Date(dashboard.asOf).toLocaleString()}</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-5">
     {[["Active students",dashboard.totals.activeProgramStudents],
       ["Awaiting class placement",dashboard.programs.reduce((sum,p)=>sum+Math.max(0,p.counts.activeProgramStudents-p.counts.placedStudents),0)],
       ["Class placements",dashboard.totals.placedStudents],
       ["Graded submissions",dashboard.totals.gradedWork],
       ["Guardian questions open",dashboard.totals.unresolvedGuardianResponses]]
       .map(([label,value])=><div key={label} className="rounded-lg border p-3">
        <p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p>
       </div>)}
    </div>
    <div className="mt-5 space-y-4">
     {dashboard.programs.map(program=><article key={program.id} className="rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
       <h3 className="font-semibold">{program.name} <span className="text-xs font-normal text-muted-foreground">· {program.status.replaceAll("_"," ")} · {program.type.replaceAll("_"," ")}</span></h3>
       <Link className="text-sm underline" to="/operations/launch/$programId" params={{programId:program.id}} search={{siteId:undefined,programId:undefined}}>Review program →</Link>
      </div>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
       <div><dt className="text-xs text-muted-foreground">Curriculum &amp; teaching</dt>
        <dd>{program.counts.adoptedCurriculumPacks} adopted packs · {program.counts.publishedSections} published sections · {program.counts.staffedSections}/{program.counts.sections} staffed sections</dd></div>
       <div><dt className="text-xs text-muted-foreground">Admissions &amp; enrollment</dt>
        <dd>{program.counts.applications} applications · {program.counts.acceptedApplications} accepted · {program.counts.activeProgramStudents} active students · {program.counts.placedStudents} class placements</dd>
        {program.counts.activeProgramStudents>program.counts.placedStudents&&<dd className="mt-2 font-semibold">
          {program.counts.activeProgramStudents-program.counts.placedStudents} student(s) awaiting a class.{" "}
          <Link to="/admissions" search={{siteId:program.siteId??undefined,programId:program.id}}
            className="underline">Place enrolled students →</Link>
        </dd>}</div>
       <div><dt className="text-xs text-muted-foreground">Learning &amp; responses</dt>
        <dd>{program.counts.publishedAssessments} assessments · {program.counts.submittedWork} awaiting grading · {program.counts.gradedWork} graded · {program.counts.unresolvedGuardianResponses} open family questions</dd></div>
      </dl>
      <details className="mt-3 text-xs text-muted-foreground"><summary className="cursor-pointer underline">Academic authority and stable record IDs</summary>
       <p className="mt-2 break-all">Program: {program.id}</p>
       <p className="break-all">Academic provider: {program.academicProviderOrganizationId}</p>
       <p className="break-all">Credit issuer: {program.creditIssuingOrganizationId}</p>
      </details>
     </article>)}
     {!dashboard.programs.length&&<p className="rounded-lg border p-4 text-sm">No programs match your current school and verified access scope.</p>}
    </div>
   </>}
  </section>
  <div className="mt-7 grid gap-3 sm:grid-cols-3">
  {[["Open items",data.summary.total],["Urgent",data.summary.urgent],["Overdue",data.summary.overdue],["Unassigned",data.summary.unassigned],["Waiting",data.summary.waiting],["Needs response",data.summary.needsResponse]].map(([label,num])=><StatCard key={label} label={label} value={num}/>)}
  </div>
  <p className="mt-6"><Link to="/sites" className="inline-flex rounded-lg border px-4 py-2 text-sm font-semibold">Open School/Site Today →</Link> <Link to="/operations/school-years" search={{siteId:selected.siteId,programId:selected.programId}} className="inline-flex rounded-lg border px-4 py-2 text-sm font-semibold">Configure school year →</Link> <Link to="/operations/course-policies" search={{siteId:selected.siteId,programId:selected.programId}} className="inline-flex rounded-lg border px-4 py-2 text-sm font-semibold">Course policies →</Link></p>
  <div className="mt-8 grid gap-6 lg:grid-cols-[2fr_1fr]"><section><h2 className="font-serif text-3xl">Action queue</h2><div className="mt-4 space-y-3">
  {selected.action&&<Link to="/operations" search={{siteId:selected.siteId,programId:selected.programId}} className="text-sm underline">View all actions</Link>}
  {selected.action&&!data.items.some(item=>item.id===selected.action)&&<WorkspaceNotice tone="danger">This action is unavailable in the current operations queue.</WorkspaceNotice>}
  {data.items.filter(item=>!selected.action||item.id===selected.action).map(i=><article className="rounded-xl border bg-card p-4" key={i.kind+i.id}><div className="flex items-center justify-between gap-3"><h3 className="font-semibold"><Link to="/operations" search={{siteId:selected.siteId,programId:selected.programId,action:i.id}} className="hover:underline">{i.title}</Link></h3><StatusBadge tone={i.priority==="critical"?"danger":i.priority==="high"?"attention":"neutral"}>{i.priority}</StatusBadge></div><p className="mt-2 text-sm text-muted-foreground">{i.detail}</p>
  <p className="mt-2 text-xs text-muted-foreground">Status: {i.status?.replaceAll("_"," ") ?? "open"}
   {i.dueAt&&<> · Due {new Date(i.dueAt).toLocaleDateString()}
    {new Date(i.dueAt).getTime()<Date.now()&&<strong className="ml-2 text-foreground">Overdue</strong>}</>}
   {!i.ownerPersonId&&" · Unassigned"}
  </p>
  <div className="mt-3 flex flex-wrap gap-3">{i.openingHandoff&&i.siteId?<Link to="/sites/$siteId" params={{siteId:i.siteId}} className="text-sm underline">Named-recipient acknowledgment in Site Today →</Link>:i.managedBySupport?<p className="text-xs text-muted-foreground">Managed by the support team in their authorized referral workspace.</p>:<><label className="flex items-center gap-2 text-xs">Assigned to
 <select aria-label={"Assign "+i.title} className="rounded border bg-background px-2 py-1" disabled={busy!==null} value={i.ownerPersonId??""} onChange={event=>void assignAction(i.id,event.target.value||null,i.priority==="critical"?"urgent":i.priority==="high"?"high":"normal")}>
 <option value="" disabled={i.type==="onsite_coverage_gap"&&!!i.eligibleOwnerPersonId}>Unassigned</option>
 {i.type==="onsite_coverage_gap"&&i.ownerPersonId&&i.ownerPersonId!==i.eligibleOwnerPersonId&&
  <option value={i.ownerPersonId} disabled>Previous assignee — reassign to the current director</option>}
 {data.assignees.filter(person=>person.siteId===i.siteId&&
   (i.type==="onsite_coverage_gap"?person.role==="site_leader"&&person.id===i.eligibleOwnerPersonId:person.role!=="site_leader")).map(person=><option key={person.id} value={person.id}>{person.firstName} {person.lastName} · {person.role}</option>)}
 </select></label>
 <label className="flex flex-col gap-1 text-xs">Due date (your local time)
  <input type="datetime-local" aria-label={"Deadline for "+i.title}
   className="rounded border bg-background px-2 py-1"
   disabled={busy!==null}
   value={dueDrafts[i.id]??localDue(i.dueAt)}
   onChange={event=>setDueDrafts(prev=>({...prev,[i.id]:event.target.value}))}/>
 </label>
 <button type="button" className="rounded border px-3 py-1 text-xs disabled:opacity-50"
   disabled={busy!==null||dueDrafts[i.id]===undefined}
   onClick={()=>void changeDeadline(i.id,dueDrafts[i.id]??"")}>Save due date</button>
 <button type="button" className="rounded border px-3 py-1 text-xs disabled:opacity-50" disabled={busy!==null} onClick={()=>moveAction(i.id,"in_progress")}>Start</button>
 <button type="button" className="rounded border px-3 py-1 text-xs disabled:opacity-50" disabled={busy!==null} onClick={()=>moveAction(i.id,"waiting")}>Waiting</button>
 {i.type==="guardian_health_information_review"?
  <Link to="/operations/health-review" search={{action:i.id}}
    className="rounded border px-3 py-1 text-xs font-semibold">Review confidential family update</Link>:
  i.type==="transfer_academic_records_handoff"?
  <Link to="/operations/transfer-records" className="rounded border px-3 py-1 text-xs font-semibold">Complete verified records transfer →</Link>:
  (i.enrollmentChangeKind==="transfer"||i.enrollmentChangeKind==="withdrawal")?
  <button type="button" className="rounded border border-foreground px-3 py-1 text-xs font-semibold disabled:opacity-50"
    disabled={busy!==null} onClick={()=>{if(i.enrollmentChangeKind==="withdrawal"||i.enrollmentChangeKind==="transfer")void completeEnrollmentExit(i.id,i.enrollmentChangeKind);}}>
    Complete official {i.enrollmentChangeKind==="withdrawal"?"withdrawal":"transfer"} &amp; end school enrollment
  </button>:
  i.type==="onsite_coverage_gap"&&i.siteId?
  <Link to="/sites/$siteId" params={{siteId:i.siteId}} className="text-xs underline">Assigned director resolves in Site Today →</Link>:
  <button type="button" className="rounded border px-3 py-1 text-xs disabled:opacity-50" disabled={busy!==null} onClick={()=>moveAction(i.id,"resolved")}>Resolve</button>}
 </>}</div></article>)}
  {!data.items.length&&<EmptyState title="No actions currently require attention."/>}
  </div></section><aside><h2 className="font-serif text-3xl">Program operations</h2><div className="mt-4 space-y-3 rounded-xl border bg-card p-5 text-sm"><p><Link className="underline" to="/profiles">Personnel and credentials</Link></p><p className="text-xs text-muted-foreground">Student support referrals are managed by authorized teachers and specialists.</p><p><Link className="underline" to="/notifications">Notifications</Link></p><p className="text-xs text-muted-foreground">Readiness checklist and configuration templates follow this shared work queue.</p></div></aside></div>
 </WorkspaceShell>;
}

