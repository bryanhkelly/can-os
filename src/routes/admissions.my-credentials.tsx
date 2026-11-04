import { mutationErrorMessage } from "@/lib/mutation-feedback";
import { downloadBase64 } from "@/lib/download";
import {useRef,useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {createFileRoute} from "@tanstack/react-router";
import {WorkspaceShell,QueryState} from "@/components/workspace";
import {listMyAcademicCredentialReleases,downloadAuthorizedAcademicCredential} from "@/modules/learning/academic-credential-delivery.functions";

export const Route=createFileRoute("/admissions/my-credentials")({component:MyCredentials});
function MyCredentials(){
 const query=useQuery({queryKey:["my-academic-credential-releases"],queryFn:()=>listMyAcademicCredentialReleases(),retry:false,gcTime:0});
 const releases=query.data??[];
 const [downloading,setDownloading]=useState(false);
 const busy=downloading||query.isFetching;
 const inFlight=useRef(false);
 const [error,setError]=useState("");
 async function download(id:string){if(inFlight.current||query.isFetching)return;inFlight.current=true;setDownloading(true);setError("");try{
  const doc=await downloadAuthorizedAcademicCredential({data:{authorizationId:id}});
  downloadBase64(doc.base64,doc.filename,"application/pdf");
 }catch(e){setError(mutationErrorMessage(e, "Download denied"))}finally{inFlight.current=false;setDownloading(false)}}
 return <WorkspaceShell eyebrow="Records" title="My official credentials" subtitle="Secure, time-limited access to records authorized for your verified account.">
  <div className="space-y-4 py-6">
   {error&&<p role="alert" className="rounded-lg border p-3">{error}</p>}
   <button type="button" className="rounded-lg border px-3 py-2" disabled={busy} onClick={()=>void query.refetch()}>Refresh authorizations</button>
   <QueryState loading={query.isPending?"Loading your records...":undefined}
    error={query.isError?mutationErrorMessage(query.error,"Unable to load your records"):undefined}
    onRetry={()=>void query.refetch()} retrying={busy}
    isEmpty={!releases.length} empty={<p className="text-sm text-muted-foreground">No active official-record releases are available for your account.</p>}>
   {releases.map(row=><article key={row.id} className="space-y-2 rounded-xl border p-4">
    <h2 className="font-semibold">{row.transcriptId?"Official transcript":"Diploma"}</h2>
    <p className="text-sm">Purpose: {row.purpose}</p>
    <p className="text-sm">Access expires {new Date(row.expiresAt).toLocaleString()}</p>
    <button type="button" disabled={busy} className="rounded-lg border px-3 py-2" onClick={()=>void download(row.id)}>Download authorized PDF</button>
   </article>)}
   </QueryState>
  </div>
 </WorkspaceShell>;
}
