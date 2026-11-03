import { useState } from "react";
import { readSitePhysicalAddress, siteAddressEditorDraft } from "@/domain/site-setup-configuration";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { LaunchSiteAddressDraft } from "./LaunchHostAndProviderFields";
import {LaunchSiteAddressFields} from "./LaunchSiteAddressFields";


export function LaunchSiteAddressEditor({
  initial, revision, busy, save
}:{
  initial: Record<string,unknown>|null;
  revision:string;
  busy:boolean;
  save:(address:LaunchSiteAddressDraft,revision:string,reason:string)=>Promise<void>;
}){
  const savedStatus=readSitePhysicalAddress(initial).status;
  const savedDraft=siteAddressEditorDraft(initial);
  const [address,setAddress]=useState<LaunchSiteAddressDraft>(()=>siteAddressEditorDraft(initial));
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
      {savedDraft.street1 ? [savedDraft.street1,savedDraft.city,savedDraft.state,savedDraft.postalCode,savedDraft.country].filter(Boolean).join(", ") :
        "Address not configured. Add the physical location for accurate setup guidance."}
    </p>}
    {(savedStatus==="legacy_needs_review"||savedStatus==="invalid_needs_correction")&&
      <p role="alert" className="mt-2 text-sm text-amber-800 dark:text-amber-200">
        This location was saved in an older or incomplete format. Review and save the full physical address before relying on state guidance; independent legal review has not been established.
      </p>}
    {editing && <div className="mt-3 space-y-3">
      <p className="text-xs text-muted-foreground">This location is church-provided, not independently verified. Changing an operating or published school's location requires a CAN-coordinated amendment; direct edits are blocked.</p>
      <LaunchSiteAddressFields address={address} onChange={setAddress}/>
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
