import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { getTeacherGradeResponses, resolveTeacherGradeResponse } from "@/modules/learning/teacher-grade-response.functions";
import { SubmissionEvidence } from "@/components/student/SubmissionEvidence";

export type TeacherGradeResponseItem = Awaited<ReturnType<typeof getTeacherGradeResponses>>["items"][number];
type Item = TeacherGradeResponseItem;

function GradeResponse({ item, onSaved, selected }: { item: Item; onSaved: (id: string, answer: string) => void; selected: boolean }) {
  const [response, setResponse] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [savedResponse, setSavedResponse] = useState<string | null>(null);
  return <article id={"grade-action-"+item.id} className={"rounded-xl border p-4"+(selected?" ring-2 ring-primary":"")}>
    <p className="font-semibold">{item.studentName} · {item.assessmentTitle}</p>
    <p className="mt-2 text-xs font-semibold text-muted-foreground">Released attempt {item.attemptNumber}</p>
    <div className="mt-2 rounded-lg border bg-muted/40 p-3 text-sm">
      <p className="font-semibold">Grade being discussed: {item.score ?? "Not scored"}{item.score === null ? "" : " / " + item.pointsPossible}</p>
      <p className="mt-2 whitespace-pre-wrap">Released teacher feedback: {item.teacherFeedback || "No written comment recorded."}</p>
    </div>
    <p className="mt-3 text-sm font-semibold">Guardian's question</p>
    <p className="mt-1 whitespace-pre-wrap text-sm">{item.message}</p>
    <p className="mt-2 text-xs capitalize">{item.status.replaceAll("_", " ")}</p>
    <details className="mt-3 rounded-lg border p-3">
      <summary className="cursor-pointer text-sm font-semibold">Review original submitted work and attachments · attempt {item.attemptNumber}</summary>
      <div className="mt-3"><SubmissionEvidence submissionId={item.submissionId} historical/></div>
    </details>
    <Link to="/teacher/gradebook" search={{ section: item.sectionId, assessment: item.assessmentId, student: item.studentProfileId }}
      className="mt-3 inline-block text-sm underline">Open current class gradebook</Link>
    {(item.status === "resolved" || savedResponse !== null)
      ? <p className="mt-3 whitespace-pre-wrap text-sm" role="status">School response: {savedResponse ?? item.resolutionNote}</p>
      : <form className="mt-3 space-y-3" onSubmit={async event => {
        event.preventDefault();
        if (busy) return;
        setBusy(true); setError("");
        try {
          await resolveTeacherGradeResponse({ data: { actionId: item.id, response } });
          // Preserve the confirmed resolution even if refreshing the queue fails.
          setSavedResponse(response.trim());
          onSaved(item.id, response.trim());
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

export function TeacherGradeResponsesPanel({ selectedAction, onQuestionsChange }: {
  selectedAction?: string;
  onQuestionsChange?: (items: Item[] | null) => void;
}) {
  const [data, setData] = useState<Awaited<ReturnType<typeof getTeacherGradeResponses>> | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    getTeacherGradeResponses().then(result => {
      setData(result);
      setError("");
      onQuestionsChange?.(result.items);
    }).catch(() => {
      setData(null);
      onQuestionsChange?.(null);
      setError("Unable to load guardian academic questions.");
    });
  }, [onQuestionsChange]);
  useEffect(load, [load]);
  const markAnswered = (id: string, answer: string) => {
    if (!data) return;
    // The command confirmed the write. Update this canonical read model in
    // the UI immediately rather than leave a resolved family question open.
    const next = {
      ...data,
      items: data.items.map(item => item.id === id
        ? { ...item, status: "resolved" as const, resolutionNote: answer } : item),
    };
    setData(next);
    onQuestionsChange?.(next.items);
  };
  useEffect(() => {
    if (data && selectedAction)
      document.getElementById("grade-action-"+selectedAction)?.scrollIntoView({block:"center"});
  }, [data, selectedAction]);
  return <section id="grade-follow-ups" aria-label="Guardian grade questions" className="mt-10">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">Guardian grade questions</h2>
      <button type="button" className="rounded-lg border px-3 py-2 text-sm font-semibold"
        onClick={load}>Refresh questions</button>
    </div>
    {data && <p className="mt-2 text-sm text-muted-foreground">
      {data.items.filter(item=>item.status!=="resolved" && item.status!=="cancelled").length} awaiting your school's response
    </p>}
    {!data && !error && <p role="status" className="mt-3 text-sm">Loading academic follow-ups…</p>}
    {error && <p role="alert" className="mt-3 text-sm">{error} <button type="button" onClick={load} className="underline">Retry</button></p>}
    {data && !data.items.length && <p className="mt-3 text-sm">No open or recently resolved guardian questions in your authorized classes.</p>}
    {data && selectedAction && !data.items.some(item=>item.id===selectedAction) &&
      <p role="alert" className="mt-3 text-sm">This guardian question is unavailable in your current academic queue.</p>}
    {data?.truncated && <p className="mt-3 text-sm">Showing the first 50 questions.</p>}
    <div className="mt-4 space-y-3">{data?.items.map(item => <GradeResponse key={item.id} item={item} onSaved={markAnswered} selected={item.id===selectedAction}/>)}</div>
  </section>;
}
