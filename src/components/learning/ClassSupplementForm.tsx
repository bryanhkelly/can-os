import { useState, type FormEvent } from "react";
import { resolveClassVideo } from "@/domain/class-video";
import { ClassVideoUploadForm } from "@/components/learning/ClassVideoUploadForm";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export type ClassSupplementKind = "link" | "video" | "pdf" | "image" | "audio" | "document";

/** A single authoring entry point for external video embeds and private R2 recordings. */
export function ClassSupplementForm({
  title, url, kind, lessonId, lessons, busy, onTitleChange, onUrlChange, onKindChange, onLessonChange, onSubmit,
  sectionId, uploadsEnabled = false,
}: {
  title: string;
  url: string;
  kind: ClassSupplementKind;
  lessonId: string;
  lessons: readonly {id:string;title:string}[];
  busy: boolean;
  onTitleChange: (value:string)=>void;
  onUrlChange: (value:string)=>void;
  onKindChange: (value:ClassSupplementKind)=>void;
  onLessonChange: (value:string)=>void;
  onSubmit: ()=>void;
  sectionId?: string;
  uploadsEnabled?: boolean;
}) {
  const [attempted, setAttempted] = useState(false);
  const [videoSource, setVideoSource] = useState<"link" | "upload">("link");
  const isVideo = kind === "video";
  let validHttps = false;
  try {
    const candidate = new URL(url);
    validHttps = candidate.protocol === "https:" && !candidate.username && !candidate.password && !candidate.port;
  } catch { /* invalid URL */ }
  const playable = Boolean(resolveClassVideo(url));
  const validUrl = validHttps && (!isVideo || playable);

  function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
    if (title.trim().length < 3 || !validUrl) return;
    setAttempted(false);
    onSubmit();
  }
  function changeUrl(next: string) {
    onUrlChange(next);
    // Recognized video URLs are videos, even if the resource was initially a generic link.
    if (resolveClassVideo(next) && kind !== "video") onKindChange("video");
  }
  return <section className="mb-5 space-y-4 rounded-lg border p-4" aria-label="Add class resource">
    <div>
      <h3 className="text-sm font-semibold">Add class or lesson resource</h3>
      <p className="mt-1 text-xs text-muted-foreground">Embed YouTube or Vimeo, upload a private video to CAN, or share another learning resource. Publisher lessons stay unchanged.</p>
    </div>
    <Field label="Resource type" className="text-sm">
      <Select aria-label="Resource type" value={kind} onChange={event => { onKindChange(event.target.value as ClassSupplementKind); setAttempted(false); }}>
        <option value="link">Link or website</option>
        <option value="video">Video</option>
        <option value="pdf">PDF link</option>
        <option value="image">Image link</option>
        <option value="audio">Audio link</option>
        <option value="document">Document link</option>
      </Select>
    </Field>
    {isVideo && <div className="flex flex-wrap gap-2" role="group" aria-label="Video source">
      <Button type="button" size="sm" variant={videoSource === "link" ? "default" : "outline"}
        aria-pressed={videoSource === "link"} onClick={() => setVideoSource("link")}>YouTube, Vimeo or video link</Button>
      {sectionId && <Button type="button" size="sm" variant={videoSource === "upload" ? "default" : "outline"}
        aria-pressed={videoSource === "upload"} onClick={() => setVideoSource("upload")}>Upload video to CAN (R2)</Button>}
    </div>}
    {isVideo && videoSource === "upload" && sectionId ? <ClassVideoUploadForm
      sectionId={sectionId} lessons={lessons} lessonId={lessonId || undefined} enabled={uploadsEnabled} /> :
    <form noValidate className="grid gap-3" onSubmit={submit}>
      <Field label="Title" className="text-sm" required error={attempted && title.trim().length < 3 ? "Enter a title with at least 3 characters." : undefined}>
        <Input aria-label="Resource title" minLength={3} maxLength={200} value={title} onChange={event => onTitleChange(event.target.value)}/>
      </Field>
      <Field label={isVideo ? "YouTube, Vimeo or direct HTTPS video URL" : "External HTTPS resource URL"} className="text-sm" required
        error={attempted && !validUrl ? (isVideo ? "Enter a supported YouTube, Vimeo, MP4 or WebM video URL." : "Enter a valid HTTPS URL.") : undefined}>
        <Input aria-label="Resource URL" type="url" maxLength={2048} value={url} onChange={event => changeUrl(event.target.value)}
          placeholder={isVideo ? "https://www.youtube.com/watch?v=..." : "https://"}/>
      </Field>
      {isVideo && <p className="text-xs text-muted-foreground" role="status">
        {url && playable ? "Recognized video source. The lesson will play it inline." :
          "YouTube, Vimeo, MP4 and WebM are supported. The owner must allow embedding; some private videos cannot be played."}
      </p>}
      <Field label="Attach resource to" className="text-sm">
        <Select aria-label="Attach resource to" value={lessonId} onChange={event => onLessonChange(event.target.value)}>
          <option value="">Entire class</option>
          {lessons.map(lesson => <option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}
        </Select>
      </Field>
      <Button type="submit" disabled={busy} className="justify-self-start">Add resource</Button>
    </form>}
  </section>;
}
