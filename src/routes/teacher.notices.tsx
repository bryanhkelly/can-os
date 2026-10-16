import {useState} from "react";
import {createFileRoute,Link,useRouter} from "@tanstack/react-router";
import {getSyntheticTeacherNotices,acknowledgeSyntheticTeacherNotice} from "@/modules/student-experience/teacher-notices.functions";
export const Route=createFileRoute("/teacher/notices")({loader:()=>getSyntheticTeacherNotices(),component:TeacherNotices});
function TeacherNotices(){
 const {connected,items}=Route.useLoaderData();const router=useRouter();
 const [busy,setBusy]=useState<string|null>(null),[error,setError]=useState("");
 return <main className="mx-auto max-w-4xl px-5 py-10">
  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">CAN OS · Synthetic teacher</p>
  <h1 className="mt-2 font-serif text-4xl">My notifications</h1>
  <p className="mt-3 text-sm text-muted-foreground">Assigned operations actions for the fixed demo teacher. Real user identity and permission enforcement are not yet enabled.</p>
  {!connected&&<p role="status" className="mt-4 rounded-xl border p-4">Database not connected.</p>}
  {error&&<p role="alert" className="mt-4 rounded border p-3">{error}</p>}
  <section className="mt-6 space-y-3">{items.map(n=><article key={n.id} className="rounded-xl border bg-card p-4">
   <p className="text-xs text-muted-foreground">{new Date(n.createdAt).toLocaleString()} · {n.status}</p>
   <h2 className="mt-2 font-semibold">{n.title}</h2><p className="mt-1 text-sm">{n.body}</p>
   <div className="mt-3 flex gap-4"><Link to="/operations" className="text-xs font-semibold underline">Open Action Center →</Link>
   {n.status==="unread"&&<button type="button" disabled={busy!==null} className="text-xs font-semibold underline disabled:opacity-50" onClick={async()=>{setBusy(n.id);setError("");try{await acknowledgeSyntheticTeacherNotice({data:{id:n.id}});await router.invalidate();}catch(e){setError(e instanceof Error?e.message:"Unable to acknowledge notice");}finally{setBusy(null);}}}>Mark read</button>}</div>
  </article>)}{connected&&!items.length&&<p className="rounded-xl border p-5 text-sm">No assigned-action notices yet.</p>}</section>
 </main>;
}
