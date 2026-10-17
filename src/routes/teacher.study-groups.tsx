import {useState} from "react";
import {createFileRoute,useRouter} from "@tanstack/react-router";
import {getStudyGroupAvailability,createStudyGroup,listStudyGroupReviewQueue,listStudyGroupReports,decideStudyGroupMembership,resolveStudyGroupReport,scheduleStudyGroupSession,reviseStudyGroupSession,listStudyGroupAttendance,recordStudyGroupAttendance} from "@/modules/study-groups/study-groups.functions";

import {getFacilitatorStudyGroups} from "@/modules/study-groups/facilitator-query.functions";
import {safeLoader} from "@/lib/safe-loader";
import {LoaderFailure} from "@/lib/loader-failure";
const loadFacilitatorStudyGroups=async()=>{
 const {enabled}=await getStudyGroupAvailability();
 if(!enabled)return {enabled,queue:[],reports:[],groups:[]};
 const [queue,reports,groups]=await Promise.all([listStudyGroupReviewQueue(),listStudyGroupReports(),getFacilitatorStudyGroups()]);
 return {enabled,queue,reports,groups};
};
export const Route=createFileRoute("/teacher/study-groups")({
 loader:safeLoader(loadFacilitatorStudyGroups,{authMessage:"Sign in with an authorized teacher account to facilitate study groups."}),
 component:TeacherStudyGroups,
});
function TeacherStudyGroups(){
 const outcome=Route.useLoaderData();
 if(!outcome.ok)return <LoaderFailure title="Facilitate study groups" outcome={outcome}/>;
 return <TeacherStudyGroupsView data={outcome.data}/>;
}
function TeacherStudyGroupsView({data}:{data:Awaited<ReturnType<typeof loadFacilitatorStudyGroups>>}){
 const {enabled,queue,reports,groups}=data,router=useRouter();
 const [title,setTitle]=useState(""),[description,setDescription]=useState(""),[kind,setKind]=useState<"course"|"interest">("course");
 const [error,setError]=useState(""),[busy,setBusy]=useState(false);
 const [groupId,setGroupId]=useState(""),[sessionTitle,setSessionTitle]=useState(""),[agenda,setAgenda]=useState(""),[startsAt,setStartsAt]=useState(""),[endsAt,setEndsAt]=useState("");
 const [attendance,setAttendance]=useState<Array<{personId:string;rsvp:string|null;attended:boolean|null}>>([]),[attendanceSession,setAttendanceSession]=useState("");
 async function run(operation:()=>Promise<unknown>){
  setBusy(true);setError("");
  try{await operation();await router.invalidate();}
  catch(e){setError(e instanceof Error?e.message:"Unable to save study group change");}
  finally{setBusy(false);}
 }
 return <main className="mx-auto max-w-5xl space-y-6 px-6 py-10">
  <header><h1 className="font-serif text-4xl">Facilitate study groups</h1><p className="mt-2 text-muted-foreground">Review requests and moderate groups you facilitate.</p></header>
  {!enabled?<p role="status">Synthetic study groups are disabled.</p>:<>
  {error&&<p role="alert" className="rounded-lg border p-3">{error}</p>}
  <section className="space-y-3 rounded-xl border p-5"><h2 className="text-xl font-semibold">Membership requests</h2>
   {queue.map(m=><div className="flex items-center justify-between gap-3 border-b py-3" key={m.groupId+m.personId}><span>{m.personName} · {m.groupTitle}</span><div className="flex gap-2">
    <button disabled={busy} className="rounded border px-3 py-2" onClick={()=>run(()=>decideStudyGroupMembership({data:{groupId:m.groupId,personId:m.personId,approve:true}}))}>Approve</button>
    <button disabled={busy} className="rounded border px-3 py-2" onClick={()=>run(()=>decideStudyGroupMembership({data:{groupId:m.groupId,personId:m.personId,approve:false}}))}>Decline</button>
   </div></div>)}{queue.length===0&&<p>No pending membership requests.</p>}
  </section>
  <section className="space-y-3 rounded-xl border p-5"><h2 className="text-xl font-semibold">Content moderation</h2>
   {reports.map(r=><div key={r.id} className="border-b py-3"><p>{r.reason}</p><div className="mt-2 flex gap-2">
    <button disabled={busy} className="rounded border px-3 py-2" onClick={()=>run(()=>resolveStudyGroupReport({data:{reportId:r.id,hidePost:true}}))}>Hide and resolve</button>
    <button disabled={busy} className="rounded border px-3 py-2" onClick={()=>run(()=>resolveStudyGroupReport({data:{reportId:r.id,hidePost:false}}))}>Resolve only</button>
   </div></div>)}{reports.length===0&&<p>No open content reports.</p>}
  </section>
  <section className="space-y-3 rounded-xl border p-5"><h2 className="text-xl font-semibold">Sessions and attendance</h2>
    {groups.map(group=><div key={group.id} className="space-y-2 border-b py-3"><h3 className="font-semibold">{group.title}</h3>
      {group.sessions.map(session=><div key={session.id} className="flex flex-wrap items-center gap-2 text-sm"><span>{session.title} · {new Date(session.startsAt).toLocaleString()}{session.cancelled?" · Cancelled":""}</span>
       {!session.cancelled&&<><button disabled={busy} className="rounded border px-2 py-1" onClick={()=>run(()=>reviseStudyGroupSession({data:{sessionId:session.id,action:"cancel"}}))}>Cancel</button>
       <button disabled={busy} className="rounded border px-2 py-1" onClick={()=>{const start=window.prompt("New start (ISO)",session.startsAt),end=window.prompt("New end (ISO)",session.endsAt);if(start&&end)void run(()=>reviseStudyGroupSession({data:{sessionId:session.id,action:"reschedule",startsAt:start,endsAt:end}}))}}>Reschedule</button>
       <button disabled={busy} className="rounded border px-2 py-1" onClick={async()=>{try{setAttendance(await listStudyGroupAttendance({data:{sessionId:session.id}}));setAttendanceSession(session.id)}catch(e){setError(e instanceof Error?e.message:"Attendance unavailable")}}}>Attendance</button></>}
      </div>)}
    </div>)}
    {attendanceSession&&<div className="space-y-2"><h3 className="font-semibold">Attendance</h3>{attendance.map(person=><div key={person.personId} className="flex gap-2 text-xs"><span>{person.personId.slice(0,8)} · {person.rsvp??"No RSVP"} · {person.attended===null?"Unrecorded":person.attended?"Present":"Absent"}</span>
    <button disabled={busy} className="underline" onClick={()=>run(async()=>{await recordStudyGroupAttendance({data:{sessionId:attendanceSession,personId:person.personId,attended:true}});setAttendance(await listStudyGroupAttendance({data:{sessionId:attendanceSession}}))})}>Present</button>
    <button disabled={busy} className="underline" onClick={()=>run(async()=>{await recordStudyGroupAttendance({data:{sessionId:attendanceSession,personId:person.personId,attended:false}});setAttendance(await listStudyGroupAttendance({data:{sessionId:attendanceSession}}))})}>Absent</button></div>)}</div>}
    <h3 className="font-semibold">Schedule a session</h3><select className="w-full rounded border p-2" aria-label="Choose study group" value={groupId} onChange={e=>setGroupId(e.target.value)}><option value="">Choose a group</option>{groups.map(g=><option key={g.id} value={g.id}>{g.title}</option>)}</select>
    <input className="w-full rounded border p-2" placeholder="Session title" aria-label="Session title" value={sessionTitle} onChange={e=>setSessionTitle(e.target.value)}/>
    <textarea className="w-full rounded border p-2" placeholder="Agenda" aria-label="Agenda" value={agenda} onChange={e=>setAgenda(e.target.value)}/>
    <label className="block">Starts at<input className="ml-2 rounded border p-2" type="datetime-local" value={startsAt} onChange={e=>setStartsAt(e.target.value)}/></label>
    <label className="block">Ends at<input className="ml-2 rounded border p-2" type="datetime-local" value={endsAt} onChange={e=>setEndsAt(e.target.value)}/></label>
    <button disabled={busy||!groupId||!sessionTitle.trim()||!startsAt||!endsAt} className="rounded border px-3 py-2" onClick={()=>run(()=>scheduleStudyGroupSession({data:{groupId,title:sessionTitle,agenda,startsAt:new Date(startsAt).toISOString(),endsAt:new Date(endsAt).toISOString()}}))}>Schedule</button>
   </section>
  <section className="space-y-3 rounded-xl border p-5"><h2 className="text-xl font-semibold">Create a group</h2>
   <input className="w-full rounded border p-2" aria-label="Group title" placeholder="Group title" value={title} onChange={e=>setTitle(e.target.value)}/>
   <textarea className="w-full rounded border p-2" aria-label="Group description" placeholder="Purpose" value={description} onChange={e=>setDescription(e.target.value)}/>
   <select className="rounded border p-2" aria-label="Group type" value={kind} onChange={e=>setKind(e.target.value as "course"|"interest")}><option value="course">Course</option><option value="interest">Interest</option></select>
   <button disabled={busy||title.trim().length<3} className="rounded border px-3 py-2" onClick={()=>run(async()=>{await createStudyGroup({data:{title,description,kind,maxMembers:20}});setTitle("");setDescription("");})}>Create group</button>
  </section></>}
 </main>;
}
