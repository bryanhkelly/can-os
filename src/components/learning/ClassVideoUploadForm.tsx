import { useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { beginClassVideoUpload, finishClassVideoUpload } from "@/modules/learning/class-video-upload.functions";
import { createPrivateUploadTask } from "@/platform/storage/private-upload";
import { classVideoFileSchema, videoUploadPolicy } from "@/domain/class-video";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import { ActionFooter, MutationFeedback, WorkspaceNotice } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export function ClassVideoUploadForm({ sectionId, lessons, lessonId, enabled }: {
  sectionId: string;
  lessons: readonly { id: string; title: string }[];
  lessonId?: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const feedback = useMutationFeedback(() => router.invalidate());
  const [title, setTitle] = useState("");
  const [selectedLesson, setSelectedLesson] = useState(lessonId ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [rights, setRights] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [validationAttempted, setValidationAttempted] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const task = useRef<{ run: () => Promise<unknown> } | null>(null);
  const busy = feedback.pending || feedback.refreshFailed;
  async function submit() {
    setValidationAttempted(true);
    if (title.trim().length < 3 || !file || !rights) return;
    await feedback.run(async () => {
      const videoFile = classVideoFileSchema.parse({ fileName: file.name, size: file.size, contentType: file.type });
      task.current ??= createPrivateUploadTask({
        file, policy: videoUploadPolicy,
        begin: () => beginClassVideoUpload({ data: {
          sectionId, title, lessonId: selectedLesson || undefined,
          ...videoFile,
        } }),
        finish: upload => finishClassVideoUpload({ data: {
          sectionId, title, lessonId: selectedLesson || undefined, ...videoFile,
          resourceId: upload.resourceId, key: upload.key, acknowledgedRights: true,
        } }),
      });
      setAttempted(true);
      await task.current.run();
      task.current = null;
      setAttempted(false);
      setValidationAttempted(false);
      setTitle(""); setFile(null); setRights(false);
      if (fileInput.current) fileInput.current.value = "";
    }, { successMessage: "Video uploaded and attached to this class.",
      commandErrorMessage: "Unable to upload this video. Check the file, connection and deployment storage settings, then retry." });
  }
  return <form noValidate className="mb-5 grid gap-3  border p-4" aria-label="Upload class video"
    aria-busy={feedback.pending} onSubmit={event => { event.preventDefault(); void submit(); }}>
    <h3 className="text-sm font-semibold">Upload a video</h3>
    <p className="text-xs text-muted-foreground">Private MP4 or WebM, up to 500 MB. Use browser-compatible codecs.
      Only authorized class viewers can request playback. Publisher content stays unchanged.</p>
    {!enabled && <WorkspaceNotice tone="attention">Video uploads are not enabled on this deployment. You can still add a video link.</WorkspaceNotice>}
    <MutationFeedback state={feedback} pendingMessage="Uploading and verifying video. Keep this page open..."/>
    <fieldset disabled={!enabled || busy || attempted} className="grid gap-3">
      <Field label="Video title" required error={validationAttempted&&title.trim().length<3?"Enter a title with at least 3 characters.":undefined}>
        <Input minLength={3} maxLength={200} value={title} onChange={event => setTitle(event.target.value)}/>
      </Field>
      <Field label="Video file" required error={validationAttempted&&!file?"Choose an MP4 or WebM video file.":undefined}>
        <Input ref={fileInput} type="file" accept="video/mp4,video/webm,.mp4,.webm"
          onChange={event => setFile(event.target.files?.[0] ?? null)}/>
      </Field>
      {!lessonId && <Field label="Attach video to"><Select value={selectedLesson}
        onChange={event => setSelectedLesson(event.target.value)}>
        <option value="">Entire class</option>
        {lessons.map(lesson => <option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}
      </Select></Field>}
      <Field label="I have permission to share this video with the class" required
        error={validationAttempted&&!rights?"Confirm that you have permission to share this video.":undefined}>
        <Checkbox checked={rights} onChange={event => setRights(event.target.checked)}/>
      </Field>
    </fieldset>
    <ActionFooter layout="inline" className="mt-0">
      <Button type="submit" disabled={!enabled || busy} loading={feedback.pending} loadingLabel="Uploading video...">
        {attempted ? "Retry video upload" : "Upload video"}
      </Button>
      {attempted && <Button type="button" variant="outline" disabled={busy}
        onClick={() => { task.current = null; setAttempted(false); }}>Choose another file</Button>}
    </ActionFooter>
  </form>;
}
