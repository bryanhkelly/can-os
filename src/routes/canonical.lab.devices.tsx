import {createFileRoute,useRouter} from "@tanstack/react-router";
import {useState} from "react";
import {WorkspaceShell} from "@/components/workspace";
import {CapabilityLabNav} from "@/components/capability-lab/CapabilityLabNav";
import {CanonicalBlueprintLoadError} from "@/components/launch-studio/CanonicalBlueprintLoadError";
import {safeLoader} from "@/lib/safe-loader";
import {getSiteDeviceWorkspace,createSiteDeviceRegistration,
 changeSiteDeviceStatus,updateSiteDevicePolicy} from "@/modules/identity/site-devices.functions";
export const Route=createFileRoute("/canonical/lab/devices")({
 loader:()=>safeLoader(()=>getSiteDeviceWorkspace())(),
 component:SiteDevicesPage,
});
function SiteDevicesPage(){
 const result=Route.useLoaderData();
 if(!result.ok)return <CanonicalBlueprintLoadError title="Site devices" message={result.message}/>;
 return <DevicesContent data={result.data}/>;
}
type Workspace=Awaited<ReturnType<typeof getSiteDeviceWorkspace>>;
function DevicesContent({data}:{data:Workspace}){
 const router=useRouter();
 const [label,setLabel]=useState("");
 const [category,setCategory]=useState<"desktop"|"laptop"|"tablet"|"phone"|"chromebook"|"other">("chromebook");
 const [ownership,setOwnership]=useState<"site"|"organization"|"loaned"|"personal">("site");
 const [managed,setManaged]=useState(false);
 const [sharedRequired,setSharedRequired]=useState(data.policy.sharedDeviceRequired);
 const [managedAssessment,setManagedAssessment]=useState(data.policy.managedDeviceRequiredForAssessments);
 const [idle,setIdle]=useState(data.policy.kioskIdleMinutes);
 const [working,setWorking]=useState(false),[message,setMessage]=useState("");
 async function run(task:()=>Promise<unknown>){
  if(working)return;
  setWorking(true);setMessage("");
  try{await task();await router.invalidate();setMessage("Changes saved.");}
  catch{setMessage("Unable to save. Check your Site authorization and try again.");}
  finally{setWorking(false);}
 }
 return <WorkspaceShell width="wide" eyebrow="Canonical · Site operations" title="Site device inventory"
  subtitle="Track available equipment and shared learning-center policies without using browser fingerprints.">
  <CapabilityLabNav current="devices"/>
  <p className="mt-5 text-sm text-muted-foreground">Only current authorized Site staff can view equipment records. Settings are planning policy; assessment lock-down requires managed-device attestation.</p>
  {message&&<p role="status" className="mt-5 border border-border p-3 text-sm">{message}</p>}
  {data.writeAllowed&&<div className="mt-6 grid gap-6 lg:grid-cols-2">
   <section className="border border-border bg-card p-5" aria-label="Register equipment">
    <h2 className="font-serif text-xl font-semibold">Register a device</h2>
    <form className="mt-4 space-y-3" onSubmit={event=>{event.preventDefault();void run(async()=>{
     await createSiteDeviceRegistration({data:{label,deviceCategory:category,ownership,managed}});
     setLabel("");
    });}}>
     <label className="block text-sm">Device label<input required minLength={2} maxLength={100} className="mt-1 block w-full border border-border bg-background p-2"
       value={label} onChange={event=>setLabel(event.target.value)} placeholder="Room A Chromebook 01"/></label>
     <label className="block text-sm">Category<select className="mt-1 block w-full border border-border bg-background p-2"
       value={category} onChange={e=>setCategory(e.target.value as typeof category)}>
      {["desktop","laptop","tablet","phone","chromebook","other"].map(s=><option key={s} value={s}>{s}</option>)}
     </select></label>
     <label className="block text-sm">Ownership<select className="mt-1 block w-full border border-border bg-background p-2"
      value={ownership} onChange={e=>setOwnership(e.target.value as typeof ownership)}>
      {["site","organization","loaned","personal"].map(s=><option key={s} value={s}>{s}</option>)}
     </select></label>
     <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={managed} onChange={e=>setManaged(e.target.checked)}/>Managed by the Site</label>
     <button disabled={working} type="submit" className="min-h-10 border border-border px-4 py-2 font-medium disabled:opacity-50">Add device</button>
    </form>
   </section>
   <section className="border border-border bg-card p-5" aria-label="Site policy">
    <h2 className="font-serif text-xl font-semibold">Device policy</h2>
    <div className="mt-4 space-y-4">
     <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sharedRequired} onChange={e=>setSharedRequired(e.target.checked)}/>Shared-device mode recommended for site computers</label>
     <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={managedAssessment} onChange={e=>setManagedAssessment(e.target.checked)}/>Require managed devices for restricted assessments (policy record only)</label>
     <label className="block text-sm">Target kiosk idle lock (minutes)<input type="number" min={1} max={30} value={idle} onChange={e=>setIdle(Number(e.target.value))} className="mt-1 block w-24 border border-border bg-background p-2"/></label>
     <button type="button" disabled={working} className="min-h-10 border border-border px-4 py-2 font-medium disabled:opacity-50"
      onClick={()=>void run(()=>updateSiteDevicePolicy({data:{
       sharedDeviceRequired:sharedRequired,managedDeviceRequiredForAssessments:managedAssessment,kioskIdleMinutes:idle}}))}>Save policy</button>
    </div>
   </section>
  </div>}
  <section className="mt-8" aria-label="Site inventory">
   <h2 className="font-serif text-xl font-semibold">Registered equipment</h2>
   <p className="mt-2 text-sm text-muted-foreground">Showing the 100 most recent records. A browser login is not proof of possession of any equipment listed here.</p>
   <div className="mt-4 overflow-x-auto border border-border bg-card">
    <table className="min-w-full text-left text-sm">
     <thead><tr className="border-b border-border bg-muted/30">
      {["Label","Category","Ownership","Managed","Status"].map(s=><th key={s} className="p-3 font-medium">{s}</th>)}
     </tr></thead>
     <tbody>{data.devices.map(device=><tr key={device.id} className="border-b border-border">
      <td className="p-3">{device.label}</td><td className="p-3">{device.deviceCategory}</td>
      <td className="p-3">{device.ownership}</td><td className="p-3">{device.managed?"Yes":"No"}</td>
      <td className="p-3">{data.writeAllowed?<select disabled={working} value={device.status}
       className="border border-border bg-background px-2 py-1"
       onChange={e=>void run(()=>changeSiteDeviceStatus({data:{id:device.id,status:e.target.value as typeof device.status}}))}>
       {["active","repair","retired","lost"].map(s=><option key={s} value={s}>{s}</option>)}
      </select>:device.status}</td>
     </tr>)}</tbody>
    </table>
    {data.devices.length===0&&<p className="p-5 text-sm text-muted-foreground">No devices registered for this Site yet.</p>}
   </div>
  </section>
 </WorkspaceShell>;
}
