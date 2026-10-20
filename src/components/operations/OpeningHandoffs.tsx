import { useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import type { getSiteToday } from "@/modules/operations/site-today.functions";
import { acknowledgeLaunchHandoff,transferLaunchHandoff } from "@/modules/programs/opening-handoff.functions";

type Handoff = Awaited<ReturnType<typeof getSiteToday>>["openingHandoffs"][number];

export function OpeningHandoffs({ handoffs }: { handoffs: Handoff[] }) {
  return <section className="mt-7 rounded-xl border bg-card p-5">
    <h2 className="font-serif text-2xl">Opening handoff</h2>
    <p className="mt-2 text-sm text-muted-foreground">Opening and receipt are separate facts.
      Acknowledgment confirms the named operator received the handoff; it is not regulatory approval or a guarantee of ongoing readiness.</p>
    {!handoffs.length && <p className="mt-3 text-sm">No opening handoff is recorded for your visible programs.
      Programs opened before this workflow are not automatically marked acknowledged.</p>}
    <div className="mt-4 space-y-3">{handoffs.map(handoff => <HandoffCard key={handoff.id} handoff={handoff}/>)}</div>
  </section>;
}

function HandoffCard({ handoff }: { handoff: Handoff }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recipient,setRecipient]=useState("");
  const [reason,setReason]=useState("");
  const [transferConfirmed,setTransferConfirmed]=useState(false);
  const [transferRequestId,setTransferRequestId]=useState<string|null>(null);
  return <article className="rounded-lg border p-4">
    <h3 className="font-semibold">{handoff.title}</h3>
    <p className="mt-2 text-sm">Receiving operator: {handoff.firstName} {handoff.lastName}</p>
    <p className="mt-1 text-sm">{handoff.status === "resolved" ? "Acknowledged" : "Awaiting named operator acknowledgment"}
      {" · Opened "}{new Date(handoff.openedAt).toLocaleString()}</p>
    <p className="mt-1 text-sm">{handoff.sectionCountAtOpening} sections in the opening record.
      Linked workspaces show current operational records, not a historical readiness guarantee.</p>
    {handoff.resolvedAt && <p className="mt-2 text-sm">Acknowledged at {new Date(handoff.resolvedAt).toLocaleString()}: {handoff.resolutionNote}</p>}
    {handoff.lastTransfer&&<p className="mt-2 text-sm">Responsibility transferred at {new Date(handoff.lastTransfer.transferredAt).toLocaleString()}: {handoff.lastTransfer.reason}</p>}
    {handoff.status==="open"&&!handoff.recipientEligible&&<p role="alert" className="mt-3 text-sm">
      The named recipient is no longer eligible. An explicitly granted opening-handoff manager must select a replacement.</p>}
    {handoff.replacementOperators.length>0&&<form className="mt-4 space-y-3" onSubmit={async event=>{
      event.preventDefault();setBusy(true);setError("");
      const requestId=transferRequestId??crypto.randomUUID();setTransferRequestId(requestId);
      try{
        await transferLaunchHandoff({data:{actionId:handoff.id,expectedRevision:handoff.revision,
          requestId,recipientPersonId:recipient,reason,confirmed:true}});
        await router.invalidate();setTransferRequestId(null);setTransferConfirmed(false);
      }catch(failure){setError(failure instanceof Error?failure.message:"Unable to transfer opening handoff");}
      finally{setBusy(false);}
    }}>
      <h4 className="font-semibold">Recover pending handoff</h4>
      <label className="block text-sm">Replacement site operator
        <select required value={recipient} onChange={event=>{setRecipient(event.target.value);setTransferRequestId(null);}}
          className="mt-1 block rounded border bg-background p-2">
          <option value="">Select a replacement</option>
          {handoff.replacementOperators.map(operator=><option key={operator.personId} value={operator.personId}>
            {operator.firstName} {operator.lastName}</option>)}
        </select>
      </label>
      <label className="block text-sm">Reason for recovery
        <textarea required minLength={10} maxLength={2000} value={reason}
          onChange={event=>{setReason(event.target.value);setTransferRequestId(null);}}
          className="mt-1 block w-full rounded border bg-background p-2"/>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={transferConfirmed} onChange={event=>setTransferConfirmed(event.target.checked)}/>
        I confirm the previous recipient is no longer eligible and the replacement must independently acknowledge receipt.
      </label>
      <button type="submit" disabled={busy||!recipient||reason.trim().length<10||!transferConfirmed}
        className="rounded border px-3 py-2 text-sm disabled:opacity-50">Transfer pending handoff</button>
    </form>}
    {handoff.programId && handoff.siteId && <div className="mt-3 flex flex-wrap gap-3 text-sm">
      <Link to="/operations/launch/$programId" params={{ programId: handoff.programId }} className="underline">Review classes and staffing</Link>
      <Link to="/operations/school-years" search={{ siteId: handoff.siteId, programId: handoff.programId }} className="underline">Review school year</Link>
      <Link to="/operations" search={{ siteId: handoff.siteId, programId: handoff.programId }} className="underline">Program operations</Link>
    </div>}
    {handoff.canAcknowledge ? <form className="mt-4 space-y-3" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError("");
      try {
        await acknowledgeLaunchHandoff({ data: { actionId: handoff.id, note, confirmed: true } });
        await router.invalidate();
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : "Unable to acknowledge opening handoff");
      } finally { setBusy(false); }
    }}>
      <label className="block text-sm">Acknowledgment note
        <textarea required minLength={10} maxLength={2000} value={note} onChange={event => setNote(event.target.value)}
          className="mt-1 block w-full rounded border bg-background p-2"/>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/>
        I reviewed the opening record, school-year setup and classes, and received responsibility for daily operations.
      </label>
      <button type="submit" disabled={busy || !confirmed || note.trim().length < 10}
        className="rounded border px-3 py-2 text-sm disabled:opacity-50">Acknowledge receipt</button>
    </form> : handoff.status !== "resolved" && <p className="mt-3 text-sm text-muted-foreground">
      Only the named recipient with a current site operator grant can acknowledge this handoff.</p>}
    {error && <p role="alert" className="mt-3 text-sm">{error}</p>}
  </article>;
}
