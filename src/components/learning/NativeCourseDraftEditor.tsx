import { useState, type FormEvent } from "react";
import { normalizeClientError } from "@/lib/client-error";
import { useQuery,useQueryClient } from "@tanstack/react-query";
import { WorkspacePanel,StatusBadge,MutationFeedback } from "@/components/workspace";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import { nativeCourseLessonEditableSchema } from "@/domain/native-course-lesson-draft";
import {
  getNativeCourseDraftLessons,getNativeCourseReleaseReadiness,
  saveNativeCourseLessonDraft,
} from "@/modules/learning/native-course-draft.functions";
import {
  getNativeOfferingReleaseOverview,submitNativeOfferingRelease,
} from "@/modules/learning/native-offering-release.functions";

type DraftVersion={id:string;label:string};
type DraftLesson=Awaited<ReturnType<typeof getNativeCourseDraftLessons>>["lessons"][number];

function parseDraftSegments(text:string){
  return text.split("\n").filter(line=>line.trim().length>0).map(line=>{
    const divider=line.lastIndexOf("|");
    const label=divider>=0?line.slice(0,divider).trim():"";
    const raw=divider>=0?line.slice(divider+1).trim():"";
    return {title:label,minutes:raw?Number(raw):NaN};
  });
}

function DraftLessonForm({courseVersionId,lesson}:{
  courseVersionId:string;lesson:DraftLesson;
}){
  const client=useQueryClient();
  const [title,setTitle]=useState(lesson.title);
  const [objectives,setObjectives]=useState((lesson.editable?.objectives??[]).join("\n"));
  const [segments,setSegments]=useState(
    (lesson.editable?.segments??[]).map(segment=>
      segment.title+" | "+segment.minutes).join("\n"));
  const [attempted,setAttempted]=useState(false);
  const feedback=useMutationFeedback(async()=>{
    await Promise.all([
      client.invalidateQueries({queryKey:["native-course-draft-lessons",courseVersionId]}),
      client.invalidateQueries({queryKey:["native-offering-release-overview"]}),
      client.invalidateQueries({queryKey:["native-course-release-readiness",courseVersionId]}),
    ]);
  });
  if(!lesson.editable)return <p role="status" className="text-sm text-muted-foreground">
    This draft uses a different lesson content format. It cannot be modified
    with the structured native lesson editor. No fields have been overwritten.
  </p>;
  const candidate=nativeCourseLessonEditableSchema.safeParse({
    title,objectives:objectives.split("\n").map(v=>v.trim()).filter(Boolean),
    segments:parseDraftSegments(segments),
  });
  async function save(event:FormEvent){
    event.preventDefault();
    setAttempted(true);
    if(!candidate.success||feedback.pending||feedback.refreshFailed)return;
    await feedback.run(()=>saveNativeCourseLessonDraft({data:{
      courseVersionId,lessonId:lesson.id,expectedRevision:lesson.revision,
      ...candidate.data,
    }}),{
      successMessage:"Course lesson saved as a private draft. Publication review is still required.",
      commandErrorMessage:"Could not save this Course lesson. Verify your current Course appointment and reload if it was changed.",
      refreshErrorMessage:"The lesson saved, but its current revision could not be reloaded. Refresh before editing again.",
    });
  }
  const errors=attempted&&!candidate.success?candidate.error.issues.map(i=>i.message).join(" "):null;
  return <form className="mt-4 space-y-4" onSubmit={event=>void save(event)}>
    <Field label="Lesson title" required>
      <Input value={title} maxLength={200}
        onChange={event=>setTitle(event.target.value)}/>
    </Field>
    <Field label="Learning objectives" required
      description="One objective per line, up to 10. Do not include answers, personal data or private assessment keys.">
      <Textarea value={objectives} rows={4} maxLength={2600}
        onChange={event=>setObjectives(event.target.value)}/>
    </Field>
    <Field label="Recorded lesson and facilitator segments" required
      description="One segment per line as: Segment title | Minutes. Total duration must not exceed 180 minutes.">
      <Textarea value={segments} rows={6} maxLength={3500}
        onChange={event=>setSegments(event.target.value)}/>
    </Field>
    {errors&&<p role="alert" className="text-sm text-destructive">{errors}</p>}
    <Button type="submit" disabled={feedback.pending||feedback.refreshFailed}>
      {feedback.pending?"Saving lesson…":"Save Course lesson draft"}
    </Button>
    <MutationFeedback state={feedback}
      pendingMessage="Checking current Course ownership and saving the draft…"/>
  </form>;
}

function NativeOfferingSubmission({offeringVersionId}:{offeringVersionId:string}){
  const client=useQueryClient();
  const current=useQuery({
    queryKey:["native-offering-release-overview",offeringVersionId],
    queryFn:()=>getNativeOfferingReleaseOverview({data:{offeringVersionId}}),
    retry:false,
  });
  const [busy,setBusy]=useState(false);
  const [assetUses,setAssetUses]=useState<Array<{
    assetVersionId:string;
    usageKind:"required_instruction"|"supporting"|"accessibility"|"assessment";
  }>>([]);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  async function submit(){
    if(!current.data||current.data.lifecycle!=="draft"||busy)return;
    setBusy(true);setNotice("");setError("");
    try{
      const response=await submitNativeOfferingRelease({data:{
        offeringVersionId,expectedHash:current.data.manuscriptHash,assets:assetUses,
      }});
      setNotice(response.created?(assetUses.length
        ?"Submitted exact published assets and native Course composition for independent release review."
        :"Submitted native Course manuscript for independent review."): 
        "This exact native release snapshot was already submitted.");
      await Promise.all([
        client.invalidateQueries({queryKey:["native-offering-release-overview",offeringVersionId]}),
        client.invalidateQueries({queryKey:["native-offering-release-review-queue"]}),
      ]);
    }catch(cause){
      setError(normalizeClientError(cause,
        "Release submission denied. Verify current Course creator appointments and the unchanged draft.").message);
    }finally{setBusy(false)}
  }
  return <div className="mt-3 border-t border-border pt-3 text-sm">
    {current.isPending&&<p role="status">Checking Course release manifest…</p>}
    {current.isError&&<p role="alert">
      This publisher Offering cannot be submitted under the current verified Course appointments.
    </p>}
    {current.data&&<>
      <p>{current.data.courseCount} Course(s), {current.data.lessonCount} lesson(s).
        {" "}Snapshot {current.data.manuscriptHash.slice(0,12)}.
        {" "}{current.data.manifest?.current
          ? "Current manifest: "+current.data.manifest.status
          :current.data.manifest?"Previous review snapshot is stale.":"Not yet submitted for review."}
      </p>
      {current.data.lifecycle==="draft"&&<>
        <div className="mt-4 border border-border p-3">
          <h4 className="font-semibold">Reviewed publisher assets</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            Optional while reviewing the Course manuscript. For final Offering release,
            select immutable, published assets with current independent academic,
            accessibility and rights approval. The server rechecks every asset.
          </p>
          {current.data.assetsLimited&&<p role="alert" className="mt-2 text-xs">
            The published asset inventory is limited to 100 records. Do not treat this as complete.
          </p>}
          {current.data.availableAssets.length===0&&<p className="mt-2 text-xs">
            No publisher-owned published assets are available. The Course manuscript may
            still be submitted for independent review.
          </p>}
          <div className="mt-3 grid gap-2">
            {current.data.availableAssets.map(asset=>{
              const selected=assetUses.find(item=>item.assetVersionId===asset.id);
              return <div key={asset.id} className="grid gap-2 border border-border p-3 sm:grid-cols-[1fr_auto]">
                <div>
                  <p className="font-medium">{asset.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {asset.kind} · {asset.sha256?.slice(0,12)??"Missing hash"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {selected&&<Select aria-label={`Asset use for ${asset.title}`}
                    value={selected.usageKind} onChange={event=>setAssetUses(current=>
                      current.map(item=>item.assetVersionId===asset.id
                        ?{...item,usageKind:event.target.value as typeof item.usageKind}:item))}>
                    <option value="required_instruction">Required instruction</option>
                    <option value="supporting">Supporting</option>
                    <option value="accessibility">Accessibility</option>
                    <option value="assessment">Assessment</option>
                  </Select>}
                  <Button type="button" variant="outline" aria-pressed={Boolean(selected)}
                    disabled={busy||(!selected&&assetUses.length>=50)}
                    onClick={()=>setAssetUses(current=>selected?
                      current.filter(item=>item.assetVersionId!==asset.id):
                      [...current,{assetVersionId:asset.id,usageKind:"required_instruction"}])}>
                    {selected?"Remove":"Select"}
                  </Button>
                </div>
              </div>;
            })}
          </div>
        </div>
        {assetUses.length>0&&!current.data.releasePoliciesComplete&&
          <p role="alert" className="mt-2 text-xs text-destructive">
            An independent publisher reviewer must define the release requirements
            for every Course before an asset-backed snapshot can be submitted.
          </p>}
        <Button className="mt-3" type="button" variant="outline"
          disabled={busy||(assetUses.length>0&&!current.data.releasePoliciesComplete)||
            Boolean(current.data.manifest?.current&&
              (assetUses.length===0?current.data.manifest.assetCount===0:false))}
          onClick={()=>void submit()}>
          {busy?"Submitting…":assetUses.length?
            `Submit ${assetUses.length} reviewed asset(s) for Offering release`:
            "Submit native Course manuscript for independent review"}
        </Button>
      </>}
    </>}
    {notice&&<p role="status" className="mt-2">{notice}</p>}
    {error&&<p role="alert" className="mt-2 text-destructive">{error}</p>}
  </div>;
}

/** Native Course editor in the existing publisher content workspace.
 * No independent Class implementation, Course copy, approval or publish API. */
export function NativeCourseDraftEditor({versions}:{versions:readonly DraftVersion[]}){
  const [versionId,setVersionId]=useState("");
  const [lessonId,setLessonId]=useState("");
  const selectedVersion=versions.some(version=>version.id===versionId)?versionId:null;
  const outline=useQuery({
    queryKey:["native-course-draft-lessons",selectedVersion],
    queryFn:()=>getNativeCourseDraftLessons({data:{courseVersionId:selectedVersion!}}),
    enabled:Boolean(selectedVersion),retry:false,
  });
  const readiness=useQuery({
    queryKey:["native-course-release-readiness",selectedVersion],
    queryFn:()=>getNativeCourseReleaseReadiness({data:{courseVersionId:selectedVersion!}}),
    enabled:Boolean(selectedVersion),retry:false,
  });
  const lessons=outline.data?.lessons??[];
  const selectedLesson=lessons.find(lesson=>lesson.id===lessonId)??null;
  return <WorkspacePanel title="Edit native Course lesson drafts"
    className="mt-6"
    description="Edit the native Course hierarchy before independent publication. Save changes in place without copying the Course or publishing a Class.">
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Assigned draft Course version">
        <Select value={versionId}
          onChange={event=>{setVersionId(event.target.value);setLessonId("");}}>
          <option value="">Choose an unpublished Course</option>
          {versions.map(v=><option key={v.id} value={v.id}>{v.label}</option>)}
        </Select>
      </Field>
      {selectedVersion&&outline.isSuccess&&<Field label="Course lesson">
        <Select value={lessonId}
          onChange={event=>setLessonId(event.target.value)}>
          <option value="">Choose a lesson to edit</option>
          {lessons.map(lesson=><option key={lesson.id} value={lesson.id}>
            {lesson.lessonOrder}. {lesson.title}
          </option>)}
        </Select>
      </Field>}
    </div>
    {!versions.length&&<p role="status" className="mt-4 text-sm text-muted-foreground">
      No unpublished Course versions are assigned to your current verified creator appointment.
    </p>}
    {selectedVersion&&outline.isPending&&<p role="status" className="mt-4 text-sm">
      Loading verified Course lessons…
    </p>}
    {outline.isError&&<p role="alert" className="mt-4 text-sm">
      Course draft is unavailable. An active publisher appointment and unpublished
      version are required.
    </p>}
    {outline.isSuccess&&outline.data.limited&&<p role="alert" className="mt-4 text-sm">
      The lesson list is limited to 80 records. Contact curriculum support before
      treating this as the full Course.
    </p>}
    {outline.isSuccess&&!lessons.length&&<p className="mt-4 text-sm text-muted-foreground">
      This Course version contains no native lessons.
    </p>}
    {selectedVersion&&<section className="mt-5 border-t border-border pt-5"
      aria-label="Native Course release prerequisites">
      <h3 className="font-semibold">Release prerequisites</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Live records for this exact Course version. This is a private diagnostic,
        not a publication request, independent approval, or Class activation.
      </p>
      {readiness.isPending&&<p role="status" className="mt-3 text-sm">
        Checking publisher Course and Offering records…
      </p>}
      {readiness.isError&&<p role="alert" className="mt-3 text-sm">
        Release prerequisites could not be checked under your current Course appointment.
        The Course remains unpublished; no approval can be assumed.
      </p>}
      {readiness.data&&<>
        <ul className="mt-3 space-y-2 text-sm">
          <li className="border border-border p-3">
            <strong>Native Course v{readiness.data.versionNo}:</strong>
            {" "}private draft with {readiness.data.lessonCount} lesson(s).
            Independent Course publication has not been verified.
          </li>
          {readiness.data.offerings.map(item=><li key={item.offeringVersionId}
            className="border border-border p-3">
            <strong>{item.offeringTitle} · Offering v{item.versionNo}:</strong>
            {" "}{item.published?"published":"not published"} ({item.lifecycle}).
            {!item.published&&<NativeOfferingSubmission offeringVersionId={item.offeringVersionId}/>}
          </li>)}
          {!readiness.data.offerings.length&&<li className="border border-border p-3">
            No Offering version is linked to this exact native Course version.
          </li>}
        </ul>
        {readiness.data.limited&&<p role="alert" className="mt-3 text-sm">
          The release record list was truncated. Do not treat it as complete.
        </p>}
        <p className="mt-3 text-xs text-muted-foreground">
          This creator view does not inspect other organizations' adoption,
          Deployment or Site records. Authorized local operators must verify
          exact-version adoption and effective Site authority in Program Operations.
          Independent Course and Offering publication remains required.
          No older curriculum publisher is used.
        </p>
      </>}
    </section>}
    {selectedLesson&&selectedVersion&&<div className="mt-5 border-t border-border pt-5">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="font-semibold">{selectedLesson.unitTitle}</h3>
        <StatusBadge tone="attention">Unpublished draft</StatusBadge>
      </div>
      <DraftLessonForm key={selectedLesson.id+":"+selectedLesson.revision}
        courseVersionId={selectedVersion} lesson={selectedLesson}/>
    </div>}
    <p className="mt-4 text-xs text-muted-foreground">
      Draft editing does not grant Course release, rights approval, local adoption,
      teaching authorization, or learner enrollment.
    </p>
  </WorkspacePanel>;
}
