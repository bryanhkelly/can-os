import {useState} from "react";
import {createFileRoute,Link,useRouter} from "@tanstack/react-router";
import {listFacilitatorGroupScopes,listStudyGroupReviewQueue,listStudyGroupReports} from "@/modules/study-groups/study-group-queries.functions";
import {getStudyGroupAvailability} from "@/modules/study-groups/canonical-workspace.functions";
import {createFacilitatedGroup as createStudyGroup} from "@/modules/study-groups/canonical-membership.functions";
import {resolveCanonicalGroupReport as resolveStudyGroupReport} from "@/modules/study-groups/canonical-moderation.functions";
import {createCanonicalGroupSession as scheduleStudyGroupSession,reviseCanonicalGroupSession as reviseStudyGroupSession,listCanonicalGroupAttendance as listStudyGroupAttendance,recordCanonicalGroupAttendance as recordStudyGroupAttendance} from "@/modules/study-groups/canonical-sessions.functions";
import {decideCanonicalGroupMembership} from "@/modules/study-groups/canonical-membership.functions";

import {getFacilitatorStudyGroups} from "@/modules/study-groups/facilitator-query.functions";
import {safeLoader} from "@/lib/safe-loader";
import {LoaderFailure} from "@/lib/loader-failure";
import {useMutationFeedback} from "@/lib/mutation-feedback";
import {dateTimeInputValue,formatTimestamp} from "@/modules/calendar/timezone";
import {siteLocalTimeToIso} from "@/modules/calendar/site-local-time";
import {DomainError} from "@/domain/errors";
import {EmptyState,WorkspaceNotice,WorkspaceShell} from "@/components/workspace";
import {groupSessionSelectionSchema} from "@/lib/route-search";
import {MutationFeedback} from "@/components/workspace/mutation-feedback";
import {LocalDateTimeField} from "@/components/workspace/local-datetime-field";
import {ActionDialog} from "@/components/workspace/action-dialog";
const loadFacilitatorStudyGroups=async()=>{
 const {enabled,writesEnabled,membershipEnabled,creationEnabled,moderationEnabled}=await getStudyGroupAvailability();
 if(!enabled)return {enabled,writesEnabled,membershipEnabled,creationEnabled,moderationEnabled,queue:[],reports:[],groups:[],scopes:[]};
 const [queue,reports,groups,scopes]=await Promise.all([listStudyGroupReviewQueue(),listStudyGroupReports(),getFacilitatorStudyGroups(),listFacilitatorGroupScopes()]);
 return {enabled,writesEnabled,membershipEnabled,creationEnabled,moderationEnabled,queue,reports,groups,scopes};
};
export const Route=createFileRoute("/teacher/study-groups")({
 validateSearch:(search:Record<string,unknown>):{group?:string;session?:string}=>groupSessionSelectionSchema.parse(search),
 loader:safeLoader(loadFacilitatorStudyGroups,{authMessage:"Sign in with an authorized teacher account to facilitate study groups."}),
 component:TeacherStudyGroups,
});
function TeacherStudyGroups(){
 const outcome=Route.useLoaderData();
 const search=Route.useSearch();
 if(!outcome.ok)return <LoaderFailure title="Facilitate study groups" outcome={outcome}/>;
 return <TeacherStudyGroupsView key={JSON.stringify(search)} data={outcome.data}/>;
}
function TeacherStudyGroupsView({data}:{data:Awaited<ReturnType<typeof loadFacilitatorStudyGroups>>}){
 const {enabled,writesEnabled,membershipEnabled,creationEnabled,moderationEnabled,queue,reports,groups,scopes}=data,router=useRouter();
 const mutation=useMutationFeedback(()=>router.invalidate());
 const busy=mutation.pending||mutation.refreshFailed;
 const search=Route.useSearch();
 const visibleGroups=groups.filter(group=>!search.group||group.id===search.group);
 const visibleQueue=queue.filter(item=>!search.group||item.groupId===search.group);
 const visibleReports=reports.filter(item=>!search.group||item.groupId===search.group);
 const [title,setTitle]=useState(""),[description,setDescription]=useState(""),[kind,setKind]=useState<"course"|"interest">("course");
 const [siteId,setSiteId]=useState(""),[programId,setProgramId]=useState("");
 const sites=[...new Map(scopes.map(s=>[s.siteId,{id:s.siteId,name:s.siteName}])).values()];
 const sitePrograms=scopes.filter(scope=>scope.siteId===siteId);
 const [attendanceError,setAttendanceError]=useState("");
 const [groupId,setGroupId]=useState(search.group&&visibleGroups.length?search.group:""),[sessionTitle,setSessionTitle]=useState(""),[agenda,setAgenda]=useState(""),[startsAt,setStartsAt]=useState(""),[endsAt,setEndsAt]=useState("");
 const [attendance,setAttendance]=useState<Array<{personId:string;rsvp:string|null;attended:boolean|null}>>([]),[attendanceSession,setAttendanceSession]=useState("");
 const scheduledGroup=visibleGroups.find(group=>group.id===groupId);
 const [reschedule,setReschedule]=useState<{id:string;title:string;timezone:string;start:string;end:string}|null>(null);
 async function run(operation:()=>Promise<unknown>,successMessage="Study group change saved."){
  await mutation.run(operation,{successMessage,commandErrorMessage:"Unable to save study group change."});
 }
 return <WorkspaceShell eyebrow="CAN OS · Teacher" title="Facilitate study groups"
  subtitle="Review requests and moderate groups you facilitate."
  breadcrumbs={<Link to="/teacher" search={{gradeAction:undefined}} className="underline">Teacher Today</Link>}>
  <div className="space-y-6">
  {!enabled?<WorkspaceNotice>Study groups are currently unavailable.</WorkspaceNotice>:<>
  <MutationFeedback state={mutation} pendingMessage="Saving study group change..."/>
  {search.group&&<Link to="/teacher/study-groups" search={{}} className="inline-block text-sm underline">All facilitated study groups</Link>}
  {search.group&&!visibleGroups.length&&<WorkspaceNotice tone="danger">This study group is unavailable in your current facilitator workspace.</WorkspaceNotice>}
  {search.session&&!visibleGroups.some(group=>group.sessions.some(session=>session.id===search.session))&&<WorkspaceNotice tone="danger">This session is unavailable in the selected study group.</WorkspaceNotice>}
  <section className="space-y-3 rounded-xl border bg-card p-5"><h2 className="text-xl font-semibold">Membership requests</h2>
   {visibleQueue.map(m=><div className="flex items-center justify-between gap-3 border-b py-3" key={m.groupId+m.personId}><span>{m.personName} · <Link to="/teacher/study-groups" search={{group:m.groupId}} className="underline">{m.groupTitle}</Link></span><div className="flex gap-2">
    <button disabled={busy||!membershipEnabled} className="rounded border px-3 py-2" onClick={()=>run(()=>decideCanonicalGroupMembership({data:{groupId:m.groupId,studentPersonId:m.personId,approve:true}}))}>Approve</button>
    <button disabled={busy||!membershipEnabled} className="rounded border px-3 py-2" onClick={()=>run(()=>decideCanonicalGroupMembership({data:{groupId:m.groupId,studentPersonId:m.personId,approve:false}}))}>Decline</button>
   </div></div>)}{visibleQueue.length===0&&<EmptyState title="No pending membership requests."/>}
  </section>
  <section className="space-y-3 rounded-xl border bg-card p-5"><h2 className="text-xl font-semibold">Content moderation</h2>
   {visibleReports.map(r=><div key={r.id} className="border-b py-3"><p className="text-xs font-semibold"><Link to="/teacher/study-groups" search={{group:r.groupId}} className="underline">{r.groupTitle}</Link></p><p className="mt-2 text-sm">Reason: {r.reason}</p><blockquote className="mt-2 rounded border bg-muted p-3 text-sm whitespace-pre-wrap">{r.postBody??"The reported post is unavailable."}</blockquote>{r.postHidden&&<p className="mt-1 text-xs text-muted-foreground">Post already hidden</p>}<div className="mt-2 flex gap-2">
    <button disabled={busy||!moderationEnabled} className="rounded border px-3 py-2" onClick={()=>run(()=>resolveStudyGroupReport({data:{reportId:r.id,hidePost:true}}))}>Hide and resolve</button>
    <button disabled={busy||!moderationEnabled} className="rounded border px-3 py-2" onClick={()=>run(()=>resolveStudyGroupReport({data:{reportId:r.id,hidePost:false}}))}>Resolve only</button>
   </div></div>)}{visibleReports.length===0&&<EmptyState title="No open content reports."/>}
  </section>
  <section className="space-y-3 rounded-xl border p-5"><h2 className="text-xl font-semibold">Sessions and attendance</h2>
    {visibleGroups.map(group=><div key={group.id} className="space-y-2 border-b py-3"><h3 className="font-semibold"><Link to="/teacher/study-groups" search={{group:group.id}} className="hover:underline">{group.title}</Link></h3>
      {group.sessions.map(session=><div key={session.id} aria-current={search.session===session.id?"true":undefined} className={"flex flex-wrap items-center gap-2 text-sm"+(search.session===session.id?" rounded border-2 border-primary p-3":"")}><span><Link to="/teacher/study-groups" search={{group:group.id,session:session.id}} className="underline">{session.title}</Link> · {formatTimestamp(session.startsAt,group.timezone)} ({group.timezone}){session.cancelled?" · Cancelled":""}</span>
       {!session.cancelled&&<><button disabled={busy||!writesEnabled} className="rounded border px-2 py-1" onClick={()=>run(()=>reviseStudyGroupSession({data:{sessionId:session.id,action:"cancel"}}))}>Cancel</button>
       <button disabled={busy||!writesEnabled} className="rounded border px-2 py-1" onClick={()=>setReschedule({
         id:session.id,title:session.title,timezone:group.timezone,
         start:dateTimeInputValue(session.startsAt,group.timezone),end:dateTimeInputValue(session.endsAt,group.timezone),
       })}>Reschedule</button>
       <button disabled={busy} className="rounded border px-2 py-1" onClick={async()=>{try{setAttendanceError("");setAttendance(await listStudyGroupAttendance({data:{sessionId:session.id}}));setAttendanceSession(session.id)}catch(e){setAttendanceError(e instanceof Error?e.message:"Attendance unavailable")}}}>Attendance</button></>}
      </div>)}
    </div>)}
    {attendanceSession&&<div className="space-y-2"><h3 className="font-semibold">Attendance</h3>{attendanceError&&<WorkspaceNotice tone="danger">{attendanceError}</WorkspaceNotice>}{attendance.map(person=><div key={person.personId} className="flex gap-2 text-xs"><span>{person.personId.slice(0,8)} · {person.rsvp??"No RSVP"} · {person.attended===null?"Unrecorded":person.attended?"Present":"Absent"}</span>
    <button disabled={busy||!writesEnabled} className="underline" onClick={()=>run(async()=>{await recordStudyGroupAttendance({data:{sessionId:attendanceSession,studentPersonId:person.personId,attended:true}});setAttendance(await listStudyGroupAttendance({data:{sessionId:attendanceSession}}))})}>Present</button>
    <button disabled={busy||!writesEnabled} className="underline" onClick={()=>run(async()=>{await recordStudyGroupAttendance({data:{sessionId:attendanceSession,studentPersonId:person.personId,attended:false}});setAttendance(await listStudyGroupAttendance({data:{sessionId:attendanceSession}}))})}>Absent</button></div>)}</div>}
    <h3 className="font-semibold">Schedule a session</h3><select className="w-full rounded border p-2" aria-label="Choose study group" value={groupId} onChange={e=>setGroupId(e.target.value)}><option value="">Choose a group</option>{visibleGroups.map(g=><option key={g.id} value={g.id}>{g.title}</option>)}</select>
    <input className="w-full rounded border p-2" placeholder="Session title" aria-label="Session title" value={sessionTitle} onChange={e=>setSessionTitle(e.target.value)}/>
    <textarea className="w-full rounded border p-2" placeholder="Agenda" aria-label="Agenda" value={agenda} onChange={e=>setAgenda(e.target.value)}/>
    <LocalDateTimeField label="Starts at" timezone={scheduledGroup?.timezone} value={startsAt} onChange={setStartsAt} disabled={busy}/>
    <LocalDateTimeField label="Ends at" timezone={scheduledGroup?.timezone} value={endsAt} onChange={setEndsAt} disabled={busy}/>
    <button disabled={busy||!writesEnabled||!groupId||!sessionTitle.trim()||!startsAt||!endsAt} className="rounded border px-3 py-2" onClick={()=>run(()=>{
      if(!scheduledGroup)throw new DomainError("VALIDATION_FAILED","Choose a group before scheduling.");
      return scheduleStudyGroupSession({data:{groupId,title:sessionTitle,agenda,startsAt:siteLocalTimeToIso(startsAt,scheduledGroup.timezone),endsAt:siteLocalTimeToIso(endsAt,scheduledGroup.timezone)}});
    })}>Schedule</button>
   </section>
  <section className="space-y-3 rounded-xl border p-5"><h2 className="text-xl font-semibold">Create a group</h2>
   <input className="w-full rounded border p-2" aria-label="Group title" placeholder="Group title" value={title} onChange={e=>setTitle(e.target.value)}/>
   <textarea className="w-full rounded border p-2" aria-label="Group description" placeholder="Purpose" value={description} onChange={e=>setDescription(e.target.value)}/>
   <select className="w-full rounded border p-2" aria-label="Group school" value={siteId} onChange={e=>{setSiteId(e.target.value);setProgramId("");}}>
    <option value="">Choose a school where you teach</option>
    {sites.map(site=><option key={site.id} value={site.id??""}>{site.name}</option>)}
   </select>
   <select className="rounded border p-2" aria-label="Group type" value={kind} onChange={e=>setKind(e.target.value as "course"|"interest")}><option value="course">Course</option><option value="interest">Interest</option></select>
   <select className="w-full rounded border p-2" aria-label="Group program" value={programId} onChange={e=>setProgramId(e.target.value)} disabled={!siteId}>
    <option value="">{kind==="course"?"Choose the course program":"Site-wide interest group (all permitted programs)"}</option>
    {sitePrograms.map(program=><option key={program.programId} value={program.programId}>{program.programName}</option>)}
   </select>
   <button disabled={busy||!creationEnabled||!siteId||(kind==="course"&&!programId)||title.trim().length<3} className="rounded border px-3 py-2 disabled:opacity-40" onClick={()=>run(async()=>{await createStudyGroup({data:{title,description,kind,maxMembers:20,siteId,...(programId?{programId}:{})}});setTitle("");setDescription("");})}>Create group</button>
  </section>
  {reschedule&&<ActionDialog open title={`Reschedule ${reschedule.title}`} confirmLabel="Save session time"
    description={`Enter times in ${reschedule.timezone}. Nonexistent or ambiguous daylight-saving times are not accepted.`}
    pending={mutation.pending} confirmDisabled={busy||!writesEnabled} onClose={()=>setReschedule(null)}
    onConfirm={()=>void mutation.run(()=>reviseStudyGroupSession({data:{
      sessionId:reschedule.id,action:"reschedule",startsAt:siteLocalTimeToIso(reschedule.start,reschedule.timezone),
      endsAt:siteLocalTimeToIso(reschedule.end,reschedule.timezone),
    }}),{successMessage:"Study group change saved.",commandErrorMessage:"Unable to save study group change."})
      .then(outcome=>{if(outcome.status==="saved"||outcome.status==="refresh-failed")setReschedule(null);})}>
    <LocalDateTimeField label="New start" timezone={reschedule.timezone} value={reschedule.start}
      onChange={start=>setReschedule({...reschedule,start})} required/>
    <LocalDateTimeField label="New end" timezone={reschedule.timezone} value={reschedule.end}
      onChange={end=>setReschedule({...reschedule,end})} required/>
    <MutationFeedback state={mutation} pendingMessage="Saving study group change..."/>
  </ActionDialog>}
  </>}
  </div>
 </WorkspaceShell>;
}
