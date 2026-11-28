import {useState} from "react";
import {Button} from "@/components/ui/button";
import {WorkspaceNotice} from "@/components/workspace";
import {checkGlooConnection,readGlooRecoveryCandidates,grantLegacyGlooRetry} from "@/modules/sites/site-content-generation.functions";

/** Explicit administrator-only provider probe and bounded legacy recovery. */
export function PlatformGlooHealth(){
 const [probe,setProbe]=useState<Awaited<ReturnType<typeof checkGlooConnection>>|null>(null);
 const [rows,setRows]=useState<Awaited<ReturnType<typeof readGlooRecoveryCandidates>>>([]);
 const [pending,setPending]=useState(false);
 const [message,setMessage]=useState("");
 const [failed,setFailed]=useState(false);
 async function check(){
  if(pending)return;
  setPending(true);setProbe(null);setRows([]);setMessage("");setFailed(false);
  try{const result=await checkGlooConnection();setProbe(result);if(result.ok)setRows(await readGlooRecoveryCandidates());}
  catch{setFailed(true);setMessage("Provider diagnostics could not be completed. Check your platform access and deployment.");}
  finally{setPending(false);}
 }
 async function recover(row:typeof rows[number]){
  if(pending||!probe?.ok)return;
  if(!window.confirm("Authorize one additional diagnostic generation attempt for "+row.siteName+"? This does not send Site information."))return;
  setPending(true);setMessage("");setFailed(false);
  try{const result=await grantLegacyGlooRetry({data:{siteId:row.siteId,inputId:row.inputId,confirmed:true}});setMessage(result.message);setFailed(!result.ok);if(result.ok)setRows(old=>old.filter(item=>item.inputId!==row.inputId));}
  catch{setFailed(true);setMessage("Retry authorization failed. No further attempt is confirmed.");}
  finally{setPending(false);}
 }
 return <section className="mt-6 space-y-4 border border-border bg-card p-5" aria-label="AI provider health">
   <h2 className="font-serif text-xl">AI provider health</h2>
   <p className="text-sm text-muted-foreground">Test Gloo using a small synthetic request. No Site information is sent. Credentials are used only for provider authentication and are never displayed.</p>
   <Button type="button" variant="outline" disabled={pending} onClick={()=>void check()}>{pending?"Checking…":"Test Gloo connection"}</Button>
   {probe&&<div className="space-y-2" role="status">
    <p className="text-sm">API key: {probe.keyConfigured?"Configured":"Missing"} · Model: {probe.modelConfigured?"Configured":"Missing"}</p>
    <WorkspaceNotice tone={probe.ok?"info":"attention"}>{probe.message} ({probe.code})</WorkspaceNotice>
   </div>}
   {probe?.ok&&<div className="space-y-3"><h3 className="text-sm font-semibold">Legacy generation recovery</h3>
    <p className="text-sm text-muted-foreground">Only exhausted failures recorded before specific diagnostics are eligible. Authorization is audited and does not generate content.</p>
    {rows.length===0?<p className="text-sm">No eligible legacy failures found.</p>:rows.map(row=><div key={row.inputId} className="flex flex-wrap items-center justify-between gap-3 border border-border p-3"><span className="text-sm">{row.siteName} · input version {row.revision} · {row.attempts} attempts</span><Button type="button" variant="outline" disabled={pending} onClick={()=>void recover(row)}>Authorize one retry</Button></div>)}
   </div>}
   {message&&<p role={failed?"alert":"status"} className="text-sm">{message}</p>}
 </section>;
}
