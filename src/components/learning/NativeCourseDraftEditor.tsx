import { useState, type FormEvent } from "react";
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
  getNativeCourseDraftLessons,saveNativeCourseLessonDraft,
} from "@/modules/learning/native-course-draft.functions";

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
    await client.invalidateQueries({queryKey:["native-course-draft-lessons",courseVersionId]});
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
