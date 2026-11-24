import { Link, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { MutationFeedback, WorkspaceShell, WorkspaceNotice, StatusBadge } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import { addSupplementalPresentation, removePresentation, replacePrimaryPresentation, unresolvedPresentationCount } from "@/domain/instructional-presentation-editor";
import { getCreatorInstructionalDraft } from "@/modules/learning/provider-content-workspace.functions";
import { saveRecordedInstructionDraft, submitRecordedInstructionDraft } from "@/modules/learning/instructional-tracks.functions";

type Draft = Awaited<ReturnType<typeof getCreatorInstructionalDraft>>;
type Presentation = Draft["presentations"][number];

/** One current verified Course appointment; editing never grants publication. */
export function ProviderInstructionDraft({trackVersionId,navigation}:{trackVersionId:string;navigation?:ReactNode}){
  const draft=useQuery({
    queryKey:["provider-instruction-draft",trackVersionId],
    queryFn:()=>getCreatorInstructionalDraft({data:{trackVersionId}}),
    retry:false,
  });
  if(draft.isPending)return <WorkspaceShell eyebrow="CAN OS" title="Instructional track draft"><p role="status">Checking your current content appointment…</p></WorkspaceShell>;
  if(draft.isError||!draft.data)return <WorkspaceShell eyebrow="CAN OS" title="Content unavailable"><p role="alert">This track is unavailable under your current verified appointment.</p></WorkspaceShell>;
  return <CreatorDraftEditor key={draft.data.trackVersionId+":"+draft.data.revision}
    data={draft.data} navigation={navigation}/>;
}

function CreatorDraftEditor({data,navigation}:{data:Draft;navigation?:ReactNode}) {
  const client=useQueryClient();
  const router = useRouter();
  const mutation = useMutationFeedback(async()=>{
    await Promise.all([router.invalidate(),client.invalidateQueries({queryKey:["provider-instruction-draft",data.trackVersionId]})]);
  });
  const pendingRequestId = useRef<string | null>(null);
  const [presentations,setPresentations] = useState<Presentation[]>(data.presentations);
  const [advancedMaterials,setAdvancedMaterials] = useState(JSON.stringify(data.materials,null,2));
  const [validation,setValidation] = useState("");
  const [dirty,setDirty] = useState(false);

  const primaryAsset = (lessonId:string) => presentations.find(item =>
    item.courseLessonId===lessonId && item.presentationKind==="primary")?.assetVersionId ?? "";
  const publishedIds=new Set(data.assets.map(asset=>asset.id));
  const unresolved=unresolvedPresentationCount(presentations,publishedIds);
  const boundAssets=new Map([...data.boundAssets,...data.assets.map(asset=>({...asset,lifecycle:"published"}))].map(asset=>[asset.id,asset]));
  const primaryCovered=new Set(presentations.filter(item=>item.presentationKind==="primary"&&publishedIds.has(item.assetVersionId)).map(item=>item.courseLessonId)).size;
  function edit(update:(previous:Presentation[])=>Presentation[]){
    setPresentations(update);setDirty(true);setValidation("");pendingRequestId.current=null;
  }
  function choosePrimary(lessonId:string,assetVersionId:string) {
    edit(previous=>replacePrimaryPresentation(previous,lessonId,assetVersionId));
  }
  function addSupplement(lessonId:string,assetVersionId:string){
    if(assetVersionId)edit(previous=>addSupplementalPresentation(previous,lessonId,assetVersionId));
  }
  function remove(item:Presentation){
    edit(previous=>removePresentation(previous,item));
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
    if(unresolved){setValidation("Remove or replace all unresolved recording references before saving. Original lesson references remain preserved.");return;}
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
    {navigation}
    <Link to="/class" search={{view:"content"}} className="inline-flex min-h-10 items-center text-sm font-semibold text-primary underline">Back to my tracks</Link>
    <section className="mt-5 border border-border bg-card p-5" aria-label="Lesson presentation bindings">
      <h2 className="font-serif text-2xl">Lesson recordings</h2>
      <p className="mt-2 text-sm text-muted-foreground">Select published, organization-owned recordings. Existing unreviewed bindings are visible for remediation, not playback. The server independently checks rights and review evidence before saving and submitting.</p>
      <p className="mt-3 text-sm">{data.trackKind==="primary"?primaryCovered+" / "+data.lessons.length+" lessons have a published primary selection.":presentations.length+" supplemental track presentation links."}</p>
      {unresolved>0&&<WorkspaceNotice tone="attention" className="mt-3">{unresolved} existing presentation links lack a selectable published asset. Remove or replace them before saving. Removing a binding does not delete its source asset or original lesson reference.</WorkspaceNotice>}
      <div className="mt-5 grid gap-4">
        {data.lessons.map(lesson=>{
          const primary=primaryAsset(lesson.id);
          const supplemental=presentations.filter(item=>item.courseLessonId===lesson.id&&item.presentationKind!=="primary");
          return <section key={lesson.id} className="space-y-3 border border-border p-4">
            <h3 className="text-sm font-semibold">{lesson.lessonOrder}. {lesson.title}</h3>
            {data.trackKind==="primary"&&<Field label="Primary recording">
              <Select value={primary} disabled={mutation.pending} onChange={event=>choosePrimary(lesson.id,event.target.value)}>
                <option value="">No primary recording assigned</option>
                {primary&&!publishedIds.has(primary)&&<option value={primary}>Unresolved: {boundAssets.get(primary)?.title??"Existing reference"}</option>}
                {data.assets.map(asset=><option key={asset.id} value={asset.id}>{asset.title} · {asset.kind} · asset v{asset.versionNo}</option>)}
              </Select>
            </Field>}
            {data.trackKind==="supplemental"&&primary&&<div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm">Existing primary binding: {boundAssets.get(primary)?.title??"Existing reference"}</span>
              <Button type="button" size="sm" variant="outline" disabled={mutation.pending} onClick={()=>choosePrimary(lesson.id,"")}>Remove primary binding</Button>
            </div>}
            {supplemental.length>0&&<ul className="space-y-2">
              {supplemental.map(item=><li key={item.presentationKind+":"+item.ordinal} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div><p>{boundAssets.get(item.assetVersionId)?.title??"Existing recording reference"}</p><StatusBadge tone={publishedIds.has(item.assetVersionId)?"neutral":"attention"}>{publishedIds.has(item.assetVersionId)?"Published selection":"Review or replacement required"} · {item.presentationKind.replaceAll("_"," ")}</StatusBadge></div>
                <Button type="button" variant="outline" size="sm" disabled={mutation.pending} onClick={()=>remove(item)}>Remove binding</Button>
              </li>)}
            </ul>}
            <Field label="Add supplemental recording">
              <Select value="" disabled={mutation.pending||!data.assets.length} onChange={event=>addSupplement(lesson.id,event.target.value)}>
                <option value="">Choose a published recording</option>
                {data.assets.filter(asset=>!supplemental.some(item=>item.assetVersionId===asset.id&&item.presentationKind==="supplement")).map(asset=><option key={asset.id} value={asset.id}>{asset.title} · v{asset.versionNo}</option>)}
              </Select>
            </Field>
          </section>;
        })}
      </div>
      {!data.lessons.length && <p role="status" className="mt-4 text-sm">This Course version has no published lessons. Instruction cannot be submitted until the Course catalog is complete.</p>}
      {data.assetInventoryLimited && <p role="alert" className="mt-4 text-sm">Asset inventory reached its display limit. Ask the provider administrator for an appropriately scoped catalog before saving.</p>}
      <details className="mt-6 border-t border-border pt-4">
        <summary className="cursor-pointer font-semibold">Advanced supplemental materials</summary>
        <p className="mt-2 text-xs text-muted-foreground">Preserve or update the complete canonical materials array. Practice questions must meet the server's approved schema. No private answer keys may be stored here.</p>
        <Textarea className="mt-3 min-h-40 font-mono text-xs"
          value={advancedMaterials} onChange={event=>{setAdvancedMaterials(event.target.value);setDirty(true);setValidation("");pendingRequestId.current=null;}}
          aria-label="Supplemental materials JSON"/>
      </details>
      {validation && <p role="alert" className="mt-3 border border-destructive p-3 text-sm">{validation}</p>}
      <MutationFeedback state={mutation} className="mt-4" pendingMessage="Updating instructional track…"/>
      <div className="mt-5 flex flex-wrap gap-3">
        <Button onClick={()=>void save()} disabled={mutation.pending||mutation.refreshFailed||data.assetInventoryLimited||unresolved>0}>Save private draft</Button>
        <Button variant="outline" onClick={()=>void submit()}
          disabled={dirty||mutation.pending||mutation.refreshFailed||!data.lessons.length||unresolved>0||(data.trackKind==="primary"&&primaryCovered!==data.lessons.length)}>
          Submit current saved version for review
        </Button>
      </div>
      {dirty && <p role="status" className="mt-3 text-xs">Unsaved changes must be saved and reloaded before submission. This prevents reviewing a stale content manifest.</p>}
    </section>
  </WorkspaceShell>;
}
