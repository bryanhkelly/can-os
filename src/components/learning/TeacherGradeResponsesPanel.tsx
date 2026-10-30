import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { getTeacherGradeResponses, resolveTeacherGradeResponse } from "@/modules/learning/teacher-grade-response.functions";

type Item = Awaited<ReturnType<typeof getTeacherGradeResponses>>["items"][number];

function GradeResponse({ item, onSaved, selected }: { item: Item; onSaved: () => void; selected: boolean }) {
  const [response, setResponse] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <article id={"grade-action-"+item.id} className={"rounded-xl border p-4"+(selected?" ring-2 ring-primary":"")}>
    <p className="font-semibold">{item.studentName} · {item.assessmentTitle}</p>
    <p className="mt-2 whitespace-pre-wrap text-sm">{item.message}</p>
    <p className="mt-2 text-xs capitalize">{item.status.replaceAll("_", " ")}</p>
    <Link to="/teacher/gradebook" search={{ section: item.sectionId, assessment: item.assessmentId, student: item.studentProfileId }}
      className="mt-2 inline-block text-sm underline">Review graded work</Link>
    {item.status === "resolved"
      ? <p className="mt-3 whitespace-pre-wrap text-sm">School response: {item.resolutionNote}</p>
      : <form className="mt-3 space-y-3" onSubmit={async event => {
        event.preventDefault();
        if (busy) return;
        setBusy(true); setError("");
        try {
          await resolveTeacherGradeResponse({ data: { actionId: item.id, response } });
          onSaved();
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "Unable to record the school response.");
        } finally { setBusy(false); }
      }}>
        <label className="block text-sm font-semibold">Response to the guardian
          <textarea value={response} onChange={event => setResponse(event.target.value)} required
            minLength={10} maxLength={2000} rows={3} disabled={busy}
            className="mt-2 block w-full rounded-lg border bg-background p-3"/>
        </label>
        <p className="text-xs text-muted-foreground">This answer resolves the existing follow-up and is visible to the requesting guardian while their academic access remains active.</p>
        <button disabled={busy} className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50">
          {busy ? "Saving…" : "Respond and resolve"}
        </button>
      </form>}
    {error && <p role="alert" className="mt-3 text-sm">{error}</p>}
  </article>;
}

export function TeacherGradeResponsesPanel({ selectedAction }: { selectedAction?: string }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof getTeacherGradeResponses>> | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    getTeacherGradeResponses().then(result => { setData(result); setError(""); })
      .catch(() => setError("Unable to load guardian academic questions."));
  }, []);
  useEffect(load, [load]);
  useEffect(() => {
    if (data && selectedAction)
      document.getElementById("grade-action-"+selectedAction)?.scrollIntoView({block:"center"});
  }, [data, selectedAction]);
  return <section id="grade-follow-ups" aria-label="Guardian grade questions" className="mt-10">
    <h2 className="text-lg font-semibold">Guardian grade questions</h2>
    {!data && !error && <p role="status" className="mt-3 text-sm">Loading academic follow-ups…</p>}
    {error && <p role="alert" className="mt-3 text-sm">{error} <button type="button" onClick={load} className="underline">Retry</button></p>}
    {data && !data.items.length && <p className="mt-3 text-sm">No open or recently resolved guardian questions in your authorized classes.</p>}
    {data && selectedAction && !data.items.some(item=>item.id===selectedAction) &&
      <p role="alert" className="mt-3 text-sm">This guardian question is unavailable in your current academic queue.</p>}
    {data?.truncated && <p className="mt-3 text-sm">Showing the first 50 questions.</p>}
    <div className="mt-4 space-y-3">{data?.items.map(item => <GradeResponse key={item.id} item={item} onSaved={load} selected={item.id===selectedAction}/>)}</div>
  </section>;
}
