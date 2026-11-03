import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { LaunchSiteAddressDraft } from "./LaunchHostAndProviderFields";

type AddressField = keyof LaunchSiteAddressDraft;
const fields: ReadonlyArray<readonly [AddressField,string]> = [
  ["street1","Street address"],["street2","Suite or building (optional)"],
  ["city","City"],["state","State or region"],
  ["postalCode","Postal code"],["country","Country"],["county","County (optional)"],
];

export function LaunchSiteAddressEditor({
  initial, revision, busy, save
}:{
  initial: Record<string,unknown>|null;
  revision:string;
  busy:boolean;
  save:(address:LaunchSiteAddressDraft,revision:string,reason:string)=>Promise<void>;
}){
  const [address,setAddress]=useState<LaunchSiteAddressDraft>({
    street1:String(initial?.street1??""),street2:String(initial?.street2??""),
    city:String(initial?.city??""),state:String(initial?.state??""),
    postalCode:String(initial?.postalCode??""),country:String(initial?.country??"US"),
    county:String(initial?.county??""),
  });
  const [reason,setReason]=useState("");
  const [editing,setEditing]=useState(false);
  const [error,setError]=useState("");
  const complete=Boolean(address.street1.trim() && address.city.trim() &&
    address.state.trim() && address.postalCode.trim() && address.country.trim());
  return <div className="rounded-lg border p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm font-semibold">Saved physical location</p>
      <Button type="button" size="sm" variant="outline"
        onClick={()=>setEditing(value=>!value)}>
        {editing?"Close editor":"Edit address"}
      </Button>
    </div>
    {!editing && <p className="mt-2 text-xs text-muted-foreground">
      {initial?.street1 ? [initial.street1,initial.city,initial.state,initial.postalCode].filter(Boolean).join(", ") :
        "Address not configured. Add the physical location for accurate setup guidance."}
    </p>}
    {editing && <div className="mt-3 space-y-3">
      <p className="text-xs text-muted-foreground">Changing a location may require independent jurisdiction review. An approved school or published Site needs a controlled amendment.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {fields.map(([key,label])=><Field key={key} label={label}>
          <Input value={address[key]} onChange={e=>setAddress({...address,[key]:e.target.value})}/>
        </Field>)}
      </div>
      <Field label="Reason for changing this location" required>
        <Input value={reason} onChange={e=>setReason(e.target.value)}
          placeholder="E.g., corrected street address"/>
      </Field>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="button" disabled={busy || !complete || reason.trim().length<5}
        onClick={async()=>{
          setError("");
          try { await save(address,revision,reason); setEditing(false); }
          catch(e){setError(e instanceof Error?e.message:"Could not save Site address");}
        }}>Save updated location</Button>
    </div>}
  </div>;
}
