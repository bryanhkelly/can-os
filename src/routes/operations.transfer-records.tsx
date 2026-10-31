import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { WorkspaceShell } from "@/components/workspace";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import {
  listTransferRecordsHandoffs,completeTransferRecordsHandoff,
} from "@/modules/enrollment/transfer-records-handoff.functions";

export const Route=createFileRoute("/operations/transfer-records")({
  loader:safeLoader(()=>listTransferRecordsHandoffs(),{
    authMessage:"Sign in as the authorized institutional records registrar.",
  }),
  component:TransferRecordsRoute,
});
type Items=Awaited<ReturnType<typeof listTransferRecordsHandoffs>>["items"];
type DeliveryMethod="approved_secure_exchange"|"verified_secure_portal"|"physical_mail"|"can_internal_school_records";

function TransferRecordsRoute(){
 const outcome=Route.useLoaderData();
 if(!outcome.ok)return <LoaderFailure eyebrow="CAN OS · Registrar"
   title="Academic records transfer" outcome={outcome}/>;
 return <TransferRecordsWorkspace items={outcome.data.items}/>;
}
function TransferRecordsWorkspace({items}:{items:Items}){
 const router=useRouter();
 const [busy,setBusy]=useState<string|null>(null);
 const [notice,setNotice]=useState(""),[error,setError]=useState("");
 const [selected,setSelected]=useState<Record<string,string>>({});
 const [methods,setMethods]=useState<Record<string,DeliveryMethod>>({});
 const [receipts,setReceipts]=useState<Record<string,string>>({});
 const [verified,setVerified]=useState<Record<string,boolean>>({});
 const [delivered,setDelivered]=useState<Record<string,boolean>>({});
 async function complete(item:Items[number]){
   const issuanceId=selected[item.id]??item.issuances[0]?.id;
   const internal=methods[item.id]==="can_internal_school_records";
   const receiptReference=internal?"CAN INTERNAL RECORDS":(receipts[item.id]??"").trim();
   if(!issuanceId||receiptReference.length<12||!verified[item.id]||!delivered[item.id]||busy)return;
   if(internal&&!item.destinationApplicationId)return;
   if(!window.confirm(internal
     ?"Release the selected official transcript INSIDE CAN OS to the exact linked receiving-school application under its signed guardian consent? The authorized receiving registrar will gain read-only access immediately."
     :"Confirm the named school's identity was independently verified and the selected official transcript was ACTUALLY transferred through an approved secure channel? This will record your signed institutional attestation."))return;
   setBusy(item.id);setError("");setNotice("");
   try{
     const result=await completeTransferRecordsHandoff({data:{
       handoffActionId:item.id,issuanceId,
       recipientSchoolName:item.destinationSchoolName,
       deliveryMethod:methods[item.id]??"approved_secure_exchange",
       receiptReference,confirmedRecipientVerified:true,confirmedSecureDelivery:true,
     }});
     setNotice(result.completed
       ?internal
         ?"Official transcript released inside CAN OS to the verified receiving school. Access is scoped and audited; the family was notified."
         :"The official transcript handoff was recorded with evidence. The family was notified."
       :"This handoff was already completed.");
     try{await router.invalidate();}
     catch{setError("The record was saved but the workspace did not refresh. Do not submit again.");}
   }catch(e){setError(e instanceof Error?e.message:"Could not verify the records handoff.");}
   finally{setBusy(null);}
 }
 return <WorkspaceShell eyebrow="CAN OS · Registrar" title="Transfer records coordination"
   subtitle="Issue official records through the credit issuer. Release securely within CAN to an authorized receiving school, or attest an externally completed secure transfer with delivery evidence."
   actions={<div className="flex flex-wrap gap-2">
     <Link to="/operations" className="rounded border px-3 py-2 text-sm">Operations</Link>
     <Link to="/admissions/transcripts" search={{query:""}} className="rounded border px-3 py-2 text-sm">Official transcripts</Link>
   </div>}>
   {notice&&<p role="status" className="mt-5 rounded-lg border p-4 text-sm">{notice}</p>}
   {error&&<p role="alert" className="mt-5 rounded-lg border border-red-500 p-4 text-sm">{error}</p>}
   <section className="mt-7 space-y-4">
    {items.map(item=><article key={item.id} className="rounded-xl border bg-card p-5">
      <h2 className="text-lg font-semibold">{item.studentName}</h2>
      <p className="mt-1 text-sm">Destination: <strong>{item.destinationSchoolName}</strong></p>
      {item.destinationContactEmail&&<p className="mt-1 text-sm">Destination records contact (verify independently): {item.destinationContactEmail}</p>}
      <p className="mt-2 text-sm">Guardian release authorization: {item.consentRecorded?"Recorded":"Missing or revoked — contact the family"}</p>
      {item.status==="resolved"?<p className="mt-3 rounded-lg border p-3 text-sm">Records handoff attested by the school. Issued transcript: {item.issuedTranscriptId??"Recorded in original request"}</p>:
      <div className="mt-4 space-y-4 border-t pt-4">
        <p className="text-sm">Issue an official transcript for this student before recording delivery. The registrar must hold the correct credit-issuer authority.</p>
        <Link to="/admissions/transcripts" search={{query:item.studentName}}
         className="text-sm font-semibold underline">Open official transcript issuance for {item.studentName}</Link>
        <label className="block text-sm font-medium">Previously issued official transcript
          <select className="mt-2 w-full rounded-lg border bg-background p-3"
            value={selected[item.id]??item.issuances[0]?.id??""}
            onChange={e=>setSelected(current=>({...current,[item.id]:e.target.value}))}>
            {!item.issuances.length&&<option value="">No authorized transcript issuances available</option>}
            {item.issuances.map(issuance=><option key={issuance.id} value={issuance.id}>
              Issued {new Date(issuance.issuedAt).toLocaleString()} · {issuance.id.slice(0,8)}
            </option>)}
          </select>
        </label>
        <label className="block text-sm font-medium">Actual records delivery method
          <select className="mt-2 w-full rounded-lg border bg-background p-3"
            value={methods[item.id]??"approved_secure_exchange"}
            onChange={e=>setMethods(current=>({...current,[item.id]:e.target.value as DeliveryMethod}))}>
            {item.destinationApplicationId&&<option value="can_internal_school_records">Release directly to verified CAN receiving school</option>}
            <option value="approved_secure_exchange">Approved secure records exchange</option>
            <option value="verified_secure_portal">Destination school's verified secure portal</option>
            <option value="physical_mail">Tracked physical mail</option>
          </select>
        </label>
        {methods[item.id]!=="can_internal_school_records"&&<label className="block text-sm font-medium">External delivery receipt, tracking or verified exchange reference
          <input required minLength={12} maxLength={400} value={receipts[item.id]??""}
            onChange={e=>setReceipts(current=>({...current,[item.id]:e.target.value}))}
            placeholder="Unique secure-exchange confirmation or mailing tracking reference"
            className="mt-2 w-full rounded-lg border bg-background p-3"/>
        </label>}
        {methods[item.id]==="can_internal_school_records"&&<p className="rounded-lg border p-3 text-sm">
          This is an immediate CAN-to-CAN release of the immutable, officially issued transcript.
          The receiving Program and guardian's specific release consent are verified in the
          same transaction. No external receipt or email attachment is used.
        </p>}
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1" checked={!!verified[item.id]}
            onChange={e=>setVerified(current=>({...current,[item.id]:e.target.checked}))}/>
          <span>{methods[item.id]==="can_internal_school_records"?
            "I confirm the linked receiving-school application is the intended CAN destination; CAN OS will independently verify current authorization and guardian consent.":
            "I independently verified the receiving school's identity and its authority to receive these records."}</span>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1" checked={!!delivered[item.id]}
            onChange={e=>setDelivered(current=>({...current,[item.id]:e.target.checked}))}/>
          <span>{methods[item.id]==="can_internal_school_records"?
            "I authorize CAN OS to release this exact official transcript electronically to the linked receiving-school registrar now.":
            "The exact official transcript selected above has actually been transferred through the indicated approved secure channel."}</span>
        </label>
        <button type="button" disabled={busy!==null||!item.consentRecorded||!item.issuances.length||
          (methods[item.id]!=="can_internal_school_records"&&(receipts[item.id]??"").trim().length<12)||
          !verified[item.id]||!delivered[item.id]}
          className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50"
          onClick={()=>void complete(item)}>
          {busy===item.id?"Saving handoff…":methods[item.id]==="can_internal_school_records"?
            "Release official transcript inside CAN":"Record verified secure records handoff"}
        </button>
      </div>}
    </article>)}
    {!items.length&&<p className="rounded-xl border p-5 text-sm text-muted-foreground">No authorized transfer records handoffs are currently recorded.</p>}
   </section>
 </WorkspaceShell>;
}
