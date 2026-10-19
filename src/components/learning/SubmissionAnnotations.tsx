import { useEffect, useRef, useState } from "react";
import { addSubmissionAnnotation, getSubmissionAnnotations } from "@/modules/learning/submission-annotations.functions";

export function SubmissionAnnotations({ submissionId, responseText }: { submissionId: string; responseText?: string }) {
  const [annotations, setAnnotations] = useState<Awaited<ReturnType<typeof getSubmissionAnnotations>>["annotations"]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [range, setRange] = useState<{ start: number; end: number; quote: string } | null>(null);
  const [comment, setComment] = useState("");
  const requestId = useRef<string | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setAnnotations([]);
    getSubmissionAnnotations({ data: { submissionId } }).then(result => {
      if (active) setAnnotations(result.annotations);
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Unable to load annotations."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [submissionId]);
  async function save() {
    if (!range) { setError("Select text from the submitted response first."); return; }
    setBusy(true); setError(""); requestId.current ??= crypto.randomUUID();
    try {
      await addSubmissionAnnotation({ data: { id: requestId.current, submissionId,
        startOffset: range.start, endOffset: range.end, quote: range.quote, comment } });
      const result = await getSubmissionAnnotations({ data: { submissionId } });
      setAnnotations(result.annotations); setComment(""); setRange(null); requestId.current = null;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save annotation."); }
    finally { setBusy(false); }
  }
  return <section aria-label="Teacher annotations" className="mt-5 space-y-3">
    <h3 className="text-sm font-semibold">Teacher annotations</h3>
    {error && <p role="alert" className="rounded-lg border p-3 text-sm">{error}</p>}
    {loading && <p role="status" className="text-sm">Loading annotations...</p>}
    {responseText !== undefined && <details className="rounded-lg border p-3">
      <summary className="cursor-pointer text-sm font-semibold">Annotate submitted text</summary>
      <p className="mt-2 text-sm text-muted-foreground">Select a passage below, then add feedback. Annotations are permanent and become visible to the student and authorized guardians when this attempt is graded or returned. PDF/file markup is not supported.</p>
      <label className="mt-3 block text-sm">Submitted response (select text)
        <textarea readOnly rows={6} value={responseText} aria-label="Select submitted text to annotate"
          onSelect={event => {
            const target = event.currentTarget;
            if (target.selectionEnd > target.selectionStart) {
              setRange({ start: target.selectionStart, end: target.selectionEnd, quote: target.value.slice(target.selectionStart, target.selectionEnd) });
              requestId.current = null;
            }
          }} className="mt-2 block w-full rounded-lg border bg-muted/40 p-3"/>
      </label>
      {range && <blockquote className="mt-3 whitespace-pre-wrap border-l-2 pl-3 text-sm">{range.quote}</blockquote>}
      <form onSubmit={event => { event.preventDefault(); void save(); }} className="mt-3 grid gap-3">
        <label className="text-sm">Annotation comment<textarea maxLength={4000} rows={3} disabled={busy} value={comment}
          onChange={event => { setComment(event.target.value); requestId.current = null; }} className="mt-2 block w-full rounded-lg border bg-background p-3"/></label>
        <button disabled={busy || !range || !comment.trim()} className="justify-self-start rounded-lg border px-4 py-2 text-sm disabled:opacity-50">{busy ? "Saving..." : "Save annotation"}</button>
      </form>
    </details>}
    <ul className="space-y-3">{annotations.map(item => <li key={item.id} className="rounded-lg border p-4">
      <blockquote className="whitespace-pre-wrap border-l-2 pl-3 text-sm">{item.quote}</blockquote>
      <p className="mt-3 whitespace-pre-wrap text-sm">{item.comment}</p>
      <p className="mt-2 text-xs text-muted-foreground">{item.author} · {new Date(item.createdAt).toLocaleString()}</p>
    </li>)}</ul>
    {!loading && !error && !annotations.length && <p className="text-sm text-muted-foreground">No released annotations on this attempt.</p>}
  </section>;
}
