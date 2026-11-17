import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Checkbox } from "@/components/ui/choice";
import { MutationFeedback } from "@/components/workspace";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import { classVideoFileSchema, videoUploadPolicy } from "@/domain/class-video";
import { createPrivateUploadTask } from "@/platform/storage/private-upload";
import {
  beginRecordedVideoUpload,finishRecordedVideoUpload,getMyRecordedVideoDrafts,
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
        <select value={courseVersionId} required
          onChange={event=>{reset();setCourseVersionId(event.target.value);}}
          className="min-h-11 w-full border border-border bg-background px-3 text-sm">
          <option value="">Choose an authorized Course version</option>
          {versions.map(item=><option value={item.id} key={item.id}>{item.label}</option>)}
        </select>
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
      <div className="sm:col-span-2 flex flex-wrap gap-3">
        <Button type="submit" disabled={!versions.length||busy}>
          {attempted?"Retry private upload":"Upload private video draft"}
        </Button>
        {attempted&&<Button type="button" variant="outline"
          disabled={busy} onClick={reset}>Start a new upload</Button>}
      </div>
    </form>
    <MutationFeedback state={feedback} pendingMessage="Uploading and verifying private media. Keep this page open."/>
    {courseVersionId&&<div className="mt-6 border-t border-border pt-5">
      <h3 className="text-sm font-semibold">Saved recording drafts</h3>
      {drafts.isPending&&<p role="status" className="mt-2 text-sm">Loading private recordings…</p>}
      {drafts.isError&&<p role="alert" className="mt-2 text-sm">
        Saved recordings are not available for this Course appointment.
      </p>}
      {drafts.isSuccess&&!drafts.data.length&&<p className="mt-2 text-sm text-muted-foreground">
        No private recordings uploaded for this Course.
      </p>}
      {drafts.isSuccess&&!!drafts.data.length&&
        <ul className="mt-3 divide-y border border-border">
          {drafts.data.map(draft=><li key={draft.assetVersionId}
            className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
            <span className="font-medium">{draft.title}</span>
            <span className="text-muted-foreground">Private draft · Review required</span>
          </li>)}
        </ul>}
    </div>}
  </section>;
}
