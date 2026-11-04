import { useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { beginClassVideoUpload, finishClassVideoUpload } from "@/modules/learning/class-video-upload.functions";
import { createPrivateUploadTask } from "@/platform/storage/private-upload";
import { classVideoFileSchema, videoUploadPolicy } from "@/domain/class-video";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import { MutationFeedback } from "@/components/workspace";

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
  const fileInput = useRef<HTMLInputElement>(null);
  const task = useRef<{ run: () => Promise<unknown> } | null>(null);
  const busy = feedback.pending || feedback.refreshFailed;
  async function submit() {
    if (!file) return;
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
      setTitle(""); setFile(null); setRights(false);
      if (fileInput.current) fileInput.current.value = "";
    }, { successMessage: "Video uploaded and attached to this class.",
      commandErrorMessage: "Unable to upload this video. Check the file, connection and deployment storage settings, then retry." });
  }
  return <form className="mb-5 grid gap-3 rounded-lg border p-4" aria-label="Upload class video"
    aria-busy={feedback.pending} onSubmit={event => { event.preventDefault(); void submit(); }}>
    <h3 className="text-sm font-semibold">Upload a video</h3>
    <p className="text-xs text-muted-foreground">Private MP4 or WebM, up to 500 MB. Use browser-compatible codecs.
      Only authorized class viewers can request playback. Publisher content stays unchanged.</p>
    {!enabled && <p role="status" className="text-sm">Video uploads are not enabled on this deployment. You can still add a video link.</p>}
    <MutationFeedback state={feedback} pendingMessage="Uploading and verifying video. Keep this page open..."/>
    <fieldset disabled={!enabled || busy || attempted} className="grid gap-3">
      <label className="text-sm">Video title<input required minLength={3} maxLength={200} value={title}
        onChange={event => setTitle(event.target.value)} className="mt-1 w-full rounded border p-2"/></label>
      <label className="text-sm">Video file<input ref={fileInput} required type="file" accept="video/mp4,video/webm,.mp4,.webm"
        onChange={event => setFile(event.target.files?.[0] ?? null)} className="mt-1 block w-full"/></label>
      {!lessonId && <label className="text-sm">Attach video to<select value={selectedLesson}
        onChange={event => setSelectedLesson(event.target.value)} className="mt-1 w-full rounded border p-2">
        <option value="">Entire class</option>
        {lessons.map(lesson => <option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}
      </select></label>}
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" required checked={rights}
        onChange={event => setRights(event.target.checked)}/>I have permission to share this video with the class.</label>
    </fieldset>
    <div className="flex gap-3">
      <button type="submit" disabled={!enabled || busy || !file || !rights}
        className="justify-self-start rounded border px-4 py-2 text-sm disabled:opacity-50">
        {attempted ? "Retry video upload" : "Upload video"}
      </button>
      {attempted && <button type="button" disabled={busy} className="text-sm underline"
        onClick={() => { task.current = null; setAttempted(false); }}>Choose another file</button>}
    </div>
  </form>;
}
