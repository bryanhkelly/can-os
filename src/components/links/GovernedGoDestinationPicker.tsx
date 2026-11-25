import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import {useState} from "react";
import {GoDestinationChoiceField} from "./GoDestinationChoiceField";
import {useGoDestinationChoices} from "@/hooks/use-go-destination-choices";
import {Input} from "@/components/ui/input";
import {Select} from "@/components/ui/select";
import {listAvailableGoDestinations} from "@/modules/engagement/site-go-links.functions";
import type {GoDestination} from "@/domain/site-go-links";

type Kind=GoDestination["kind"];
const kindLabels:Record<Exclude<Kind,"website-preview">,string>={
  "site-page":"Published Site page",
  "information":"Information or inquiry",
  "adult-training":"Published adult training",
  "class":"Published Class",
  "enrichment":"Open enrichment registration",
};

/** One public destination chooser; no arbitrary UUID or unapproved draft target.
 * The server still rechecks publication at publish time AND at /go resolution.
 */
export function GovernedGoDestinationPicker({
  siteId,packageId,value,onChange,disabled=false,
}:{
  siteId:string;packageId?:string;
  value:GoDestination|null;onChange:(value:GoDestination|null)=>void;
  disabled?:boolean;
}){
  const [kind,setKind]=useState<Kind>("information");
  const [search,setSearch]=useState("");
  const {choices,loading,error,retry}=useGoDestinationChoices(
    ["site",siteId,packageId??null,kind,search.trim()],
    ()=>listAvailableGoDestinations({data:{siteId,packageId,kind,term:search.trim()}}),
  );
  return <div className="grid gap-3 sm:grid-cols-2">
    <Field label="Destination type"><Select value={kind} disabled={disabled} onChange={event=>{
        setKind(event.target.value as Kind);setSearch("");onChange(null);
      }}>
        {Object.entries(kindLabels).map(([id,label])=><option key={id} value={id}>{label}</option>)}
      </Select></Field>
    <Field label="Find a published destination"><Input type="search" disabled={disabled} value={search} maxLength={90}
        onChange={event=>{setSearch(event.target.value);onChange(null);}} placeholder="Search available opportunities" /></Field>
    <GoDestinationChoiceField className="sm:col-span-2" choices={choices} value={value} onChange={onChange} disabled={disabled||loading||error}/>
    {loading&&<p className="text-sm text-muted-foreground sm:col-span-2" role="status">Checking available destinations…</p>}
    {!loading&&!error&&choices.length===0&&<p className="text-sm text-muted-foreground sm:col-span-2">
      No currently published opportunities match this selection.
    </p>}
    {error&&<div className="sm:col-span-2">
      <p className="text-sm text-destructive" role="alert">Destinations could not be loaded.</p>
      <Button type="button" variant="outline" size="sm" disabled={disabled} className="mt-2" onClick={()=>{onChange(null);retry();}}>Retry</Button>
    </div>}
  </div>;
}
