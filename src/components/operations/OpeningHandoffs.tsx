import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Link, useRouter } from "@tanstack/react-router";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import { useHydrated } from "@/lib/use-hydrated";
import type { getSiteToday } from "@/modules/operations/site-today.functions";
import { acknowledgeLaunchHandoff,transferLaunchHandoff } from "@/modules/programs/opening-handoff.functions";

type Handoff = Awaited<ReturnType<typeof getSiteToday>>["openingHandoffs"][number];

export function OpeningHandoffs({ handoffs }: { handoffs: Handoff[] }) {
  return <section id="opening-handoffs" className="mt-7 rounded-xl border bg-card p-5">
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
  const mutation = useMutationFeedback(() => router.invalidate());
  const busy = mutation.pending || mutation.refreshFailed;
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [recipient,setRecipient]=useState("");
  const [reason,setReason]=useState("");
  const [transferConfirmed,setTransferConfirmed]=useState(false);
  const transferRequestId=useRef<string|null>(null);
  const hydrated=useHydrated();
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
      event.preventDefault();
      const requestId=transferRequestId.current??crypto.randomUUID();transferRequestId.current=requestId;
      const result=await mutation.run(
        ()=>transferLaunchHandoff({data:{actionId:handoff.id,expectedRevision:handoff.revision,
          requestId,recipientPersonId:recipient,reason,confirmed:true}}),
        {successMessage:"Opening handoff transferred.",commandErrorMessage:"Unable to transfer opening handoff."},
      );
      if(result.status==="saved"){transferRequestId.current=null;setTransferConfirmed(false);}
    }}>
      <h4 className="font-semibold">Recover pending handoff</h4>
      <Field label="Replacement site operator" required>
        <Select disabled={!hydrated||busy} value={recipient} onChange={event=>{setRecipient(event.target.value);transferRequestId.current=null;}}>
          <option value="">Select a replacement</option>
          {handoff.replacementOperators.map(operator=><option key={operator.personId} value={operator.personId}>
            {operator.firstName} {operator.lastName}</option>)}
        </Select>
      </Field>
      <Field label="Reason for recovery" required description="Explain why a replacement operator must receive this handoff.">
        <Textarea disabled={!hydrated||busy} minLength={10} maxLength={2000} value={reason}
          onChange={event=>{setReason(event.target.value);transferRequestId.current=null;}}/>
      </Field>
      <Label className="flex items-start gap-2 leading-6">
        <Checkbox disabled={!hydrated||busy} checked={transferConfirmed} onChange={event=>setTransferConfirmed(event.target.checked)}/>
        I confirm the previous recipient is no longer eligible and the replacement must independently acknowledge receipt.
      </Label>
      <Button type="submit" variant="outline" disabled={!hydrated||busy||!recipient||reason.trim().length<10||!transferConfirmed}>Transfer pending handoff</Button>
    </form>}
    {handoff.programId && handoff.siteId && <div className="mt-3 flex flex-wrap gap-3 text-sm">
      <Link to="/operations/launch/$programId" params={{ programId: handoff.programId }} className="underline">Review classes and staffing</Link>
      <Link to="/operations/school-years" search={{ siteId: handoff.siteId, programId: handoff.programId }} className="underline">Review school year</Link>
      <Link to="/home" search={{ siteId: handoff.siteId, programId: handoff.programId }} className="underline">Program operations</Link>
    </div>}
    {handoff.canAcknowledge ? <form className="mt-4 space-y-3" onSubmit={async event => {
      event.preventDefault();
      await mutation.run(
        ()=>acknowledgeLaunchHandoff({ data: { actionId: handoff.id, note, confirmed: true } }),
        {successMessage:"Opening handoff acknowledged.",commandErrorMessage:"Unable to acknowledge opening handoff."},
      );
    }}>
      <Field label="Acknowledgment note" required>
        <Textarea disabled={!hydrated||busy} minLength={10} maxLength={2000} value={note} onChange={event => setNote(event.target.value)}/>
      </Field>
      <Label className="flex items-start gap-2 leading-6">
        <Checkbox disabled={!hydrated||busy} checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/>
        I reviewed the opening record, school-year setup and classes, and received responsibility for daily operations.
      </Label>
      <Button type="submit" variant="outline" disabled={!hydrated||busy || !confirmed || note.trim().length < 10}>Acknowledge receipt</Button>
    </form> : handoff.status !== "resolved" && <p className="mt-3 text-sm text-muted-foreground">
      Only the named recipient with a current site operator grant can acknowledge this handoff.</p>}
    <MutationFeedback state={mutation} className="mt-3" pendingMessage="Saving opening handoff..."/>
  </article>;
}
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
