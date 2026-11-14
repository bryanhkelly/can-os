import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { MutationFeedback, WorkspaceShell } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import { getCreatorInstructionalDraft } from "@/modules/learning/provider-content-workspace.functions";
import { saveRecordedInstructionDraft, submitRecordedInstructionDraft } from "@/modules/learning/instructional-tracks.functions";

export const Route = createFileRoute("/canonical/content_/$trackVersionId")({
  loader: ({params}) => safeLoader(() => getCreatorInstructionalDraft({data:{trackVersionId:params.trackVersionId}}))(),
  component: CreatorDraftPage,
});

type Draft = Awaited<ReturnType<typeof getCreatorInstructionalDraft>>;
type Presentation = Draft["presentations"][number];

function CreatorDraftPage() {
  const outcome = Route.useLoaderData();
  if (!outcome.ok) return <LoaderFailure eyebrow="Content production" title="Instructional track draft" outcome={outcome} />;
  return <CreatorDraftEditor key={outcome.data.trackVersionId+":"+outcome.data.revision} data={outcome.data}/>;
}

function CreatorDraftEditor({data}:{data:Draft}) {
  const router = useRouter();
  const mutation = useMutationFeedback(() => router.invalidate());
  const pendingRequestId = useRef<string | null>(null);
  const [presentations,setPresentations] = useState<Presentation[]>(data.presentations);
  const [advancedMaterials,setAdvancedMaterials] = useState(JSON.stringify(data.materials,null,2));
  const [validation,setValidation] = useState("");
  const [dirty,setDirty] = useState(false);

  const primaryAsset = (lessonId:string) => presentations.find(item =>
    item.courseLessonId===lessonId && item.presentationKind==="primary")?.assetVersionId ?? "";
  function choosePrimary(lessonId:string,assetVersionId:string) {
    setPresentations(previous => [
      ...previous.filter(item => !(item.courseLessonId===lessonId && item.presentationKind==="primary")),
      ...(assetVersionId ? [{courseLessonId:lessonId,assetVersionId,presentationKind:"primary" as const,ordinal:1,accessibilityNotes:{}}] : []),
    ]);
    setDirty(true);setValidation("");
  }
  function requestId(){const id=pendingRequestId.current??crypto.randomUUID();pendingRequestId.current=id;return id;}
  async function save(){
    if (mutation.pending || mutation.refreshFailed) return;
    let materials: typeof data.materials;
    try {
      const decoded:unknown=JSON.parse(advancedMaterials);
      if (!Array.isArray(decoded)) throw new Error("Materials must be a JSON array.");
      materials=decoded as typeof data.materials;
    } catch {setValidation("Supplemental materials must be a valid JSON array. Nothing was saved.");return;}
    setValidation("");
    const outcome=await mutation.run(()=>saveRecordedInstructionDraft({data:{
      requestId:requestId(),trackVersionId:data.trackVersionId,expectedRevision:data.revision,
      materials:materials.map(item=>({...item,activitySpec:JSON.parse(JSON.stringify(item.activitySpec))})),
      presentations:presentations.map(item=>({...item,accessibilityNotes:JSON.parse(JSON.stringify(item.accessibilityNotes))})),
    }}),{
      successMessage:"Private lesson content saved.",
      commandErrorMessage:"Could not save this version. Check media rights, lesson coverage and current Course appointment.",
      refreshErrorMessage:"Content saved, but refresh failed. Reload the draft before editing again.",
    });
    if(outcome.status==="saved"||outcome.status==="refresh-failed"){pendingRequestId.current=null;setDirty(false);}
  }
  async function submit(){
    if (dirty || mutation.pending || mutation.refreshFailed) return;
    const outcome=await mutation.run(()=>submitRecordedInstructionDraft({data:{
      requestId:requestId(),trackVersionId:data.trackVersionId,expectedRevision:data.revision,
    }}),{
      successMessage:"Exact instructional track manifest submitted for independent review.",
      commandErrorMessage:"Cannot submit yet. Verify every required lesson and content asset rights.",
      refreshErrorMessage:"Submitted, but the updated status could not be loaded. Refresh before retrying.",
    });
    if(outcome.status==="saved"||outcome.status==="refresh-failed")pendingRequestId.current=null;
  }
  return <WorkspaceShell width="wide" eyebrow="CAN OS · Content production" title={data.trackTitle}
    subtitle={data.courseTitle+" · "+data.trackKind+" track · exact published Course version"}>
    <Link to="/canonical/content" className="inline-flex min-h-10 items-center text-sm font-semibold text-primary underline">Back to my tracks</Link>
    <section className="mt-5 border border-border bg-card p-5" aria-label="Lesson presentation bindings">
      <h2 className="font-serif text-2xl">Lesson recordings</h2>
      <p className="mt-2 text-sm text-muted-foreground">Choose a published, organization-owned asset version for each primary lesson. This does not bypass independent rights, accessibility, safeguarding or coverage approval.</p>
      <div className="mt-5 grid gap-4">
        {data.lessons.map(lesson => <Field key={lesson.id} label={lesson.lessonOrder+". "+lesson.title}>
          <Select value={primaryAsset(lesson.id)} onChange={event=>choosePrimary(lesson.id,event.target.value)}>
            <option value="">No primary recording assigned</option>
            {data.assets.map(asset => <option key={asset.id} value={asset.id}>
              {asset.title} · {asset.kind} · asset v{asset.versionNo}
            </option>)}
          </Select>
        </Field>)}
      </div>
      {!data.lessons.length && <p role="status" className="mt-4 text-sm">This Course version has no published lessons. Instruction cannot be submitted until the Course catalog is complete.</p>}
      {data.assetInventoryLimited && <p role="alert" className="mt-4 text-sm">Asset inventory reached its display limit. Ask the provider administrator for an appropriately scoped catalog before saving.</p>}
      <details className="mt-6 border-t border-border pt-4">
        <summary className="cursor-pointer font-semibold">Advanced supplemental materials</summary>
        <p className="mt-2 text-xs text-muted-foreground">Preserve or update the complete canonical materials array. Practice questions must meet the server's approved schema. No private answer keys may be stored here.</p>
        <textarea className="mt-3 min-h-40 w-full border border-border bg-background p-3 font-mono text-xs"
          value={advancedMaterials} onChange={event=>{setAdvancedMaterials(event.target.value);setDirty(true);setValidation("");}}
          aria-label="Supplemental materials JSON"/>
      </details>
      {validation && <p role="alert" className="mt-3 border border-destructive p-3 text-sm">{validation}</p>}
      <MutationFeedback state={mutation} className="mt-4" pendingMessage="Updating instructional track…"/>
      <div className="mt-5 flex flex-wrap gap-3">
        <Button onClick={()=>void save()} disabled={mutation.pending||mutation.refreshFailed||data.assetInventoryLimited}>Save private draft</Button>
        <Button variant="outline" onClick={()=>void submit()}
          disabled={dirty||mutation.pending||mutation.refreshFailed||!data.lessons.length}>
          Submit current saved version for review
        </Button>
      </div>
      {dirty && <p role="status" className="mt-3 text-xs">Unsaved changes must be saved and reloaded before submission. This prevents reviewing a stale content manifest.</p>}
    </section>
  </WorkspaceShell>;
}
