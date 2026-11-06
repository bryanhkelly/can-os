import { useState } from "react";
import { readSitePhysicalAddress, siteAddressEditorDraft } from "@/domain/site-setup-configuration";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { LaunchSiteAddressDraft } from "./LaunchHostAndProviderFields";
import {LaunchSiteAddressFields} from "./LaunchSiteAddressFields";
import {useLaunchDraftChanges,useLaunchUnsavedChanges} from "@/components/launch-studio/useLaunchUnsavedChanges";


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
  const changes=useLaunchDraftChanges({address,reason});
  useLaunchUnsavedChanges(changes.dirty || (editing && busy));
  const complete=Boolean(address.street1.trim() && address.city.trim() &&
    address.state.trim() && address.postalCode.trim() && address.country.trim());
  return <div className="rounded-lg border p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-muted-foreground">School address</p>
      <Button type="button" size="sm" variant="outline"
        onClick={()=>setEditing(value=>!value)}>
        {editing?"Close editor":"Edit address"}
      </Button>
    </div>
    {!editing && <p className="mt-2 text-base font-semibold">
      {savedDraft.street1 ? [savedDraft.street1,savedDraft.city,savedDraft.state,savedDraft.postalCode,savedDraft.country].filter(Boolean).join(", ") :
        "No address saved yet"}
    </p>}
    {(savedStatus==="legacy_needs_review"||savedStatus==="invalid_needs_correction")&&
      <p role="alert" className="mt-2 text-sm text-destructive">
        Your saved address is incomplete or needs review. Edit it and save the full address so we can show the right state guidance.
      </p>}
    {editing && <div className="mt-3 space-y-3">
      <p className="text-sm text-muted-foreground">This is the address you supplied, not an independently verified location. If your school is already operating or published, ask CAN to coordinate an address change.</p>
      <LaunchSiteAddressFields address={address} onChange={setAddress}/>
      <Field label="Reason for changing this location" required>
        <Input value={reason} onChange={e=>setReason(e.target.value)}
          placeholder="E.g., corrected street address"/>
      </Field>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="button" disabled={busy || !complete || reason.trim().length<5}
        onClick={async()=>{
          setError("");
          try { await save(address,revision,reason); changes.markSaved({address,reason}); setEditing(false); }
          catch(e){setError(e instanceof Error?e.message:"Could not save Site address");}
        }}>Save updated location</Button>
    </div>}
  </div>;
}
