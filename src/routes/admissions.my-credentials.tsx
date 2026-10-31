import {useEffect,useState} from "react";
import {createFileRoute} from "@tanstack/react-router";
import {WorkspaceShell} from "@/components/workspace";
import {listMyAcademicCredentialReleases,downloadAuthorizedAcademicCredential} from "@/modules/learning/academic-credential-delivery.functions";

export const Route=createFileRoute("/admissions/my-credentials")({component:MyCredentials});
type Release=Awaited<ReturnType<typeof listMyAcademicCredentialReleases>>[number];
function MyCredentials(){
 const [releases,setReleases]=useState<Release[]>([]);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 async function refresh(){setBusy(true);setError("");try{setReleases(await listMyAcademicCredentialReleases())}catch(e){setError(e instanceof Error?e.message:"Unable to load your records")}finally{setBusy(false)}}
 useEffect(()=>{void refresh()},[]);
 async function download(id:string){setBusy(true);setError("");try{
  const doc=await downloadAuthorizedAcademicCredential({data:{authorizationId:id}});
  const bytes=Uint8Array.from(atob(doc.base64),char=>char.charCodeAt(0));
  const url=URL.createObjectURL(new Blob([bytes],{type:"application/pdf"}));
  const anchor=document.createElement("a");anchor.href=url;anchor.download=doc.filename;anchor.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 }catch(e){setError(e instanceof Error?e.message:"Download denied")}finally{setBusy(false)}}
 return <WorkspaceShell eyebrow="CAN OS · Records" title="My official credentials" subtitle="Secure, time-limited access to records authorized for your verified account.">
  <div className="space-y-4 py-6">
   {error&&<p role="alert" className="rounded-lg border p-3">{error}</p>}
   <button type="button" className="rounded-lg border px-3 py-2" disabled={busy} onClick={()=>void refresh()}>Refresh authorizations</button>
   {releases.map(row=><article key={row.id} className="space-y-2 rounded-xl border p-4">
    <h2 className="font-semibold">{row.transcriptId?"Official transcript":"Diploma"}</h2>
    <p className="text-sm">Purpose: {row.purpose}</p>
    <p className="text-sm">Access expires {new Date(row.expiresAt).toLocaleString()}</p>
    <button type="button" disabled={busy} className="rounded-lg border px-3 py-2" onClick={()=>void download(row.id)}>Download authorized PDF</button>
   </article>)}
   {!busy&&!releases.length&&!error&&<p className="text-sm text-muted-foreground">No active official-record releases are available for your account.</p>}
  </div>
 </WorkspaceShell>;
}
