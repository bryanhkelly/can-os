import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/choice";
import { ActionFooter, EmptyState, QueryState, StatusBadge, MutationFeedback } from "@/components/workspace";
import { ClassVideoPlayer } from "@/components/learning/ClassVideoPlayer";
import { submitRecordedVideoForReview } from "@/modules/learning/recorded-video-review.functions";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import { classVideoFileSchema, videoUploadPolicy } from "@/domain/class-video";
import { createPrivateUploadTask } from "@/platform/storage/private-upload";
import {
  beginRecordedVideoUpload,finishRecordedVideoUpload,getMyRecordedVideoDrafts,
  getOwnRecordedVideoPreview,
} from "@/modules/learning/recorded-video-upload.functions";

/** Native /class provider workflow. Unlike the legacy Section supplement, an
 * instructional recording is attached to a publisher Course version and stays
 * a private draft until independently reviewed and released. */
export function ProviderVideoUploadForm({
  versions,
}:{
  versions:readonly {id:string;label:string}[];
}){
  const client=useQueryClient();
  const fileInput=useRef<HTMLInputElement>(null);
  const task=useRef<{run:()=>Promise<unknown>}|null>(null);
  const [courseVersionId,setCourseVersionId]=useState("");
  const [title,setTitle]=useState("");
  const [file,setFile]=useState<File|null>(null);
  const [rights,setRights]=useState(false);
  const [attempted,setAttempted]=useState(false);
  const [validationAttempted,setValidationAttempted]=useState(false);
  const feedback=useMutationFeedback(async()=>{
    await client.invalidateQueries({queryKey:["publisher-video-drafts",courseVersionId]});
  });
  const drafts=useQuery({
    queryKey:["publisher-video-drafts",courseVersionId],
    queryFn:()=>getMyRecordedVideoDrafts({data:{courseVersionId}}),
    enabled:!!courseVersionId&&versions.some(v=>v.id===courseVersionId),
    retry:false,
  });
  const busy=feedback.pending||feedback.refreshFailed;
  const reset=()=>{
    task.current=null;setAttempted(false);
  };

  async function upload(){
    setValidationAttempted(true);
    if(!courseVersionId||!versions.some(v=>v.id===courseVersionId)||
      title.trim().length<3||!file||!rights||busy)return;
    await feedback.run(async()=>{
      const parsed=classVideoFileSchema.parse({
        fileName:file.name,contentType:file.type,size:file.size,
      });
      task.current??=createPrivateUploadTask({
        file,policy:videoUploadPolicy,
        begin:()=>beginRecordedVideoUpload({data:{
          courseVersionId,title:title.trim(),...parsed,
        }}),
        finish:result=>finishRecordedVideoUpload({data:{
          courseVersionId,title:title.trim(),...parsed,
          assetId:result.assetId,assetVersionId:result.assetVersionId,
          key:result.key,acknowledgedRights:true,
        }}),
      });
      setAttempted(true);
      await task.current.run();
      reset();
      setTitle("");setFile(null);setRights(false);setValidationAttempted(false);
      if(fileInput.current)fileInput.current.value="";
    },{
      successMessage:"Private video draft uploaded and verified. Independent publication is still required.",
      commandErrorMessage:"Video upload could not be completed. Verify the file, authorization and R2 storage configuration.",
    });
  }

  return <section aria-label="Private recorded video upload"
    className="mt-6 border border-border bg-card p-5">
    <h2 className="font-serif text-2xl">Upload a lesson recording</h2>
    <p className="mt-2 text-sm leading-6 text-muted-foreground">
      MP4 or WebM, up to 500 MB. This upload is private and belongs to your
      appointed published Course. Uploading does not publish the video,
      modify curriculum, or authorize student playback. Approved media must
      pass independent rights, accessibility and academic review before
      it can be selected as an instructional track lesson.
    </p>
    <form className="mt-5 grid gap-4 sm:grid-cols-2"
      noValidate aria-busy={feedback.pending}
      onSubmit={event=>{event.preventDefault();void upload();}}>
      <Field label="Published Course" required className="sm:col-span-2"
        error={validationAttempted&&!courseVersionId?"Choose an assigned published Course.":undefined}>
        <Select value={courseVersionId} required
          onChange={event=>{reset();setCourseVersionId(event.target.value);}}
          className="min-h-11">
          <option value="">Choose an authorized Course version</option>
          {versions.map(item=><option value={item.id} key={item.id}>{item.label}</option>)}
        </Select>
      </Field>
      <Field label="Recording title" required
        error={validationAttempted&&title.trim().length<3?"Enter at least 3 characters.":undefined}>
        <Input value={title} required minLength={3} maxLength={200}
          onChange={event=>{reset();setTitle(event.target.value);}}
          placeholder="AI Digital Skills · Session 1"/>
      </Field>
      <Field label="Video file" required
        error={validationAttempted&&!file?"Choose an MP4 or WebM recording.":undefined}>
        <Input ref={fileInput} type="file" accept="video/mp4,video/webm,.mp4,.webm"
          onChange={event=>{reset();setFile(event.target.files?.[0]??null);}}/>
      </Field>
      <Field label="I hold the rights to upload this recording" required
        className="sm:col-span-2"
        error={validationAttempted&&!rights?"Confirm upload rights.":undefined}>
        <Checkbox checked={rights} onChange={event=>{reset();setRights(event.target.checked);}}/>
      </Field>
      <ActionFooter layout="inline" className="mt-0 sm:col-span-2">
        <Button type="submit" disabled={!versions.length||busy}
          loading={feedback.pending} loadingLabel="Uploading private video...">
          {attempted?"Retry private upload":"Upload private video draft"}
        </Button>
        {attempted&&<Button type="button" variant="outline"
          disabled={busy} onClick={reset}>Start a new upload</Button>}
      </ActionFooter>
    </form>
    <MutationFeedback state={feedback} pendingMessage="Uploading and verifying private media. Keep this page open."/>
    {courseVersionId&&<div className="mt-6 border-t border-border pt-5">
      <h3 className="text-sm font-semibold">Saved recording drafts</h3>
      <QueryState loading={drafts.isPending&&"Loading private recordings…"}
        error={drafts.isError&&"Saved recordings are not available for this Course appointment."}
        onRetry={()=>void drafts.refetch()} retrying={drafts.isFetching}
        isEmpty={drafts.isSuccess&&!drafts.data.length}
        empty={<EmptyState title="No private recordings uploaded for this Course."/>}/>
      {drafts.isSuccess&&!!drafts.data.length&&
        <ul className="mt-3 divide-y border border-border">
          {drafts.data.map(draft=><li key={draft.assetVersionId}
            className="space-y-3 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{draft.title}</span>
              <StatusBadge tone={draft.reviewRequestedAt?"info":"neutral"}>{draft.reviewRequestedAt?"Submitted for independent review":"Private draft · Review required"}</StatusBadge>
            </div>
            {!draft.reviewRequestedAt&&<Button type="button" variant="outline" disabled={busy||!draft.sha256} onClick={()=>void feedback.run(()=>submitRecordedVideoForReview({data:{courseVersionId,assetVersionId:draft.assetVersionId,expectedHash:draft.sha256!}}),{successMessage:"Recording submitted for independent review.",commandErrorMessage:"Submission blocked. Verify the recording and your Course appointment."})}>Submit for review</Button>}
            <ClassVideoPlayer title={draft.title+" · private creator preview"}
              resourceId={draft.assetVersionId}
              loadUrl={async()=>(await getOwnRecordedVideoPreview({data:{
                courseVersionId,assetVersionId:draft.assetVersionId,
              }})).downloadUrl}/>
          </li>)}
        </ul>}
    </div>}
  </section>;
}
