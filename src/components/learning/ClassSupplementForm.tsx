import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export type ClassSupplementKind = "link" | "video" | "pdf" | "image" | "audio" | "document";

export function ClassSupplementForm({
  title, url, kind, lessonId, lessons, busy, onTitleChange, onUrlChange, onKindChange, onLessonChange, onSubmit,
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
}) {
  const [attempted, setAttempted] = useState(false);
  function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
    let validHttps=false;
    try { validHttps=new URL(url).protocol==="https:"; } catch { /* invalid URL */ }
    if(title.trim().length<3||!validHttps)return;
    setAttempted(false);
    onSubmit();
  }
  let validHttps=false;
  try { validHttps=new URL(url).protocol==="https:"; } catch { /* invalid URL */ }
  return <form noValidate className="mb-5 grid gap-3 rounded-lg border p-4" onSubmit={submit}>
    <h3 className="text-sm font-semibold">Add a teacher supplement</h3>
    <p className="text-xs text-muted-foreground">Share an HTTPS resource with this class, or connect it to a particular published lesson. Videos support YouTube, Vimeo and direct MP4/WebM links. Publisher content stays unchanged.</p>
    <Field label="Title" className="text-sm" required error={attempted&&title.trim().length<3?"Enter a title with at least 3 characters.":undefined}>
      <Input aria-label="Resource title" minLength={3} maxLength={200} value={title} onChange={event=>onTitleChange(event.target.value)}/>
    </Field>
    <Field label="External HTTPS resource URL" className="text-sm" required
      error={attempted&&!validHttps?"Enter a valid HTTPS URL.":undefined}>
      <Input aria-label="Resource URL" type="url" value={url} onChange={event=>onUrlChange(event.target.value)}/>
    </Field>
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Resource type" className="text-sm">
        <Select aria-label="Resource type" value={kind}
          onChange={event=>onKindChange(event.target.value as ClassSupplementKind)}
        >
          {(["link","video","pdf","image","audio","document"] as const).map(value=>
            <option key={value} value={value}>{value}</option>)}
        </Select>
      </Field>
      <Field label="Publisher lesson (optional)" className="text-sm">
        <Select aria-label="Publisher lesson" value={lessonId} onChange={event=>onLessonChange(event.target.value)}>
          <option value="">Classwide resource</option>
          {lessons.map(lesson=><option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}
        </Select>
      </Field>
    </div>
    <Button type="submit" disabled={busy} className="justify-self-start">Add resource</Button>
  </form>;
}
