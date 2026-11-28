import {useEffect,useState} from "react";
import {Button} from "@/components/ui/button";
import {Select} from "@/components/ui/select";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {Checkbox} from "@/components/ui/choice";
import {Field} from "@/components/ui/field";
import {WorkspacePanel,WorkspaceNotice,ActionFooter} from "@/components/workspace";
import {readSenderAdministration,changeSenderAdministration,revokeSenderAdministration,listSenderOrganizations} from "@/modules/communication/sender-registry.functions";

export function PlatformCommunicationSettings(){
 const [organizationId,setOrganizationId]=useState("");
 const [organizations,setOrganizations]=useState<{id:string;name:string}[]>([]);
 useEffect(()=>{let active=true;listSenderOrganizations().then(value=>{if(active)setOrganizations(value);}).catch(()=>{if(active)setError("Organization directory unavailable.");});return()=>{active=false;};},[]);
 const [id,setId]=useState<string|null>(null);
 const [from,setFrom]=useState(""),[address,setAddress]=useState(""),[reference,setReference]=useState("");
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[confirmed,setConfirmed]=useState(false);
 const [revokeConfirmed,setRevokeConfirmed]=useState(false);
 const [notice,setNotice]=useState(""),[error,setError]=useState(""),[revision,setRevision]=useState(0);
 useEffect(()=>{
  let active=true;setReady(false);setConfirmed(false);setRevokeConfirmed(false);setError("");
  readSenderAdministration({data:{organizationId:organizationId||null}}).then(value=>{if(active){setId(value?.id??null);setFrom(value?.sender_from??"");setAddress(value?.postal_address??"");setReference(value?.verification_reference??"");setReady(true);}}).catch(()=>{if(active)setError("Sender registry unavailable. Confirm migration and platform owner access.");});
  return()=>{active=false;};
 },[revision,organizationId]);
 async function save(){
  if(!ready||busy||!confirmed)return;
  setBusy(true);setNotice("");setError("");
  try{await changeSenderAdministration({data:{organizationId:organizationId||null,from,address,reference,expectedId:id,confirmed:true}});setNotice("Campaign sender approval recorded.");setRevision(v=>v+1);}
  catch{setError("Sender approval was not confirmed. Refresh before retrying.");setReady(false);}
  finally{setBusy(false);setConfirmed(false);}
 }
 async function revoke(){
  if(!ready||busy||!id||!revokeConfirmed)return;
  setBusy(true);setNotice("");setError("");
  try{await revokeSenderAdministration({data:{organizationId:organizationId||null,expectedId:id,confirmed:true}});setNotice("Campaign sender revoked. New delivery attempts are blocked; in-flight messages may still arrive.");setRevision(v=>v+1);}
  catch{setError("Sender revocation was not confirmed. Refresh before retrying.");setReady(false);}
  finally{setBusy(false);setRevokeConfirmed(false);}
 }
 return <WorkspacePanel title="Communication settings" headingLevel="h2" className="mt-6">
  <div className="space-y-4">
   <p className="text-sm text-muted-foreground">Approve a Resend-verified campaign sender. Provider credentials remain in deployment secrets. Changing an approved sender may prevent older queued campaigns from sending.</p>
   <Field label="Sender scope"><Select value={organizationId} disabled={busy} onChange={e=>{setReady(false);setId(null);setConfirmed(false);setRevokeConfirmed(false);setNotice("");setOrganizationId(e.target.value);}}><option value="">Platform default</option>{organizations.map(org=><option key={org.id} value={org.id}>{org.name}</option>)}</Select></Field>
   <Field label="Sender email"><Input type="email" value={from} disabled={!ready||busy} onChange={e=>{setFrom(e.target.value);setConfirmed(false);}}/></Field>
   <Field label="Postal address"><Textarea value={address} maxLength={500} disabled={!ready||busy} onChange={e=>{setAddress(e.target.value);setConfirmed(false);}}/></Field>
   <Field label="Verification evidence reference"><Input value={reference} maxLength={500} disabled={!ready||busy} onChange={e=>{setReference(e.target.value);setConfirmed(false);}}/></Field>
   <label className="flex items-start gap-2 text-sm"><Checkbox checked={confirmed} disabled={!ready||busy} onChange={e=>setConfirmed(e.target.checked)}/>I verified this sender in Resend and authorize its use for platform campaigns.</label>
   <ActionFooter layout="inline"><Button type="button" variant="outline" disabled={busy} onClick={()=>setRevision(v=>v+1)}>Refresh</Button><Button type="button" disabled={!ready||busy||!confirmed||!from.trim()||!address.trim()||reference.trim().length<5} loading={busy} onClick={()=>void save()}>Approve sender</Button></ActionFooter>
   {id&&<div className="space-y-3 border-t border-border pt-4">
    <label className="flex items-start gap-2 text-sm"><Checkbox checked={revokeConfirmed} disabled={!ready||busy} onChange={e=>setRevokeConfirmed(e.target.checked)}/>Revoke the current campaign sender and block new campaign delivery attempts.</label>
    <Button type="button" variant="outline" disabled={!ready||busy||!revokeConfirmed} onClick={()=>void revoke()}>Revoke sender</Button>
   </div>}
   {notice&&<WorkspaceNotice tone="success">{notice}</WorkspaceNotice>}
   {error&&<WorkspaceNotice tone="danger">{error}</WorkspaceNotice>}
  </div>
 </WorkspacePanel>;
}
