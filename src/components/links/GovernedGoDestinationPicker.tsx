import {useEffect,useState} from "react";
import {Input} from "@/components/ui/input";
import {Select} from "@/components/ui/select";
import {listAvailableGoDestinations} from "@/modules/engagement/site-go-links.functions";
import type {GoDestination} from "@/domain/site-go-links";

type GoChoice=Awaited<ReturnType<typeof listAvailableGoDestinations>>[number];
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
  const [choices,setChoices]=useState<GoChoice[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(false);
  const [retry,setRetry]=useState(0);

  useEffect(()=>{
    let live=true;
    setLoading(true);setError(false);
    listAvailableGoDestinations({data:{siteId,packageId,kind,term:search.trim()}})
      .then(items=>{
        if(!live)return;
        setChoices(items);setLoading(false);
      })
      .catch(()=>{
        if(!live)return;
        setChoices([]);setLoading(false);setError(true);
      });
    return ()=>{live=false;};
  },[siteId,packageId,kind,search,retry]);

  const selected=value?JSON.stringify(value):"";
  const current=choices.some(item=>JSON.stringify(item.destination)===selected);
  return <div className="grid gap-3 sm:grid-cols-2">
    <label className="grid gap-1 text-sm font-medium">Destination type
      <Select value={kind} disabled={disabled} onChange={event=>{
        setKind(event.target.value as Kind);setSearch("");onChange(null);
      }}>
        {Object.entries(kindLabels).map(([id,label])=><option key={id} value={id}>{label}</option>)}
      </Select>
    </label>
    <label className="grid gap-1 text-sm font-medium">Find a published destination
      <Input type="search" disabled={disabled} value={search} maxLength={90}
        onChange={event=>setSearch(event.target.value)} placeholder="Search available opportunities" />
    </label>
    <label className="grid gap-1 text-sm font-medium sm:col-span-2">Where should this link lead?
      <Select disabled={disabled||loading||error||choices.length===0}
        value={current?selected:""} onChange={event=>{
          const item=choices.find(option=>JSON.stringify(option.destination)===event.target.value);
          onChange(item?.destination??null);
        }}>
        <option value="">Choose an available destination</option>
        {choices.map(item=><option key={JSON.stringify(item.destination)}
          value={JSON.stringify(item.destination)}>{item.title}</option>)}
      </Select>
    </label>
    {loading&&<p className="text-sm text-muted-foreground sm:col-span-2" role="status">Checking available destinations…</p>}
    {!loading&&!error&&choices.length===0&&<p className="text-sm text-muted-foreground sm:col-span-2">
      No currently published opportunities match this selection.
    </p>}
    {error&&<div className="sm:col-span-2">
      <p className="text-sm text-destructive" role="alert">Destinations could not be loaded.</p>
      <button type="button" disabled={disabled} className="mt-2 text-sm underline" onClick={()=>setRetry(n=>n+1)}>Retry</button>
    </div>}
  </div>;
}
