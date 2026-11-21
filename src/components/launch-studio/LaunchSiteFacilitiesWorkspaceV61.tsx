import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { WorkspacePanel, WorkspaceNotice } from "@/components/workspace";
import {
  createLaunchSiteSpaceV61, readLaunchSiteFacilitiesV61, saveLaunchSiteSpaceV61,
} from "@/modules/operations/launch-site-facilities.functions";
import {
  createSiteSpaceV61Schema, saveSiteSpaceV61Schema, siteSpacePlanningResourcesV61Schema,
  type SiteSpacePlanningResourcesV61,
} from "@/domain/launch-facilities-v61";
import { useLaunchUnsavedChanges } from "./useLaunchUnsavedChanges";

type Space = Awaited<ReturnType<typeof readLaunchSiteFacilitiesV61>>["spaces"][number];
type Draft = {name:string;maxOccupancy:number|null;resources:SiteSpacePlanningResourcesV61};
const emptyDraft=():Draft=>({
  name:"",maxOccupancy:null,
  resources:siteSpacePlanningResourcesV61Schema.parse({}),
});
const yesNo = (value:boolean|null)=>value===null?"unknown":value?"yes":"no";
const toBool = (raw:string)=>raw==="unknown"?null:raw==="yes";
const toNumber = (raw:string)=>raw.trim()?Number(raw):null;

function ResourceEditor({value,onChange,disabled}:{
  value:SiteSpacePlanningResourcesV61;
  onChange:(next:SiteSpacePlanningResourcesV61)=>void;
  disabled:boolean;
}){
  const update=<K extends keyof SiteSpacePlanningResourcesV61>(
    field:K,updated:SiteSpacePlanningResourcesV61[K],
  )=>onChange({...value,[field]:updated});
  return <div className="space-y-5">
    <div className="grid gap-3 border-t pt-4 sm:grid-cols-2">
      <h4 className="font-semibold sm:col-span-2">Connectivity</h4>
      <Label className="space-y-2">Internet available
        <Select value={yesNo(value.connectivity.internetAvailable)}
          disabled={disabled} onChange={e=>update("connectivity",{
            ...value.connectivity,internetAvailable:toBool(e.target.value),
          })}>
          <option value="unknown">Not confirmed</option>
          <option value="yes">Available</option>
          <option value="no">Not available</option>
        </Select>
      </Label>
      <Label className="space-y-2">Wi-Fi available
        <Select value={yesNo(value.connectivity.wifiAvailable)}
          disabled={disabled} onChange={e=>update("connectivity",{
            ...value.connectivity,wifiAvailable:toBool(e.target.value),
          })}>
          <option value="unknown">Not confirmed</option>
          <option value="yes">Available</option>
          <option value="no">Not available</option>
        </Select>
      </Label>
      <Label className="space-y-2">Estimated download speed (Mbps)
        <Input type="number" min={0} max={100000} step="any"
          disabled={disabled} value={value.connectivity.downloadMbps??""}
          onChange={e=>update("connectivity",{
            ...value.connectivity,downloadMbps:toNumber(e.target.value),
          })}/>
      </Label>
      <Label className="space-y-2">Connectivity notes
        <Input maxLength={1000} value={value.connectivity.notes}
          disabled={disabled} onChange={e=>update("connectivity",{
            ...value.connectivity,notes:e.target.value,
          })}/>
      </Label>
    </div>
    <div className="border-t pt-4">
      <h4 className="font-semibold">Devices available for participants</h4>
      <p className="mt-1 text-xs text-muted-foreground">
        Record device type and quantity, not private device identifiers.
        Counts are self-reported; managed device registration is separate.
      </p>
      <div className="mt-3 space-y-2">
        {value.devices.map((device,index)=><div key={index}
          className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_auto]">
          <Label className="space-y-1">Device category
            <Input disabled={disabled} maxLength={64} value={device.category}
              placeholder="Laptop, tablet, Chromebook…"
              onChange={e=>update("devices",value.devices.map((d,i)=>
                i===index?{...d,category:e.target.value}:d))}/>
          </Label>
          <Label className="space-y-1">Quantity
            <Input type="number" min={0} max={10000} disabled={disabled}
              value={device.quantity} onChange={e=>update("devices",
                value.devices.map((d,i)=>i===index?{
                  ...d,quantity:Number(e.target.value),
                }:d))}/>
          </Label>
          <Button type="button" size="sm" variant="outline"
            className="self-end" disabled={disabled}
            onClick={()=>update("devices",value.devices.filter((_,i)=>i!==index))}>
            Remove
          </Button>
        </div>)}
        <Button type="button" variant="outline" size="sm"
          disabled={disabled||value.devices.length>=30}
          onClick={()=>update("devices",[...value.devices,{category:"",quantity:0}])}>
          Add device category
        </Button>
      </div>
    </div>
    <div className="grid gap-3 border-t pt-4 sm:grid-cols-2">
      <h4 className="font-semibold sm:col-span-2">Accessibility</h4>
      <Label className="space-y-2">Step-free access
        <Select value={yesNo(value.accessibility.stepFreeAccess)}
          disabled={disabled} onChange={e=>update("accessibility",{
            ...value.accessibility,stepFreeAccess:toBool(e.target.value),
          })}>
          <option value="unknown">Not confirmed</option>
          <option value="yes">Reported available</option>
          <option value="no">Not available</option>
        </Select>
      </Label>
      <Label className="space-y-2">Accessible restroom
        <Select value={yesNo(value.accessibility.accessibleRestroom)}
          disabled={disabled} onChange={e=>update("accessibility",{
            ...value.accessibility,accessibleRestroom:toBool(e.target.value),
          })}>
          <option value="unknown">Not confirmed</option>
          <option value="yes">Reported available</option>
          <option value="no">Not available</option>
        </Select>
      </Label>
      <Label className="space-y-2 sm:col-span-2">Accessibility and accommodation notes
        <Textarea rows={2} maxLength={1000}
          disabled={disabled} value={value.accessibility.notes}
          onChange={e=>update("accessibility",{
            ...value.accessibility,notes:e.target.value,
          })}/>
      </Label>
    </div>
    <div className="grid gap-3 border-t pt-4">
      <h4 className="font-semibold">Specialized equipment & resources</h4>
      <Label className="space-y-2">Equipment present (one item per line)
        <Textarea rows={4} disabled={disabled}
          placeholder="Projector\nAssistive listening device\nLab workstations"
          value={value.equipment.join("\n")}
          onChange={e=>update("equipment",
            e.target.value.split("\n").map(v=>v.trim()).filter(Boolean))}/>
      </Label>
      <Label className="space-y-2">Other room resources and limitations
        <Textarea rows={3} maxLength={2000} disabled={disabled}
          value={value.notes} onChange={e=>update("notes",e.target.value)}/>
      </Label>
    </div>
  </div>;
}

function SpaceForm({siteId,space,onSaved}:{
  siteId:string;space?:Space;onSaved:()=>Promise<unknown>;
}){
  const [spaceId,setSpaceId]=useState(()=>space?.id??crypto.randomUUID());
  const [draft,setDraft]=useState<Draft>(()=>space?{
    name:space.name,maxOccupancy:space.maxOccupancy,resources:space.resources,
  }:emptyDraft());
  const original=space?JSON.stringify({
    name:space.name,maxOccupancy:space.maxOccupancy,resources:space.resources,
  }):JSON.stringify(emptyDraft());
  const dirty=JSON.stringify(draft)!==original;
  const [busy,setBusy]=useState(false);
  const [uncertain,setUncertain]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  useLaunchUnsavedChanges(dirty||busy||uncertain,
    "Leave Facilities & Resources? Room and equipment changes are not saved.");
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(busy||uncertain)return;
    const input={siteId,spaceId,name:draft.name,
      maxOccupancy:draft.maxOccupancy,resources:draft.resources};
    const parsed=space?saveSiteSpaceV61Schema.safeParse({
      ...input,expectedRevision:space.revision,
      reason:"Updated physical room preparation and resources",
    }):createSiteSpaceV61Schema.safeParse(input);
    if(!parsed.success){
      setError(parsed.error.issues[0]?.message??"Complete the room details.");
      return;
    }
    setError("");setSuccess("");setBusy(true);
    try{
      if(space){
        await saveLaunchSiteSpaceV61({data:{
          ...input,expectedRevision:space.revision,
          reason:"Updated physical room preparation and resources",
        }});
      }else await createLaunchSiteSpaceV61({data:input});
      await onSaved();
      if(!space){
        setDraft(emptyDraft());setSpaceId(crypto.randomUUID());
      }
      setSuccess("Room details saved. Verification and approval remain separate.");
    }catch{
      // A network failure may occur after commit; do not replay the write.
      setUncertain(true);
      setError("Save outcome requires reconciliation. Reload this Site's rooms before submitting again.");
    }finally{setBusy(false);}
  }
  return <form onSubmit={e=>void submit(e)} className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2">
      <Label className="space-y-2">Room or space name
        <Input minLength={2} maxLength={120} required disabled={busy||uncertain}
          value={draft.name}
          onChange={e=>setDraft(d=>({...d,name:e.target.value}))}/>
      </Label>
      <Label className="space-y-2">Maximum planned occupancy
        <Input type="number" min={1} max={1000} disabled={busy||uncertain}
          value={draft.maxOccupancy??""} placeholder="Not measured yet"
          onChange={e=>setDraft(d=>({...d,maxOccupancy:toNumber(e.target.value)}))}/>
      </Label>
    </div>
    <ResourceEditor value={draft.resources}
      disabled={busy||uncertain}
      onChange={resources=>setDraft(d=>({...d,resources}))}/>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {success && <p role="status" className="text-sm text-muted-foreground">{success}</p>}
    <div className="flex flex-wrap gap-3">
      <Button type="submit" disabled={busy||uncertain||!dirty}>
        {busy?"Saving…":space?"Save room changes":"Add physical room"}
      </Button>
      {uncertain && <Button type="button" variant="outline" onClick={()=>{
        void onSaved().then(()=>setUncertain(false))
          .catch(()=>setError("Could not reload. Try again without resubmitting."));
      }}>Reload saved rooms</Button>}
    </div>
  </form>;
}

/** The actual public.site_spaces inventory is shared with qualification.
 * No Section, room_coverage_schedule or duplicate Site profile is created. */
export function LaunchSiteFacilitiesWorkspaceV61({siteId}: {siteId:string}){
  const query=useQuery({
    queryKey:["launch-v61-site-spaces",siteId],
    queryFn:()=>readLaunchSiteFacilitiesV61({data:{siteId}}),
    retry:false,
  });
  const [adding,setAdding]=useState(false);
  const refresh=async()=>{await query.refetch({throwOnError:true});};
  return <WorkspacePanel title="Physical spaces, capacity & equipment"
    description="Tell us about your rooms, spaces, equipment, and accessibility. Any required inspections or approvals happen separately.">
    {query.isPending && <p role="status" className="mt-3">Loading physical spaces…</p>}
    {query.isError && <div role="alert" className="mt-3 space-y-2">
      <p>We couldn't load your saved rooms. Try again before changing your plan.</p>
      <Button variant="outline" onClick={()=>void query.refetch()}>Retry</Button>
    </div>}
    {query.data && query.data.siteId!==siteId && <p role="alert">These rooms belong to a different site. Reload before continuing.</p>}
    {query.data?.siteId===siteId && <>
      {query.data.spaces.length===0 && <p className="mt-3 text-sm text-muted-foreground">
        No physical spaces are registered at this Site.
      </p>}
      <div className="mt-4 space-y-3">
        {query.data.spaces.map(space=><details key={space.id+":"+space.revision}
          className="border bg-background p-4">
          <summary className="cursor-pointer text-sm font-semibold">
            {space.name} · Capacity {space.maxOccupancy??"not recorded"} · Edit details
          </summary>
          <div className="mt-4 border-t pt-4">
            <SpaceForm key={space.id+":"+space.revision}
              siteId={siteId} space={space} onSaved={refresh}/>
          </div>
        </details>)}
      </div>
      <Button type="button" variant="outline" className="mt-4"
        onClick={()=>setAdding(x=>!x)}>{adding?"Close new room":"Add room"}</Button>
      {adding && <div className="mt-4 border-t pt-4">
        <SpaceForm siteId={siteId} onSaved={refresh}/>
      </div>}
    </>}
    <WorkspaceNotice tone="info">
      Device counts, connectivity, equipment and accessibility answers are
      self-reported planning data. The existing Site Space verification and
      equipment-custody workflows independently determine official readiness.
    </WorkspaceNotice>
  </WorkspacePanel>;
}
