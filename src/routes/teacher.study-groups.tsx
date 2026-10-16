import {useState} from "react";
import {createFileRoute,useRouter} from "@tanstack/react-router";
import {getStudyGroupAvailability,createStudyGroup,listStudyGroupReviewQueue,listStudyGroupReports,decideStudyGroupMembership,resolveStudyGroupReport} from "@/modules/student-experience/study-groups.functions";

export const Route=createFileRoute("/teacher/study-groups")({
 loader:async()=>{
  const {enabled}=await getStudyGroupAvailability();
  if(!enabled)return {enabled,queue:[],reports:[]};
  const [queue,reports]=await Promise.all([listStudyGroupReviewQueue(),listStudyGroupReports()]);
  return {enabled,queue,reports};
 },
 component:TeacherStudyGroups,
});
function TeacherStudyGroups(){
 const {enabled,queue,reports}=Route.useLoaderData(),router=useRouter();
 const [title,setTitle]=useState(""),[description,setDescription]=useState(""),[kind,setKind]=useState<"course"|"interest">("course");
 const [error,setError]=useState(""),[busy,setBusy]=useState(false);
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
  <section className="space-y-3 rounded-xl border p-5"><h2 className="text-xl font-semibold">Create a group</h2>
   <input className="w-full rounded border p-2" aria-label="Group title" placeholder="Group title" value={title} onChange={e=>setTitle(e.target.value)}/>
   <textarea className="w-full rounded border p-2" aria-label="Group description" placeholder="Purpose" value={description} onChange={e=>setDescription(e.target.value)}/>
   <select className="rounded border p-2" aria-label="Group type" value={kind} onChange={e=>setKind(e.target.value as "course"|"interest")}><option value="course">Course</option><option value="interest">Interest</option></select>
   <button disabled={busy||title.trim().length<3} className="rounded border px-3 py-2" onClick={()=>run(async()=>{await createStudyGroup({data:{title,description,kind,maxMembers:20}});setTitle("");setDescription("");})}>Create group</button>
  </section></>}
 </main>;
}
