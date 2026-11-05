import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CreateAction, WorkspaceShell, secondaryActionClassName } from "@/components/workspace";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { useMutationFeedback } from "@/lib/mutation-feedback";
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
 if(!outcome.ok)return <LoaderFailure eyebrow="Communications"
  title="School to family alerts" outcome={outcome}/>;
 return <Publisher data={outcome.data}/>;
}
export function Publisher({data,mode="history"}:{data:Data;mode?:"history"|"compose"}){
 const router=useRouter();
 const mutation=useMutationFeedback(()=>router.invalidate());
 const busy=mutation.pending||mutation.refreshFailed;
 const [programId,setProgramId]=useState(data.programs[0]?.id??"");
 const [kind,setKind]=useState<Kind>("urgent_school_update");
 const [title,setTitle]=useState(""),[message,setMessage]=useState("");
 const [attempted,setAttempted]=useState(false);
 const pendingId=useRef<string|null>(null);
 const clearPending=()=>{pendingId.current=null;};
 async function publish(event:FormEvent){
  event.preventDefault();
  if(busy)return;
  setAttempted(true);
  if(!programId||title.trim().length<8||message.trim().length<20)return;
  if(!window.confirm("Publish this "+kind.replaceAll("_"," ")+" to every currently verified enrolled family in the selected Program? The message becomes visible in the family notification center. This does not close school, modify schedules, or guarantee email/SMS delivery."))return;
  pendingId.current??=crypto.randomUUID();
  await mutation.run(async()=>{
   const result=await publishSchoolFamilyAlert({data:{
    programId,kind,title:title.trim(),message:message.trim(),
    mutationId:pendingId.current!,confirmed:true,
   }});
   pendingId.current=null;setTitle("");setMessage("");
   return result;
  },{
   successMessage:result=>result.published
    ?`Published to ${result.recipientCount} currently authorized family accounts via in-app notifications.`
    :`Already published; ${result.recipientCount} family notifications were recorded.`,
   commandErrorMessage:"Unable to publish school notice. No delivery can be assumed.",
   refreshErrorMessage:"The publication was saved but the history failed to refresh. Do not publish the same notice again.",
  });
 }
 async function retry(alertId:string){
  if(busy)return;
  if(!window.confirm("Retry exhausted email/SMS provider attempts for this recent notice? Accepted messages will not be resent."))return;
  await mutation.run(
   ()=>retryFailedSchoolFamilyAlertDeliveries({data:{alertId,confirmed:true}}),
   {
    successMessage:result=>result.requeued+" failed delivery attempts requeued. The worker will recheck current family authorization.",
    commandErrorMessage:"Could not retry deliveries.",
   },
  );
 }
 return <WorkspaceShell eyebrow="School operations" title={mode==="compose"?"Compose family notice":"Urgent family communications"}
  subtitle="Publish verified family notices through in-app notifications, school email and opt-in SMS. Provider acceptance is not evidence of inbox or phone delivery."
  breadcrumbs={mode==="compose"?<Link to="/operations/family-alerts" className="underline">Family notices</Link>:undefined}
  actions={mode==="history"?<CreateAction><Link to="/operations/family-alerts/compose">Compose notice</Link></CreateAction>:
   <Link to="/operations/family-alerts" className={secondaryActionClassName}>Published notices</Link>}>
  <MutationFeedback state={mutation} className="mt-5" pendingMessage="Saving family communication..."/>
  {mode==="compose"&&<form noValidate onSubmit={e=>void publish(e)} className="mt-6 max-w-3xl space-y-4">
   <h2 className="text-lg font-semibold">Compose a school notice</h2>
   <Field label="School Program" required error={attempted&&!programId?"Choose a Program.":undefined}>
    <Select value={programId} onChange={e=>{setProgramId(e.target.value);clearPending();}}>
     {data.programs.map(p=><option key={p.id} value={p.id}>{p.name} · {p.siteName}</option>)}
    </Select>
   </Field>
   <Field label="Type">
    <Select value={kind} onChange={e=>{setKind(e.target.value as Kind);clearPending();}}>
     <option value="urgent_school_update">Urgent school update</option>
     <option value="schedule_change">Schedule update</option>
     <option value="school_closure">School closure information</option>
    </Select>
   </Field>
   <Field label="Message heading" required
    error={attempted&&title.trim().length<8?"Enter a heading with at least 8 characters.":undefined}>
    <Input minLength={8} maxLength={160} value={title}
     onChange={e=>{setTitle(e.target.value);clearPending();}} />
   </Field>
   <Field label="What families need to know and do" required
    error={attempted&&message.trim().length<20?"Enter at least 20 characters describing what families need to know and do.":undefined}>
    <Textarea rows={5} minLength={20} maxLength={3000} value={message}
     onChange={e=>{setMessage(e.target.value);clearPending();}}
     placeholder="Include the effective date, affected school activities, safety instructions and how to contact the school." />
   </Field>
   <p className="text-xs text-muted-foreground">Verified families receive an in-app notice and queued email. Only verified SMS opt-ins receive a text, which tells families to sign in. Quiet hours may delay delivery. This is not an emergency dispatch system, a calendar mutation or authorization to close the school.</p>
  <Button type="submit" disabled={busy}>
    {busy?"Publishing…":"Publish to currently enrolled families"}
  </Button>
  </form>}
  {mode==="history"&&<section className="mt-8 space-y-3">
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
  </section>}
 </WorkspaceShell>;
}
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
