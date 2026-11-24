import {useEffect,useState} from "react";
import {Select} from "@/components/ui/select";
import {Input} from "@/components/ui/input";
import {listOwnerEngagementDestinations} from "@/modules/engagement/engagement-registry.functions";
import type {EngagementOwner} from "@/domain/engagement-definition";
import type {GoDestination} from "@/domain/site-go-links";
export type OwnerEngagementSurface={owner:Extract<EngagementOwner,{kind:"platform"|"organization"}>;sites:readonly {id:string;name:string}[]};
/** Governed pilot destinations for platform and HQ ownership, without inventing
 * local Site ownership or an affiliate's right to distribute an Offering. */
export function OwnerEngagementDestinationPicker({surface,value,onChange,disabled}:{
  surface:OwnerEngagementSurface;value:GoDestination|null;onChange:(value:GoDestination|null)=>void;disabled:boolean;
}){
  const [kind,setKind]=useState<"information"|"adult-training">("information");
  const [siteId,setSiteId]=useState("");
  const [term,setTerm]=useState("");
  const [choices,setChoices]=useState<Awaited<ReturnType<typeof listOwnerEngagementDestinations>>>([]);
  const [error,setError]=useState(false);
  const [loading,setLoading]=useState(true);
  const ownerId=surface.owner.kind==="organization"?surface.owner.organizationId:null;
  useEffect(()=>{let active=true;setLoading(true);setError(false);setChoices([]);
    listOwnerEngagementDestinations({data:{owner:surface.owner,kind,siteId:siteId||undefined,term:term.trim()}})
      .then(rows=>{if(active){setChoices(rows);setLoading(false);}})
      .catch(()=>{if(active){setError(true);setLoading(false);}});
    return()=>{active=false;};
  },[surface.owner.kind,ownerId,kind,siteId,term]);
  return <div className="grid gap-3 sm:grid-cols-2">
    <label className="grid gap-1 text-sm font-medium">Destination type<Select value={kind} disabled={disabled} onChange={e=>{setKind(e.target.value as typeof kind);onChange(null);}}><option value="information">Information or inquiry</option><option value="adult-training">Published adult training</option></Select></label>
    {kind==="adult-training"&&<label className="grid gap-1 text-sm font-medium">Delivery Site<Select value={siteId} disabled={disabled} onChange={e=>{setSiteId(e.target.value);onChange(null);}}><option value="">Choose a delivery Site</option>{surface.sites.map(site=><option value={site.id} key={site.id}>{site.name}</option>)}</Select></label>}
    <label className="grid gap-1 text-sm font-medium">Search eligible destinations<Input value={term} maxLength={90} disabled={disabled} onChange={e=>{setTerm(e.target.value);onChange(null);}}/></label>
    <label className="grid gap-1 text-sm font-medium sm:col-span-2">Where should this link lead?<Select disabled={disabled||loading||error||!choices.length} value={value?JSON.stringify(value):""} onChange={e=>onChange(choices.find(choice=>JSON.stringify(choice.destination)===e.target.value)?.destination??null)}><option value="">Choose an available destination</option>{choices.map(choice=><option key={JSON.stringify(choice.destination)} value={JSON.stringify(choice.destination)}>{choice.title}</option>)}</Select></label>
    {loading&&<p role="status" className="text-sm">Checking eligible destinations…</p>}
    {error&&<p role="alert" className="text-sm text-destructive">Could not verify destination authority.</p>}
    {!loading&&!error&&!choices.length&&<p className="text-sm text-muted-foreground">No eligible published destinations match. Draft training is not enrollable.</p>}
  </div>;
}
