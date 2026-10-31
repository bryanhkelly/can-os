import type { FormEvent } from "react";

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
  function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }
  return <form className="mb-5 grid gap-3 rounded-lg border p-4" onSubmit={submit}>
    <h3 className="text-sm font-semibold">Add a teacher supplement</h3>
    <p className="text-xs text-muted-foreground">Share an HTTPS resource with this class, or connect it to a particular published lesson. Publisher content stays unchanged.</p>
    <label className="text-sm">Title<input aria-label="Resource title" required minLength={3} maxLength={200}
      value={title} onChange={event=>onTitleChange(event.target.value)} className="mt-1 w-full rounded border p-2"/></label>
    <label className="text-sm">External HTTPS resource URL<input aria-label="Resource URL" required type="url"
      value={url} onChange={event=>onUrlChange(event.target.value)} className="mt-1 w-full rounded border p-2"/></label>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">Resource type
        <select aria-label="Resource type" value={kind}
          onChange={event=>onKindChange(event.target.value as ClassSupplementKind)}
          className="mt-1 w-full rounded border p-2">
          {(["link","video","pdf","image","audio","document"] as const).map(value=>
            <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      <label className="text-sm">Publisher lesson (optional)
        <select aria-label="Publisher lesson" value={lessonId}
          onChange={event=>onLessonChange(event.target.value)} className="mt-1 w-full rounded border p-2">
          <option value="">Classwide resource</option>
          {lessons.map(lesson=><option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}
        </select>
      </label>
    </div>
    <button type="submit" disabled={busy} className="justify-self-start rounded border px-4 py-2 text-sm font-semibold disabled:opacity-50">Add resource</button>
  </form>;
}
