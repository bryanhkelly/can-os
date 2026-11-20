import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/choice";
import { Button } from "@/components/ui/button";
import { DirectoryTable } from "@/components/workspace";
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
     <Label className="block text-sm">Device label<Input required minLength={2} maxLength={100} className="mt-1"
       value={label} onChange={event=>setLabel(event.target.value)} placeholder="Room A Chromebook 01"/></Label>
     <Label className="block text-sm">Category<Select className="mt-1"
       value={category} onChange={e=>setCategory(e.target.value as typeof category)}>
      {["desktop","laptop","tablet","phone","chromebook","other"].map(s=><option key={s} value={s}>{s}</option>)}
     </Select></Label>
     <Label className="block text-sm">Ownership<Select className="mt-1"
      value={ownership} onChange={e=>setOwnership(e.target.value as typeof ownership)}>
      {["site","organization","loaned","personal"].map(s=><option key={s} value={s}>{s}</option>)}
     </Select></Label>
     <Label className="flex items-center gap-2 text-sm"><Checkbox checked={managed} onChange={e=>setManaged(e.target.checked)}/>Managed by the Site</Label>
     <Button variant="outline" disabled={working} type="submit" >Add device</Button>
    </form>
   </section>
   <section className="border border-border bg-card p-5" aria-label="Site policy">
    <h2 className="font-serif text-xl font-semibold">Device policy</h2>
    <div className="mt-4 space-y-4">
     <Label className="flex items-center gap-2 text-sm"><Checkbox checked={sharedRequired} onChange={e=>setSharedRequired(e.target.checked)}/>Shared-device mode recommended for site computers</Label>
     <Label className="flex items-center gap-2 text-sm"><Checkbox checked={managedAssessment} onChange={e=>setManagedAssessment(e.target.checked)}/>Require managed devices for restricted assessments (policy record only)</Label>
     <Label className="block text-sm">Target kiosk idle lock (minutes)<Input type="number" min={1} max={30} value={idle} onChange={e=>setIdle(Number(e.target.value))} className="mt-1 w-24"/></Label>
     <Button variant="outline" type="button" disabled={working} 
      onClick={()=>void run(()=>updateSiteDevicePolicy({data:{
       sharedDeviceRequired:sharedRequired,managedDeviceRequiredForAssessments:managedAssessment,kioskIdleMinutes:idle}}))}>Save policy</Button>
    </div>
   </section>
  </div>}
  <section className="mt-8" aria-label="Site inventory">
   <h2 className="font-serif text-xl font-semibold">Registered equipment</h2>
   <p className="mt-2 text-sm text-muted-foreground">Showing the 100 most recent records. A browser login is not proof of possession of any equipment listed here.</p>
   <DirectoryTable label="Registered equipment" caption="Up to 100 most recent authorized Site records; not proof of device possession."
     rows={data.devices} rowKey={device=>device.id}
     empty={<p className="p-4 text-sm text-muted-foreground">No devices registered for this Site yet.</p>}
     columns={[
       {id:"label",title:"Label",render:device=>device.label},
       {id:"category",title:"Category",render:device=>device.deviceCategory},
       {id:"ownership",title:"Ownership",render:device=>device.ownership},
       {id:"managed",title:"Managed",render:device=>device.managed?"Yes":"No"},
       {id:"status",title:"Status",render:device=>data.writeAllowed?<Select disabled={working} value={device.status}
         className="min-w-0"
         onChange={e=>void run(()=>changeSiteDeviceStatus({data:{id:device.id,status:e.target.value as typeof device.status}}))}>
         {["active","repair","retired","lost"].map(s=><option key={s} value={s}>{s}</option>)}
       </Select>:device.status},
     ]}/>
  </section>
 </WorkspaceShell>;
}
