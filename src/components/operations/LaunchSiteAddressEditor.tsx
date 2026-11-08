import { useState } from "react";
import { readSitePhysicalAddress, siteAddressEditorDraft, physicalSiteAddressSchema } from "@/domain/site-setup-configuration";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { LaunchSiteAddressDraft } from "./LaunchHostAndProviderFields";
import {LaunchSiteAddressFields} from "./LaunchSiteAddressFields";
import {useLaunchDraftChanges,useLaunchUnsavedChanges} from "@/components/launch-studio/useLaunchUnsavedChanges";


export function LaunchSiteAddressEditor({
  initial, revision, busy, save, published = false
}:{
  initial: Record<string,unknown>|null;
  revision:string;
  busy:boolean;
  published?:boolean;
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
  const addressValidation = physicalSiteAddressSchema.safeParse(address);
  const locationMismatch = address.country === "US" && address.postalCode.trim().startsWith("94513") && address.state !== "CA";
  const complete = addressValidation.success && !locationMismatch;
  return <div className="rounded-lg border p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-muted-foreground">School address</p>
      <Button type="button" size="sm" variant="outline"
        disabled={published}
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
    {published && <p role="status" className="mt-3 text-sm text-muted-foreground">This school website is already published. Changes to its physical location require a coordinated CAN amendment and independent review. The saved address has not changed.</p>}
    {editing && <div className="mt-3 space-y-3">
      <p className="text-sm text-muted-foreground">This is the address you supplied, not an independently verified location. If your school is already operating or published, ask CAN to coordinate an address change.</p>
      <LaunchSiteAddressFields address={address} onChange={setAddress}/>
      {!addressValidation.success && <p role="alert" className="text-sm text-destructive">{addressValidation.error.issues[0]?.message}</p>}
      {locationMismatch && <p role="alert" className="text-sm text-destructive">ZIP 94513 is in Brentwood, California. Select California or correct the ZIP code.</p>}
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
