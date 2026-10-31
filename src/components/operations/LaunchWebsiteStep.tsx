import {useEffect,useState} from "react";
import {Link} from "@tanstack/react-router";
import {getLaunchWebsitePreparation} from "@/modules/programs/launch-website.functions";
import {LaunchWebsiteEditorHandoff} from "./LaunchWebsiteEditorHandoff";
type Website=Awaited<ReturnType<typeof getLaunchWebsitePreparation>>;

export function LaunchWebsiteStep({programId}:{programId:string}){
 return <WebsiteStep key={programId} programId={programId}/>;
}
function WebsiteStep({programId}:{programId:string}){
 const [data,setData]=useState<Website|null>(null),[error,setError]=useState("");
 const [retry,setRetry]=useState(0);
 useEffect(()=>{let current=true;
  void getLaunchWebsitePreparation({data:{programId}}).then(result=>{if(current){setData(result);setError("");}})
   .catch(()=>{if(current)setError("The private website preview could not be loaded. Check your school access and retry.");});
  return()=>{current=false;};
 },[programId,retry]);
 return <section id="launch-website" aria-label="Prepare your school website" className="mt-5 rounded-xl border bg-card p-5">
  <p className="text-xs font-semibold uppercase text-muted-foreground">School preparation · Website</p>
  <h2 className="mt-1 font-serif text-2xl">Your school website</h2>
  {error&&<p role="alert" className="mt-3 text-sm">{error}</p>}
  {data?<LaunchWebsitePreview data={data}/>:!error&&<p role="status" className="mt-3 text-sm">Preparing a private preview from the school's saved records…</p>}
  <button type="button" onClick={()=>setRetry(value=>value+1)} className="mt-3 rounded border px-3 py-2 text-sm">Refresh preview after editing</button>
 </section>;
}
export function LaunchWebsitePreview({data}:{data:Website}){
 return <>
  <p className="mt-2 text-sm">Review {data.programName}'s school page here. Church-owned welcome and community copy is edited by your assigned website editor; institutional claims follow their separate approval process.</p>
  <p className="mt-2 text-sm">{data.host?`Reserved address: ${data.host}`:"No website address has been reserved for this school Site."} · {data.status==="published"?"Marketing approved":"Private draft"} · {data.hostingConfigured?"Hosting configured; public availability requires separate verification":"Public hosting disabled"}</p>
  <p role="status" className="mt-2 rounded border p-3 text-sm">Public website: <strong>{data.publicAvailability==="live"?"Live — HTTPS verified":data.publicAvailability==="not_published"?"Not published":data.publicAvailability==="hosting_disabled"?"Hosting not configured":"Published but not reachable"}</strong>{data.checkedAt?` · Checked ${new Date(data.checkedAt).toLocaleString()}`:""}.</p>
  {data.host&&data.publicAvailability==="live"&&<a href={`https://${data.host}/`} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm underline">Open verified public website</a>}
  {data.publicAvailability!=="live"&&<p role="status" className="mt-2 rounded border p-3 text-sm">
   <strong>Next step: </strong>{data.hostingDiagnostic}
   {data.publicAvailability==="hosting_disabled"&&" Operator action: attach the approved wildcard domain to the Netlify target, verify wildcard DNS and certificate coverage, deploy the edge gate, then enable the separate server and edge flags. Production settings are not changed here."}
  </p>}
  {data.includesSuggestions&&<p className="mt-3 rounded border p-3 text-sm">This private preview includes suggested local welcome copy or a planned school listing. Suggestions are not saved editorial revisions or approved public claims.</p>}
  {data.previewHtml&&<iframe title={`${data.programName} private school website preview`} srcDoc={data.previewHtml}
   sandbox="" referrerPolicy="no-referrer" className="mt-4 h-[34rem] w-full rounded-lg border bg-white"/>}
  <nav aria-label="School website preparation" className="mt-4 flex flex-wrap gap-4 text-sm">
   <LaunchWebsiteEditorHandoff siteId={data.siteId} programId={data.programId}/>
   <Link to="/admin" search={{siteId:data.siteId,inviteRole:"site_website_editor"}} className="underline">Invite your church website editor</Link>
   <Link to="/sites/$siteId/publish" params={{siteId:data.siteId}} className="underline">Review address and institutional publishing</Link>
  </nav>
  <p className="mt-3 text-xs text-muted-foreground">Editor and publisher access are independently verified. This preview does not publish the website or open admissions.</p>
  <a href="#invite-families" className="mt-4 inline-block rounded bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground">Continue to family invitations →</a>
 </>;
}
