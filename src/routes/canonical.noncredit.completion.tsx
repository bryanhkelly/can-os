import { Label } from "@/components/ui/label";
import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceShell } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NoncreditCompletionReviewPanel } from "@/components/learning/NoncreditCompletionReviewPanel";

const isUuid=(value:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export const Route=createFileRoute("/canonical/noncredit/completion")({
  validateSearch:(raw:Record<string,unknown>)=>({
    registrationId:typeof raw.registrationId==="string"&&isUuid(raw.registrationId)?
      raw.registrationId:"",
  }),
  component:NoncreditCompletionWorkspace,
});

/** No Organization, Site, reviewer or Person is accepted from the URL.
 * Server commands independently validate the canonical provider grant,
 * exact original participation attribution and source evidence.
 */
function NoncreditCompletionWorkspace(){
  const {registrationId}=Route.useSearch();
  const [draft,setDraft]=useState(registrationId);
  const [selected,setSelected]=useState(registrationId);
  function open(event:FormEvent){
    event.preventDefault();
    if(isUuid(draft.trim()))setSelected(draft.trim());
  }
  return <WorkspaceShell width="wide"
    eyebrow="CAN OS / Noncredit outcomes"
    title="Completion history and correction"
    subtitle="Review independently authorized completion decisions for an existing noncredit Registration. Source history and issued awards remain distinct.">
    <form onSubmit={open} className="mt-6 flex flex-wrap items-end gap-3 border border-border bg-card p-4">
      <Label className="min-w-60 flex-1 space-y-2 text-sm font-medium">
        Canonical Registration ID
        <Input required placeholder="Existing Registration UUID"
          value={draft} onChange={event=>setDraft(event.target.value)}/>
      </Label>
      <Button type="submit" disabled={!isUuid(draft.trim())}>
        Open authorized registration
      </Button>
    </form>
    <div className="mt-5">
      {selected?<NoncreditCompletionReviewPanel key={selected}
        registrationId={selected}/>:
        <p className="border border-border bg-card p-5 text-sm text-muted-foreground">
          Select an existing Registration from an authorized provider workspace.
          Providing a Registration ID alone never grants operator or Site access.
        </p>}
    </div>
  </WorkspaceShell>;
}
