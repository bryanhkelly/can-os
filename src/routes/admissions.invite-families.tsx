import {createFileRoute,Link,useRouter} from "@tanstack/react-router";
import {useState,type FormEvent} from "react";
import {WorkspaceShell} from "@/components/workspace";
import {safeLoader} from "@/lib/safe-loader";
import {LoaderFailure} from "@/lib/loader-failure";
import {
  listFamilyInvitations,sendFamilyInvitations,retryFamilyInvitationBatch,
} from "@/modules/enrollment/family-invitations.functions";

export const Route=createFileRoute("/admissions/invite-families")({
 loader:safeLoader(()=>listFamilyInvitations(),{
  authMessage:"Sign in as a receiving-school registrar to invite prospective families.",
 }),
 component:FamilyInvitationsPage,
});
type Data=Awaited<ReturnType<typeof listFamilyInvitations>>;
function FamilyInvitationsPage(){
 const result=Route.useLoaderData();
 if(!result.ok)return <LoaderFailure eyebrow="CAN OS · Admissions"
  title="Invite prospective families" outcome={result}/>;
 return <FamilyInvitationsWorkspace data={result.data}/>;
}
function FamilyInvitationsWorkspace({data}:{data:Data}){
 const router=useRouter();
 const eligible=data.programs.filter(program=>program.purpose==="application");
 const [programId,setProgramId]=useState(eligible[0]?.id??"");
 const [contacts,setContacts]=useState("");
 const [introduction,setIntroduction]=useState("You're invited to start an application at our school. Please verify your email using the private secure link in this invitation. This is not an offer of enrollment.");
 const [subject,setSubject]=useState("Invitation to apply to our school");
 const [requestId,setRequestId]=useState(()=>crypto.randomUUID());
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(""),[error,setError]=useState("");
 async function submit(event:FormEvent){
  event.preventDefault();
  if(busy||!programId||!contacts.trim())return;
  if(!window.confirm("Queue secure application invitations to the listed family email addresses? This does not verify legal guardianship, accept an application, or enroll a child."))return;
  setBusy(true);setError("");setNotice("");
  try{
   const result=await sendFamilyInvitations({data:{
    requestId,programId,rawContacts:contacts,subject,introduction,
    purpose:"application",confirmed:true,
   }});
   setNotice(result.created
    ?result.recipientCount+" secure application invitation(s) queued. Provider delivery and family response appear below."
    :"This invitation request is already queued. No duplicate invitations were created.");
   setRequestId(crypto.randomUUID());setContacts("");
   try{await router.invalidate();}
   catch{setError("The batch was queued but the status list could not refresh. Do not resubmit the same recipients.");}
  }catch(e){setError(e instanceof Error?e.message:"Unable to queue family invitations.");}
  finally{setBusy(false);}
 }
 async function retry(batchId:string){
  if(busy)return;
  setBusy(true);setNotice("");setError("");
  try{
   const result=await retryFamilyInvitationBatch({data:{batchId}});
   setNotice(result.retried>0?result.retried+" unaccepted invitation(s) queued for retry. Already accepted recipients will not be sent again.":"No unaccepted failed recipients remain in this batch.");
   await router.invalidate();
  }catch(e){setError(e instanceof Error?e.message:"Could not retry invitations.");}
  finally{setBusy(false);}
 }
 return <WorkspaceShell eyebrow="CAN OS · Admissions" title="Invite families to apply"
  subtitle="Send verified-email enrollment invitations to prospective families, including transfers from another school. The receiving-school registrar controls the invitation; no child identity or admissions decision is inferred."
  actions={<Link to="/admissions" className="rounded border px-3 py-2 text-sm">Admissions</Link>}>
  {notice&&<p role="status" className="mt-5 rounded border p-4 text-sm">{notice}</p>}
  {error&&<p role="alert" className="mt-5 rounded border p-4 text-sm">{error}</p>}
  {eligible.length>0?<form onSubmit={event=>void submit(event)} className="mt-6 max-w-3xl space-y-4 rounded-xl border bg-card p-5">
   <h2 className="font-semibold">Send a private receiving-school application invitation</h2>
   <label className="block text-sm font-medium">Authorized school Program
     <select value={programId} required onChange={event=>setProgramId(event.target.value)}
       className="mt-2 w-full rounded border bg-background p-3">
       {eligible.map(program=><option value={program.id} key={program.id}>{program.name}</option>)}
     </select>
   </label>
   <label className="block text-sm font-medium">Family contacts · one per line
     <textarea required rows={5} maxLength={20_000} value={contacts}
       onChange={event=>setContacts(event.target.value)}
       placeholder={"Guardian Name,guardian@example.com\nsecond.guardian@example.com"}
       className="mt-2 w-full rounded border bg-background p-3"/>
   </label>
   <p className="text-xs text-muted-foreground">Only include adults who have requested or consented to contact. Do not paste child data, medical records or custody documents. The existing invitation service deduplicates recipients and checks school authorization.</p>
   <label className="block text-sm font-medium">Email subject
     <input required minLength={3} maxLength={120} value={subject}
       onChange={event=>setSubject(event.target.value)} className="mt-2 w-full rounded border bg-background p-3"/>
   </label>
   <label className="block text-sm font-medium">School introduction
     <textarea required rows={3} maxLength={2000} value={introduction}
       onChange={event=>setIntroduction(event.target.value)}
       className="mt-2 w-full rounded border bg-background p-3"/>
   </label>
   <button type="submit" disabled={busy||!contacts.trim()||!programId||!subject.trim()||!introduction.trim()}
     className="rounded bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50">
     {busy?"Queuing…":"Queue secure invitations"}
   </button>
  </form>:<p className="mt-6 rounded border p-4 text-sm">
    No operating school Programs with admissions authority are available to this registrar. Complete institutional authorization before sending application invitations.
  </p>}
  <section className="mt-8 space-y-3">
   <h2 className="text-lg font-semibold">Recent invitation batches</h2>
   {data.batches.map(batch=><article key={batch.id} className="rounded-lg border bg-card p-4">
     <p className="font-semibold">{batch.programName} · {batch.subject}</p>
     <p className="mt-1 text-xs text-muted-foreground">
       {new Date(batch.createdAt).toLocaleString()} · {batch.status} · {batch.outboxStatus??"Queued for dispatch"}
     </p>
     <p className="mt-2 text-sm">{batch.recipients.length} recipient(s):
       {batch.recipients.filter(row=>row.status==="responded").length} verified a link;
       {batch.recipients.filter(row=>row.status==="provider_accepted").length} provider accepted;
       {batch.recipients.filter(row=>row.status==="retrying").length} require retry.</p>
     {batch.recipients.some(row=>row.status==="retrying")&&<button type="button"
       disabled={busy} onClick={()=>void retry(batch.id)}
       className="mt-3 rounded border px-3 py-2 text-xs font-semibold disabled:opacity-50">
       Retry unaccepted invitations
     </button>}
     <p className="mt-2 text-xs text-muted-foreground">Provider acceptance does not confirm inbox delivery. A verified email link is not proof of guardianship or admission.</p>
   </article>)}
   {!data.batches.length&&<p className="rounded-lg border p-4 text-sm">No invitations are recorded for your schools.</p>}
  </section>
 </WorkspaceShell>;
}
