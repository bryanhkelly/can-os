import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useRef, useState, type FormEvent } from "react";
import { WorkspaceShell } from "@/components/workspace";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { getSchoolFamilyAlerts, publishSchoolFamilyAlert, retryFailedSchoolFamilyAlertDeliveries } from "@/modules/communication/school-family-alerts.functions";

export const Route=createFileRoute("/operations/family-alerts")({
 loader:safeLoader(()=>getSchoolFamilyAlerts(),{
  authMessage:"Sign in with an authorized institutional registrar account to publish school communications.",
 }),
 component:SchoolFamilyAlertsPage,
});

type Data=Awaited<ReturnType<typeof getSchoolFamilyAlerts>>;
type Kind="urgent_school_update"|"schedule_change"|"school_closure";

function SchoolFamilyAlertsPage(){
 const outcome=Route.useLoaderData();
 if(!outcome.ok)return <LoaderFailure eyebrow="CAN OS · Communications"
  title="School to family alerts" outcome={outcome}/>;
 return <Publisher data={outcome.data}/>;
}
function Publisher({data}:{data:Data}){
 const router=useRouter();
 const [programId,setProgramId]=useState(data.programs[0]?.id??"");
 const [kind,setKind]=useState<Kind>("urgent_school_update");
 const [title,setTitle]=useState(""),[message,setMessage]=useState("");
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(""),[error,setError]=useState("");
 const pendingId=useRef<string|null>(null);
 const clearPending=()=>{pendingId.current=null;setNotice("");};
 async function publish(event:FormEvent){
  event.preventDefault();
  if(busy||!programId||title.trim().length<8||message.trim().length<20)return;
  if(!window.confirm("Publish this "+kind.replaceAll("_"," ")+" to every currently verified enrolled family in the selected Program? The message becomes visible in the family notification center. This does not close school, modify schedules, or guarantee email/SMS delivery."))return;
  setBusy(true);setError("");setNotice("");
  pendingId.current??=crypto.randomUUID();
  try{
   const result=await publishSchoolFamilyAlert({data:{
     programId,kind,title:title.trim(),message:message.trim(),
     mutationId:pendingId.current,confirmed:true,
   }});
   setNotice(result.published
     ?`Published to ${result.recipientCount} currently authorized family accounts via in-app notifications.`
     :`Already published; ${result.recipientCount} family notifications were recorded.`);
   pendingId.current=null;setTitle("");setMessage("");
   try{await router.invalidate();}
   catch{setError("The publication was saved but the history failed to refresh. Do not publish the same notice again.");}
  }catch(e){setError(e instanceof Error?e.message:"Unable to publish school notice. No delivery can be assumed.");}
  finally{setBusy(false);}
 }
 async function retry(alertId:string){
  if(busy)return;
  if(!window.confirm("Retry exhausted email/SMS provider attempts for this recent notice? Accepted messages will not be resent."))return;
  setBusy(true);setError("");setNotice("");
  try{
   const result=await retryFailedSchoolFamilyAlertDeliveries({data:{alertId,confirmed:true}});
   setNotice(result.requeued+" failed delivery attempts requeued. The worker will recheck current family authorization.");
   await router.invalidate();
  }catch(e){setError(e instanceof Error?e.message:"Could not retry deliveries.");}
  finally{setBusy(false);}
 }
 return <WorkspaceShell eyebrow="CAN OS · School operations" title="Urgent family communications"
  subtitle="Publish verified family notices through in-app notifications, school email and opt-in SMS. Provider acceptance is not evidence of inbox or phone delivery."
  actions={<Link to="/operations" className="rounded border px-3 py-2 text-sm">School operations</Link>}>
  {notice&&<p role="status" className="mt-5 rounded-lg border p-4 text-sm">{notice}</p>}
  {error&&<p role="alert" className="mt-5 rounded-lg border p-4 text-sm">{error}</p>}
  <form onSubmit={e=>void publish(e)} className="mt-6 max-w-3xl space-y-4 rounded-xl border bg-card p-5">
   <h2 className="text-lg font-semibold">Compose a school notice</h2>
   <label className="block text-sm font-semibold">School Program
    <select required value={programId} onChange={e=>{setProgramId(e.target.value);clearPending();}}
     className="mt-2 w-full rounded border bg-background p-3">
     {data.programs.map(p=><option key={p.id} value={p.id}>{p.name} · {p.siteName}</option>)}
    </select>
   </label>
   <label className="block text-sm font-semibold">Type
    <select value={kind} onChange={e=>{setKind(e.target.value as Kind);clearPending();}}
     className="mt-2 w-full rounded border bg-background p-3">
     <option value="urgent_school_update">Urgent school update</option>
     <option value="schedule_change">Schedule update</option>
     <option value="school_closure">School closure information</option>
    </select>
   </label>
   <label className="block text-sm font-semibold">Message heading
    <input required minLength={8} maxLength={160} value={title}
     onChange={e=>{setTitle(e.target.value);clearPending();}}
     className="mt-2 w-full rounded border bg-background p-3" />
   </label>
   <label className="block text-sm font-semibold">What families need to know and do
    <textarea required rows={5} minLength={20} maxLength={3000} value={message}
     onChange={e=>{setMessage(e.target.value);clearPending();}}
     placeholder="Include the effective date, affected school activities, safety instructions and how to contact the school."
     className="mt-2 w-full rounded border bg-background p-3" />
   </label>
   <p className="text-xs text-muted-foreground">Verified families receive an in-app notice and queued email. Only verified SMS opt-ins receive a text, which tells families to sign in. Quiet hours may delay delivery. This is not an emergency dispatch system, a calendar mutation or authorization to close the school.</p>
   <button type="submit" disabled={busy||!programId||title.trim().length<8||message.trim().length<20}
    className="rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
    {busy?"Publishing…":"Publish to currently enrolled families"}
   </button>
  </form>
  <section className="mt-8 space-y-3">
   <h2 className="text-lg font-semibold">Recent published notices</h2>
   {data.items.map(item=><article key={item.id} className="rounded-lg border bg-card p-4">
    <p className="font-semibold">{item.title}</p>
    <p className="mt-1 text-xs text-muted-foreground">{String(item.kind).replaceAll("_"," ")} · {new Date(item.publishedAt).toLocaleString()}</p>
    <p className="mt-2 whitespace-pre-wrap text-sm">{item.description}</p>
    <p className="mt-3 text-sm">{item.recipients} in-app recipients · {item.acknowledged} marked read</p>
    <p className="mt-1 text-sm">Email: {item.emailAccepted}/{item.emailQueued} accepted by provider · SMS: {item.smsAccepted}/{item.smsQueued} accepted by provider</p>
    {item.deliveryFailed>0&&Date.now()-new Date(item.publishedAt).getTime()<48*60*60*1000&&<button type="button" disabled={busy} className="mt-2 rounded border px-3 py-1.5 text-xs font-semibold disabled:opacity-50" onClick={()=>void retry(item.id)}>Retry exhausted delivery attempts</button>}
    {(item.deliveryFailed>0||item.deliverySuppressed>0)&&<p className="mt-1 text-sm">
      {item.deliveryFailed} attempts exhausted · {item.deliverySuppressed} deliveries suppressed after authorization/preference review
    </p>}
    <p className="mt-2 text-xs text-muted-foreground">Accepted does not mean delivered, read or acknowledged. Urgent safety incidents require direct follow-up.</p>
   </article>)}
   {!data.items.length&&<p className="rounded-lg border p-4 text-sm">No published family notices in your authorized schools.</p>}
  </section>
 </WorkspaceShell>;
}
