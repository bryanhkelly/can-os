import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DashboardHome } from "@/components/workspace/dashboard-home";
import { DashboardShortcut } from "@/components/workspace/dashboard-layout";
import { useWorkspaceMutation } from "@/hooks/useWorkspaceMutation";
import { EmptyState, QueryState, StatCard, WorkspaceNotice, WorkspaceShell } from "@/components/workspace";
import { BookOpen, CalendarDays, ClipboardList, School } from "lucide-react";
import { getLiveOperationsCommandCenter, getLiveFullFlowOperations } from "@/modules/operations/command-center.functions";
import { type listLaunches } from "@/modules/programs/launch.functions";
import { GuidedSchoolJourney } from "@/components/operations/GuidedSchoolJourney";
import { SchoolImprovementPanel } from "@/components/operations/SchoolImprovementPanel";
import { OperationsHealthSummary } from "@/components/operations/OperationsHealthSummary";
import { FullFlowOperationalRecord } from "@/components/operations/FullFlowOperationalRecord";
import { OperationsActionCard } from "@/components/operations/OperationsActionCard";
import { isGuidedAcademicSchool } from "@/domain/guided-school-journey";
import {useRef,useState} from "react";
import {Link,useRouter} from "@tanstack/react-router";
import {getReleaseHealth} from "@/modules/operations/release-health.functions";
import {getOperationsActions,updateOperationsAction,assignOperationsAction,setOperationsActionDeadline} from "@/modules/operations/action-workspace.functions";
import {completeRegistrarEnrollmentExit} from "@/modules/enrollment/registrar-enrollment-exit.functions";
import {AttentionQueue} from "@/components/operations/AttentionQueue";
import {buildDailyOperationsAttention} from "@/domain/daily-operations";
import {ActionDialog} from "@/components/workspace/action-dialog";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/choice";
import { Label } from "@/components/ui/label";
import {mutationErrorMessage} from "@/lib/mutation-feedback";
import type { SupplementaryRead } from "@/lib/supplementary-read";
import { siteProgramHref } from "@/lib/route-search";

type ActionInput =
 | {kind:"resolve";id:string;title:string}
 | {kind:"deadline";id:string;title:string;value:string}
 | {kind:"exit";id:string;title:string;exitKind:"withdrawal"|"transfer"};

export type OperationsWorkspaceData = {
 operations: Awaited<ReturnType<typeof getOperationsActions>> | null;
 health: SupplementaryRead<Awaited<ReturnType<typeof getReleaseHealth>>>;
 commandCenter: SupplementaryRead<Awaited<ReturnType<typeof getLiveOperationsCommandCenter>>>;
 dashboard: SupplementaryRead<Awaited<ReturnType<typeof getLiveFullFlowOperations>>>;
 launches: SupplementaryRead<Awaited<ReturnType<typeof listLaunches>>>;
 authError: string;
};

export function OperationsWorkspace({data: loaderData,selected}: {data:OperationsWorkspaceData;selected:{siteId?:string;programId?:string;action?:string}}){
 const {operations:data,health,commandCenter,dashboard,launches,authError}=loaderData;
 const selectScope=(siteId?:string,programId?:string)=>{
  void router.navigate({href:siteProgramHref("/home",{siteId,programId})});
 };
 const router=useRouter();
 const retrySupplementaryReads=()=>{void router.invalidate();};
 const healthData=health?.data??null;
 const commandCenterData=commandCenter?.data??null;
 const dashboardData=dashboard?.data??null;
 const launchesData=launches?.data??null;
 const mutation=useWorkspaceMutation({mutationFn:(operation:()=>Promise<unknown>)=>operation(),invalidateRouter:()=>router.invalidate()});
 const exitMutation=useWorkspaceMutation({mutationFn:(input:{actionId:string;resolutionNote:string})=>completeRegistrarEnrollmentExit({data:{actionId:input.actionId,confirmInstitutionalReview:true,resolutionNote:input.resolutionNote}}),invalidateRouter:()=>router.invalidate()});
 const [busy,setBusy]=useState<string|null>(null);
 const [dialog,setDialog]=useState<ActionInput|null>(null);
 const [dialogNote,setDialogNote]=useState("");
 const [exitConfirmed,setExitConfirmed]=useState(false);
 const commandsBlocked=busy!==null||exitMutation.isSubmitting||!!mutation.refreshError||!!exitMutation.refreshError;
 const actionInFlight=useRef(false);
 async function submitAction(id:string, operation:()=>Promise<unknown>){
  if(actionInFlight.current||exitMutation.isSubmitting||mutation.refreshError||exitMutation.refreshError)return false;
  actionInFlight.current=true;
  setBusy(id);
  try{const submission=await mutation.submit(operation);
   if(submission.status === "ignored")return false;
   if(submission.refreshError)setError("Action saved, but refresh failed. Reopen the action; do not resubmit.");
   return true;}
  finally{actionInFlight.current=false;setBusy(null);}
 }
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [dueDrafts,setDueDrafts]=useState<Record<string,string>>({});
 async function retryActionRefresh(){
  const outcome=await mutation.retryRefresh();
  if(outcome.status==="refreshed"){
   setError("");setNotice("Saved action changes were refreshed. You may continue working.");
  }
 }
 async function retryExitRefresh(){
  const outcome=await exitMutation.retryRefresh();
  if(outcome.status==="refreshed"){
   setError("");setNotice("The saved institutional change was refreshed. You may continue working.");
  }
 }
 if(authError||!data)return <WorkspaceShell width="wide" eyebrow="Operations" title="Needs You"
  subtitle="Review actions and launch readiness for an authorized school and program.">
  <QueryState error={authError||"Operations data is unavailable. No operational changes were made."}/>
 </WorkspaceShell>;
 async function moveAction(id:string,status:"in_progress"|"waiting"|"resolved"){
  setError("");
  if(status==="resolved"){openActionInput({kind:"resolve",id,title:data?.items.find(item=>item.id===id)?.title??"Action"});return;}
  try{await submitAction(id,()=>updateOperationsAction({data:{id,status}}));}
  catch(e){setError(mutationErrorMessage(e,"Unable to update action"));}
 }

 function openActionInput(input:ActionInput){
  if(commandsBlocked)return;
  setError("");setNotice("");setDialogNote("");setExitConfirmed(false);setDialog(input);
 }
 function completeEnrollmentExit(id:string,kind:"withdrawal"|"transfer"){
  openActionInput({kind:"exit",id,exitKind:kind,title:data?.items.find(item=>item.id===id)?.title??"Enrollment change"});
 }

 async function assignAction(id:string,ownerPersonId:string|null,priority:"normal"|"high"|"urgent"){
  setError("");
  try{await submitAction(id,()=>assignOperationsAction({data:{id,ownerPersonId,priority}}));}
  catch(e){setError(mutationErrorMessage(e,"Unable to assign action"));}
 }

 function changeDeadline(id:string,value:string){
  openActionInput({kind:"deadline",id,value,title:data?.items.find(item=>item.id===id)?.title??"Action"});
 }
 async function confirmActionInput(){
  if(!dialog||commandsBlocked)return;
  const note=dialogNote.trim();
  if(note.length<(dialog.kind==="exit"?20:dialog.kind==="deadline"?5:1)||
    (dialog.kind==="exit"&&!exitConfirmed))return;
  setError("");setNotice("");
  try{
   if(dialog.kind==="exit"){
    const submission=await exitMutation.submit({actionId:dialog.id,resolutionNote:note});
    if(submission.status==="ignored")return;
    setNotice(submission.value.completed?"Official "+dialog.exitKind+" recorded. Enrollment and student access were updated.":"This request was already completed.");
    if(submission.refreshError)setError("The institutional change was saved, but the list could not refresh. Do not submit it again; reopen the Action.");
   }else{
    const saved=await submitAction(dialog.id,()=>dialog.kind==="resolve"
     ?updateOperationsAction({data:{id:dialog.id,status:"resolved",resolutionNote:note}})
     :setOperationsActionDeadline({data:{id:dialog.id,dueAt:dialog.value?new Date(dialog.value).toISOString():null,reason:note}}));
    if(!saved)return;
    if(dialog.kind==="deadline")setDueDrafts(prev=>{const next={...prev};delete next[dialog.id];return next;});
    setNotice(dialog.kind==="resolve"?"Action resolved. It no longer appears in the open operations queue.":"Action deadline saved.");
   }
   setDialog(null);setDialogNote("");setExitConfirmed(false);
  }catch(e){setError(mutationErrorMessage(e,"Unable to save operational change"));}
 }
 function localDue(iso:string|null){
   if(!iso)return "";
   const date=new Date(iso);
   return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
 }
 const attentionItems=buildDailyOperationsAttention({
   role:"registrar",actorPersonId:"verified-server-session",
   actions:data.items.filter(item=>!selected.action||item.id===selected.action),
  staffingIssues:commandCenterData?.issues??[],
  programs:dashboardData?.programs??[],
 });
 return <DashboardHome eyebrow="School operations"
  subtitle="Review actions and launch readiness for an authorized school and program. Operational actions remain subject to their existing permissions."
  shortcuts={<>
   <DashboardShortcut title="Action queue" description={`${data.items.length} open actions in scope`} icon={<ClipboardList className="size-5" />}><a href="#operations-actions" /></DashboardShortcut>
   <DashboardShortcut title="School launches" description="Review configuration and readiness" icon={<School className="size-5" />}><Link to="/launch/site" search={{siteId:selected.siteId}} /></DashboardShortcut>
   <DashboardShortcut title="Curriculum" description="Your school's learning programs" icon={<BookOpen className="size-5" />}><Link to="/operations/curriculum" search={{siteId:selected.siteId,programId:selected.programId}} /></DashboardShortcut>
   <DashboardShortcut title="Calendar" description="Your authorized schedule" icon={<CalendarDays className="size-5" />}><Link to="/calendar" /></DashboardShortcut>
  </>}
  priority={attentionItems.some(item=>item.priority==="critical") ? <AttentionQueue items={attentionItems.filter(item=>item.priority==="critical")} /> : undefined}
  actions={<div className="flex flex-wrap gap-2"><Link to="/launch/site" className="inline-flex min-h-11 items-center  bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">School launches</Link><Link to="/operations/workflows" className="inline-flex min-h-11 items-center  border bg-background px-4 py-2 text-sm font-semibold hover:bg-muted">Workflows</Link><Link to="/operations/family-alerts" className="inline-flex min-h-11 items-center  border bg-background px-4 py-2 text-sm font-semibold hover:bg-muted">Notify families</Link></div>}>
  {notice&&<p role="status" className="mb-4  border p-4 text-sm">{notice}</p>}
  <section aria-label="Operations filters" className=" border border-border/70 bg-card p-5 shadow-sm">
   <h2 className="text-sm font-semibold">Filter operational records</h2>
   <div className="mt-3 flex flex-wrap gap-4">
    <Label className="min-w-52 flex-1 text-sm">School
     <Select aria-label="Filter operations by school" value={selected.siteId??""} onChange={event=>selectScope(event.target.value||undefined)} className="mt-2">
      <option value="">All authorized schools</option>
      {data.sites.map(site=><option key={site.id} value={site.id}>{site.name}</option>)}
     </Select>
    </Label>
    <Label className="min-w-52 flex-1 text-sm">Program
     <Select aria-label="Filter operations by program" value={selected.programId??""} onChange={event=>selectScope(selected.siteId,event.target.value||undefined)} className="mt-2">
      <option value="">All authorized programs</option>
      {data.programs.filter(program=>!selected.siteId||program.siteId===selected.siteId)
       .map(program=><option key={program.id} value={program.id}>{program.name}</option>)}
     </Select>
    </Label>
   </div>
  </section>
  {healthData===null
   ? <QueryState error="Operational health details could not load; alignment cannot be verified." onRetry={retrySupplementaryReads}/>
   : healthData.schemaStatus!=="aligned"&&<p className="mt-4  border p-3 text-sm" role="status">Some operational information may be temporarily unavailable. Contact CAN support if this continues.</p>}
  {commandCenterData===null&&<QueryState error="Staffing and capacity exceptions could not be loaded; operational health cannot be verified." onRetry={retrySupplementaryReads}/>}
  {error&&<WorkspaceNotice tone="danger" className="mt-4">{error}</WorkspaceNotice>}
  {mutation.refreshError&&<Button variant="outline" type="button" disabled={mutation.isSubmitting}
   onClick={()=>void retryActionRefresh()} className="mt-2">
   Retry action refresh
  </Button>}
  {exitMutation.refreshError&&<Button variant="outline" type="button" disabled={exitMutation.isSubmitting}
   onClick={()=>void retryExitRefresh()} className="mt-2">
   Retry institutional change refresh
  </Button>}
  <AttentionQueue items={attentionItems.filter(item=>item.priority!=="critical")}/>
  <SchoolImprovementPanel selected={selected} />
  <OperationsHealthSummary commandCenterData={commandCenterData} />
  {dashboardData&&<section className="mt-7 space-y-4" aria-label="Guided school launch and operations">
    <h2 className="font-serif text-2xl">Get your first students into class</h2>
    <p className="text-sm text-muted-foreground">Follow the existing launch, course, admissions and classroom workflows for each school. A website is optional to begin registrar-assisted applications; school opening and child attendance still require independent approvals.</p>
    {launchesData===null
      ? <QueryState error="Saved launch details could not be loaded; progress and requirements cannot be verified." onRetry={retrySupplementaryReads}/>
      : dashboardData.programs.filter(p=>isGuidedAcademicSchool(p.type))
      .slice(0,selected.programId?1:4).map(program=>
       <GuidedSchoolJourney key={program.id} program={program}
        journey={launchesData.launches.find(launch=>launch.id===program.id)??null}/>)}
    {!dashboardData.programs.some(p=>isGuidedAcademicSchool(p.type))&&
      <div className=" border-2 border-primary/30 p-5">
        <p className="font-semibold">Your school is not set up yet.</p>
        <p className="mt-1 text-sm text-muted-foreground">There are no academic school programs in this scope. Launch Mode creates the canonical Program and Launch Journey, then guides the remaining setup; it never authorizes opening by itself.</p>
        <Link to="/launch/site" search={{siteId:undefined,programId:undefined}}
          className="mt-3 inline-flex min-h-11 items-center  bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground">
          Launch a school →
        </Link>
      </div>}
  </section>}
  <FullFlowOperationalRecord record={dashboardData}
    onRetry={retrySupplementaryReads}/>
  <div className="mt-7 grid gap-3 sm:grid-cols-3">
  {[["Open items",data.summary.total],["Urgent",data.summary.urgent],["Overdue",data.summary.overdue],["Unassigned",data.summary.unassigned],["Waiting",data.summary.waiting],["Needs response",data.summary.needsResponse]].map(([label,num])=><StatCard key={label} label={label} value={num}/>)}
  </div>
  <p className="mt-6">{selected.siteId?<Link to="/sites/$siteId" params={{siteId:selected.siteId}} className="inline-flex min-h-11 items-center  border px-4 py-2 text-sm font-semibold">Open this Site Today →</Link>:<Link to="/sites" className="inline-flex min-h-11 items-center  border px-4 py-2 text-sm font-semibold">Choose a school →</Link>} <Link to="/operations/school-years" search={{siteId:selected.siteId,programId:selected.programId}} className="inline-flex  border px-4 py-2 text-sm font-semibold">Configure school year →</Link> <Link to="/operations/course-policies" search={{siteId:selected.siteId,programId:selected.programId}} className="inline-flex  border px-4 py-2 text-sm font-semibold">Course policies →</Link></p>
  <div id="operations-actions" className="mt-8 scroll-mt-6 grid gap-6 lg:grid-cols-[2fr_1fr]"><section><h2 className="font-serif text-3xl">Action queue</h2><div className="mt-4 space-y-3">
  {selected.action&&<Link to="/home" search={{siteId:selected.siteId,programId:selected.programId}} className="text-sm underline">View all actions</Link>}
  {selected.action&&<Link to="/actions/$actionId" params={{actionId:selected.action}} className="ml-4 text-sm underline">View Action details</Link>}
  {selected.action&&!data.items.some(item=>item.id===selected.action)&&<WorkspaceNotice tone="danger">This action is unavailable in the current operations queue.</WorkspaceNotice>}
  {data.items.filter(item=>!selected.action||item.id===selected.action).map(i=>
    <OperationsActionCard key={i.kind+i.id} i={i}
      selected={selected} assignees={data.assignees}
      commandsBlocked={commandsBlocked}
      dueDraft={dueDrafts[i.id]??localDue(i.dueAt)}
      hasDueDraft={dueDrafts[i.id]!==undefined}
      onAssign={assignAction}
      onDueChange={(id,value)=>setDueDrafts(prev=>({...prev,[id]:value}))}
      onSaveDue={changeDeadline} onChangeStatus={moveAction}
      onCompleteEnrollmentExit={completeEnrollmentExit}/>)}
  {!data.items.length&&<EmptyState title="No actions currently require attention."/>}
  </div></section><aside><h2 className="font-serif text-3xl">Program operations</h2><div className="mt-4 space-y-3  border bg-card p-5 text-sm"><p><Link className="underline" to="/profiles">Personnel and credentials</Link></p><p className="text-xs text-muted-foreground">Student support referrals are managed by authorized teachers and specialists.</p><p className="text-xs text-muted-foreground">Readiness checklist and configuration templates follow this shared work queue.</p></div></aside></div>
 {dialog&&<ActionDialog open title={dialog.kind==="resolve"?"Resolve action":dialog.kind==="deadline"?"Change action deadline":"Complete official "+dialog.exitKind}
  description={<><p>{dialog.title}</p><p className="mt-2">{dialog.kind==="exit"
   ?"Active Program and class memberships end immediately. The student login at this school may also be revoked. Record the institutional decision and academic records handoff."
   :dialog.kind==="deadline"?(dialog.value?"New due date (your local time): "+dialog.value.replace("T"," "):"This removes the action's due date."):"Record how this action was resolved. The note is retained with the canonical Action."}</p></>}
  confirmLabel={dialog.kind==="resolve"?"Resolve action":dialog.kind==="deadline"?"Save deadline":"Complete official "+dialog.exitKind}
  destructive={dialog.kind==="exit"} pending={busy!==null||exitMutation.isSubmitting}
  pendingLabel={dialog.kind==="exit"?"Recording institutional exit…":dialog.kind==="deadline"?"Saving deadline…":"Resolving action…"}
  confirmDisabled={commandsBlocked||dialogNote.trim().length<(dialog.kind==="exit"?20:dialog.kind==="deadline"?5:1)||(dialog.kind==="exit"&&!exitConfirmed)}
  onClose={()=>{setDialog(null);setDialogNote("");setError("");}} onConfirm={()=>void confirmActionInput()}>
  <Field label={dialog.kind==="deadline"?"Reason for deadline change":"Resolution note"} required>
   <Textarea required minLength={dialog.kind==="exit"?20:dialog.kind==="deadline"?5:1} maxLength={dialog.kind==="deadline"?500:2000}
    value={dialogNote} onChange={event=>setDialogNote(event.target.value)} rows={4}/>
  </Field>
  {dialog.kind==="exit"&&<Label className="flex items-start gap-3 text-sm">
   <Checkbox checked={exitConfirmed} onChange={event=>setExitConfirmed(event.target.checked)}/>
   I confirm the registrar has verified this institutional exit and understand that enrollment and student access may end immediately.
  </Label>}
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
 </ActionDialog>}
 </DashboardHome>;
}
