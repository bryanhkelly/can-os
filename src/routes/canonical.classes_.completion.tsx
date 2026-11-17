import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WorkspaceShell } from "@/components/workspace";
import { NativeClassCompletionOperatorPanel } from "@/components/learning/NativeClassCompletionOperatorPanel";

const canonicalUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** WS3 guarded operator-only workspace. No staff, Site or learner IDs are
 * trusted from the URL. Server-side current grants authorize each request.
 * Navigation placement and release remain owned by WS00.
 */
export const Route=createFileRoute("/canonical/classes_/completion")({
  validateSearch:(search:Record<string,unknown>)=>({
    classId:typeof search.classId==="string"&&canonicalUuid.test(search.classId)?
      search.classId:"",
  }),
  component:ClassCompletionWorkspace,
});

function ClassCompletionWorkspace(){
  const {classId}=Route.useSearch();
  const [draft,setDraft]=useState(classId);
  const [activeClassId,setActiveClassId]=useState(classId);
  function open(event:FormEvent){
    event.preventDefault();
    if(canonicalUuid.test(draft.trim()))setActiveClassId(draft.trim());
  }
  return <WorkspaceShell width="wide"
    eyebrow="CAN OS / Governed Class outcomes"
    title="Class completion"
    subtitle="Independent provider review of the Class's original completion policy, verified source evidence and official outcomes. No academic grade or award is created here.">
    <form onSubmit={open} className="mt-6 flex flex-wrap items-end gap-3 border border-border bg-card p-4">
      <label className="min-w-60 flex-1 space-y-2 text-sm font-medium">
        Authorized Class ID
        <Input value={draft} onChange={event=>setDraft(event.target.value)}
          placeholder="Paste the canonical Class UUID" required/>
      </label>
      <Button type="submit" disabled={!canonicalUuid.test(draft.trim())}>
        Open authorized review
      </Button>
    </form>
    <div className="mt-5">
      {activeClassId?<NativeClassCompletionOperatorPanel key={activeClassId}
        classId={activeClassId}/>:
        <p className="border border-border bg-card p-5 text-sm text-muted-foreground">
          Choose an existing Class from your authorized workspace. This page
          does not grant access based on a supplied identifier.
        </p>}
    </div>
  </WorkspaceShell>;
}
