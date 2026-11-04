import { mutationErrorMessage, useMutationFeedback } from "@/lib/mutation-feedback";
import { downloadBase64 } from "@/lib/download";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import { useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { WorkspaceShell } from "@/components/workspace";
import { authorizeAcademicCredentialRelease,listAcademicCredentialDeliveries,listAcademicCredentialReleaseAuthorizations,listAcademicCredentialReleaseAccessHistory,listVerifiedCredentialRecipients,revokeAcademicCredentialRelease,renderAcademicCredential } from "@/modules/learning/academic-credential-delivery.functions";

export const Route=createFileRoute("/admissions/credential-delivery")({component:CredentialDeliveryPage});
type Recipient=Awaited<ReturnType<typeof listVerifiedCredentialRecipients>>[number];
type Access=Awaited<ReturnType<typeof listAcademicCredentialReleaseAccessHistory>>[number];
type Release=Awaited<ReturnType<typeof listAcademicCredentialReleaseAuthorizations>>[number];
type Delivery=Awaited<ReturnType<typeof listAcademicCredentialDeliveries>>[number];
function CredentialDeliveryPage(){
 const [kind,setKind]=useState<"transcript"|"diploma">("transcript");
 const [credentialId,setCredentialId]=useState("");
 const [history,setHistory]=useState<Delivery[]>([]);
 const [releases,setReleases]=useState<Release[]>([]);
 const [accessHistory,setAccessHistory]=useState<Record<string,Access[]>>({});
 const [recipients,setRecipients]=useState<Recipient[]>([]);
 const [selectedRecipient,setSelectedRecipient]=useState("");
 const [transferActionId,setTransferActionId]=useState("");
 const [consentId,setConsentId]=useState("");
 const [releaseAcknowledged,setReleaseAcknowledged]=useState(false);
 const [reading,setReading]=useState(false);
 const readingRef=useRef(false);
 const mutation=useMutationFeedback(async()=>undefined);
 const busy=reading||mutation.pending||mutation.refreshFailed;
 const [message,setMessage]=useState("");
 async function run(fn:()=>Promise<void>){
  if(readingRef.current||busy)return;
  readingRef.current=true;setReading(true);setMessage("");
  try{await fn()}catch(e){setMessage(mutationErrorMessage(e, "Unable to process credential"))}finally{readingRef.current=false;setReading(false)}
 }
 return <WorkspaceShell eyebrow="Registrar" title="Official credential delivery" subtitle="Download issued documents and inspect historical delivery receipts. External release is currently disabled.">
  <div className="space-y-5 py-6">
   <p className="text-sm">Documents are generated from issued transcript snapshots or approved, active diploma records. Email acceptance does not prove delivery to the recipient's inbox.</p>
   {message&&<p role="status" className="rounded-lg border p-3">{message}</p>}
   <MutationFeedback state={mutation} pendingMessage="Recording credential authorization..."/>
   <section className="space-y-3 rounded-xl border p-4">
    <label className="block text-sm font-medium">Credential type<select className="mt-1 block w-full rounded-lg border bg-background p-2" value={kind} onChange={e=>{setKind(e.target.value as "transcript"|"diploma");setCredentialId("");setHistory([]);setReleases([]);setRecipients([])}}><option value="transcript">Official transcript</option><option value="diploma">Diploma</option></select></label>
    <Field label="Issued credential ID"><Input value={credentialId} onChange={event=>{setCredentialId(event.target.value);setHistory([]);setReleases([])}}/></Field>
    <div className="flex flex-wrap gap-2">
     <button disabled={busy} className="rounded-lg border px-3 py-2" onClick={()=>void run(async()=>{const result=await renderAcademicCredential({data:{kind,credentialId}});downloadBase64(result.base64,result.filename,"application/pdf");setMessage("Document generated for download.")})}>Download official PDF</button>
     <button disabled={busy} className="rounded-lg border px-3 py-2" onClick={()=>void run(async()=>{setHistory(await listAcademicCredentialDeliveries({data:{kind,credentialId}}))})}>Refresh delivery history</button>
    </div>
   </section>
   <section className="space-y-3 rounded-xl border p-4">
    <h2 className="font-semibold">Verified transfer release</h2>
    <p className="text-sm">A registrar may grant the verified guardian secure access to an issued transcript only when a completed school transfer and that guardian's signed, unrevoked records-release consent match the student. No PDF is emailed. This is a verified guardian handoff only; direct external school-to-school delivery is not supported.</p>
    <label className="block text-sm">Verified guardian<select className="mt-1 block w-full rounded-lg border bg-background p-2" value={selectedRecipient} onChange={e=>setSelectedRecipient(e.target.value)}><option value="">Select verified identity</option>{recipients.map(row=><option key={row.personId+row.email} value={row.personId+"|"+row.email}>{row.firstName} {row.lastName} ({row.email})</option>)}</select></label>
    <Field label="Completed transfer action ID"><Input value={transferActionId} onChange={event=>setTransferActionId(event.target.value)}/></Field>
    <Field label="Signed transfer consent ID"><Input value={consentId} onChange={event=>setConsentId(event.target.value)}/></Field>
    <label className="flex gap-2 text-sm"><input type="checkbox" checked={releaseAcknowledged} onChange={e=>setReleaseAcknowledged(e.target.checked)}/>I reviewed the completed transfer, signed consent, guardian authority and verified recipient. This grants guardian access, not delivery to an outside institution.</label>
    <button disabled={busy||!releaseAcknowledged||kind!=="transcript"||!selectedRecipient||!transferActionId||!consentId} className="rounded-lg border px-3 py-2" onClick={()=>void mutation.run(async()=>{
     const [recipientPersonId,recipientEmail]=selectedRecipient.split("|");
     await authorizeAcademicCredentialRelease({data:{
      kind:"transcript",credentialId,recipientPersonId,recipientEmail,
      releasePurpose:"transfer",instructionReference:transferActionId,
      consentEvidenceReference:consentId,
      expiresAt:new Date(Date.now()+7*86400000).toISOString(),
     }});
    },{successMessage:"Secure recipient authorization recorded. The recipient must sign in to access the record.",
     commandErrorMessage:"Unable to authorize credential release.",
     refresh:async()=>setReleases(await listAcademicCredentialReleaseAuthorizations({data:{kind,credentialId}}))})}>Authorize seven-day secure access</button>
   </section>
   <section className="space-y-3 rounded-xl border p-4">
    <h2 className="font-semibold">Verified recipient candidates</h2>
    <p className="text-sm">Only the credential student and academically authorized guardians with verified accounts are shown. Identity verification alone is not permission to release a record.</p>
    <button disabled={busy} className="rounded-lg border px-3 py-2" onClick={()=>void run(async()=>{setRecipients(await listVerifiedCredentialRecipients({data:{kind,credentialId}}))})}>Find eligible identities</button>
    {recipients.map(row=><p key={row.personId+row.email} className="rounded-lg border p-3 text-sm">{row.firstName} {row.lastName} · {row.email}</p>)}
    {!recipients.length&&<p className="text-sm text-muted-foreground">No recipient candidates loaded.</p>}
   </section>
   <section className="space-y-3 rounded-xl border p-4">
    <h2 className="font-semibold">Release authorization status</h2>
    <p className="text-sm">Only CAN registrars may revoke existing authorizations. School-to-school delivery remains blocked; guardian-access authorizations are reviewed and revoked here.</p>
    <button disabled={busy} className="rounded-lg border px-3 py-2" onClick={()=>void run(async()=>{setReleases(await listAcademicCredentialReleaseAuthorizations({data:{kind,credentialId}}))})}>Refresh release authorizations</button>
    {releases.map(row=>{
     const status=row.revokedAt?"Revoked":new Date(row.expiresAt)<=new Date()?"Expired":"Authorized";
     return <article key={row.id} className="rounded-lg border p-3 text-sm">
      <strong>{row.recipientEmail}</strong>
      <p>Purpose: {row.releasePurpose}</p>
      <p>Status: {status} · Authorized: {new Date(row.authorizedAt).toLocaleString()} · Expires: {new Date(row.expiresAt).toLocaleString()}</p>
      <button disabled={busy} className="mt-2 rounded-lg border px-3 py-2" onClick={()=>void run(async()=>{
       const rows=await listAcademicCredentialReleaseAccessHistory({data:{authorizationId:row.id}});
       setAccessHistory(previous=>({...previous,[row.id]:rows}));
      })}>Review PDF disclosures</button>
      {accessHistory[row.id]?.length===0&&<p>No successfully prepared PDF disclosures recorded.</p>}
      {accessHistory[row.id]?.map(entry=><p key={entry.id}>PDF prepared: {new Date(entry.occurredAt).toLocaleString()} · Recipient ID: {entry.actorPersonId}</p>)}
      {status==="Authorized"&&<button disabled={busy} className="mt-2 rounded-lg border px-3 py-2" onClick={()=>void mutation.run(
       ()=>revokeAcademicCredentialRelease({data:{authorizationId:row.id}}),
       {successMessage:"Release revoked.",commandErrorMessage:"Unable to revoke access.",
        refresh:async()=>setReleases(await listAcademicCredentialReleaseAuthorizations({data:{kind,credentialId}}))}
      )}>Revoke access</button>}
     </article>;
    })}
    {!releases.length&&<p className="text-sm text-muted-foreground">No release authorizations loaded.</p>}
   </section>
   <section className="space-y-3 rounded-xl border p-4">
    <h2 className="font-semibold">Delivery history</h2>
    {history.map(row=><article key={row.id} className="rounded-lg border p-3 text-sm"><strong>{row.recipientName}</strong> · {row.recipientEmail}<p>Status: {row.status} · Requested: {new Date(row.createdAt).toLocaleString()}</p>{row.providerMessageId&&<p>Provider receipt: {row.providerMessageId}</p>}{row.lastError&&<p role="alert">{row.lastError}</p>}</article>)}
    {!history.length&&<p className="text-sm text-muted-foreground">No delivery receipts loaded.</p>}
   </section>
   <Link to="/admissions/graduation" className="underline">Return to graduation closeout</Link>
  </div>
 </WorkspaceShell>;
}
