import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { WorkspaceShell } from "@/components/workspace";
import { authorizeAcademicCredentialRelease,listAcademicCredentialDeliveries,listAcademicCredentialReleaseAuthorizations,listVerifiedCredentialRecipients,revokeAcademicCredentialRelease,renderAcademicCredential } from "@/modules/learning/academic-credential-delivery.functions";

export const Route=createFileRoute("/admissions/credential-delivery")({component:CredentialDeliveryPage});
type Recipient=Awaited<ReturnType<typeof listVerifiedCredentialRecipients>>[number];
type Release=Awaited<ReturnType<typeof listAcademicCredentialReleaseAuthorizations>>[number];
type Delivery=Awaited<ReturnType<typeof listAcademicCredentialDeliveries>>[number];
function CredentialDeliveryPage(){
 const [kind,setKind]=useState<"transcript"|"diploma">("transcript");
 const [credentialId,setCredentialId]=useState("");
 const [history,setHistory]=useState<Delivery[]>([]);
 const [releases,setReleases]=useState<Release[]>([]);
 const [recipients,setRecipients]=useState<Recipient[]>([]);
 const [selectedRecipient,setSelectedRecipient]=useState("");
 const [transferActionId,setTransferActionId]=useState("");
 const [consentId,setConsentId]=useState("");
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 async function run(fn:()=>Promise<void>){setBusy(true);setMessage("");try{await fn()}catch(e){setMessage(e instanceof Error?e.message:"Unable to process credential")}finally{setBusy(false)}}
 function download(base64:string,filename:string){
  const bytes=Uint8Array.from(atob(base64),char=>char.charCodeAt(0));
  const url=URL.createObjectURL(new Blob([bytes],{type:"application/pdf"}));
  const link=document.createElement("a");link.href=url;link.download=filename;link.click();URL.revokeObjectURL(url);
 }
 const field=(label:string,value:string,set:(v:string)=>void)=><label className="block text-sm font-medium">{label}<input className="mt-1 block w-full rounded-lg border bg-background p-2" value={value} onChange={e=>set(e.target.value)}/></label>;
 return <WorkspaceShell eyebrow="CAN OS · Registrar" title="Official credential delivery" subtitle="Download issued documents and inspect historical delivery receipts. External release is currently disabled.">
  <div className="space-y-5 py-6">
   <p className="text-sm">Documents are generated from issued transcript snapshots or approved, active diploma records. Email acceptance does not prove delivery to the recipient's inbox.</p>
   {message&&<p role="status" className="rounded-lg border p-3">{message}</p>}
   <section className="space-y-3 rounded-xl border p-4">
    <label className="block text-sm font-medium">Credential type<select className="mt-1 block w-full rounded-lg border bg-background p-2" value={kind} onChange={e=>{setKind(e.target.value as "transcript"|"diploma");setCredentialId("");setHistory([]);setReleases([]);setRecipients([])}}><option value="transcript">Official transcript</option><option value="diploma">Diploma</option></select></label>
    {field("Issued credential ID",credentialId,value=>{setCredentialId(value);setHistory([]);setReleases([])})}
    <div className="flex flex-wrap gap-2">
     <button disabled={busy} className="rounded-lg border px-3 py-2" onClick={()=>void run(async()=>{const result=await renderAcademicCredential({data:{kind,credentialId}});download(result.base64,result.filename);setMessage("Document generated for download.")})}>Download official PDF</button>
     <button disabled={busy} className="rounded-lg border px-3 py-2" onClick={()=>void run(async()=>{setHistory(await listAcademicCredentialDeliveries({data:{kind,credentialId}}))})}>Refresh delivery history</button>
    </div>
   </section>
   <section className="space-y-3 rounded-xl border p-4">
    <h2 className="font-semibold">Verified transfer release</h2>
    <p className="text-sm">A registrar may grant the verified guardian secure access to an issued transcript only when a completed school transfer and that guardian's signed, unrevoked records-release consent match the student. No PDF is emailed. This is a verified guardian handoff only; direct external school-to-school delivery is not supported.</p>
    <label className="block text-sm">Verified guardian<select className="mt-1 block w-full rounded-lg border bg-background p-2" value={selectedRecipient} onChange={e=>setSelectedRecipient(e.target.value)}><option value="">Select verified identity</option>{recipients.map(row=><option key={row.personId+row.email} value={row.personId+"|"+row.email}>{row.firstName} {row.lastName} ({row.email})</option>)}</select></label>
    {field("Completed transfer action ID",transferActionId,setTransferActionId)}
    {field("Signed transfer consent ID",consentId,setConsentId)}
    <button disabled={busy||kind!=="transcript"||!selectedRecipient||!transferActionId||!consentId} className="rounded-lg border px-3 py-2" onClick={()=>void run(async()=>{
     const [recipientPersonId,recipientEmail]=selectedRecipient.split("|");
     await authorizeAcademicCredentialRelease({data:{
      kind:"transcript",credentialId,recipientPersonId,recipientEmail,
      releasePurpose:"transfer",instructionReference:transferActionId,
      consentEvidenceReference:consentId,
      expiresAt:new Date(Date.now()+7*86400000).toISOString(),
     }});
     setReleases(await listAcademicCredentialReleaseAuthorizations({data:{kind,credentialId}}));
     setMessage("Secure recipient authorization recorded. The recipient must sign in to access the record.");
    })}>Authorize seven-day secure access</button>
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
    <p className="text-sm">Only CAN registrars may revoke existing authorizations. New external releases remain disabled pending independent evidence verification.</p>
    <button disabled={busy} className="rounded-lg border px-3 py-2" onClick={()=>void run(async()=>{setReleases(await listAcademicCredentialReleaseAuthorizations({data:{kind,credentialId}}))})}>Refresh release authorizations</button>
    {releases.map(row=>{
     const status=row.revokedAt?"Revoked":new Date(row.expiresAt)<=new Date()?"Expired":"Authorized";
     return <article key={row.id} className="rounded-lg border p-3 text-sm">
      <strong>{row.recipientEmail}</strong>
      <p>Purpose: {row.releasePurpose}</p>
      <p>Status: {status} · Authorized: {new Date(row.authorizedAt).toLocaleString()} · Expires: {new Date(row.expiresAt).toLocaleString()}</p>
      {status==="Authorized"&&<button disabled={busy} className="mt-2 rounded-lg border px-3 py-2" onClick={()=>void run(async()=>{
       await revokeAcademicCredentialRelease({data:{authorizationId:row.id}});
       setReleases(await listAcademicCredentialReleaseAuthorizations({data:{kind,credentialId}}));
       setMessage("Release revoked.");
      })}>Revoke access</button>}
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
