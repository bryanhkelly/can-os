import { Field } from "@/components/ui/field";
import {useState} from "react";
import {Button} from "@/components/ui/button";
import {GoDestinationChoiceField} from "./GoDestinationChoiceField";
import {useGoDestinationChoices} from "@/hooks/use-go-destination-choices";
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
  const ownerId=surface.owner.kind==="organization"?surface.owner.organizationId:null;
  const {choices,loading,error,retry}=useGoDestinationChoices(
    ["owner",surface.owner.kind,ownerId,kind,siteId||null,term.trim()],
    ()=>listOwnerEngagementDestinations({data:{owner:surface.owner,kind,siteId:siteId||undefined,term:term.trim()}}),
  );
  return <div className="grid gap-3 sm:grid-cols-2">
    <Field label="Destination type"><Select value={kind} disabled={disabled} onChange={e=>{setKind(e.target.value as typeof kind);onChange(null);}}><option value="information">Information or inquiry</option><option value="adult-training">Published adult training</option></Select></Field>
    {kind==="adult-training"&&<Field label="Delivery Site"><Select value={siteId} disabled={disabled} onChange={e=>{setSiteId(e.target.value);onChange(null);}}><option value="">Choose a delivery Site</option>{surface.sites.map(site=><option value={site.id} key={site.id}>{site.name}</option>)}</Select></Field>}
    <Field label="Search eligible destinations"><Input value={term} maxLength={90} disabled={disabled} onChange={e=>{setTerm(e.target.value);onChange(null);}}/></Field>
    <GoDestinationChoiceField className="sm:col-span-2" choices={choices} value={value} onChange={onChange} disabled={disabled||loading||error}/>
    {loading&&<p role="status" className="text-sm">Checking eligible destinations…</p>}
    {error&&<div className="sm:col-span-2"><p role="alert" className="text-sm text-destructive">Could not verify destination authority.</p><Button type="button" variant="outline" size="sm" disabled={disabled} className="mt-2" onClick={()=>{onChange(null);retry();}}>Retry</Button></div>}
    {!loading&&!error&&!choices.length&&<p className="text-sm text-muted-foreground">No eligible published destinations match. Draft training is not enrollable.</p>}
  </div>;
}
