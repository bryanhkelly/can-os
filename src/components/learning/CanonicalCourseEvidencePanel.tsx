import { useEffect, useState } from "react";
import { getCanonicalCourseEvidence } from "@/modules/learning/canonical-course-evidence.functions";

type Evidence = Awaited<ReturnType<typeof getCanonicalCourseEvidence>>;
const eventLabels: Record<string, string> = {
  lesson_opened: "Lesson opened",
  lesson_resumed: "Lesson resumed",
  engaged_interval: "Active interaction estimated",
  resource_opened: "Resource opened",
  video_opened: "Video player opened",
  video_played: "Native video playback started",
  video_ended: "Native video reached its end",
};
function dateTime(value: string) {
  return new Date(value).toLocaleString();
}

/** Private learner evidence, with canonical results clearly separated from click observations. */
export function CanonicalCourseEvidencePanel({ courseAttemptId }: {courseAttemptId:string}) {
  return <CanonicalEvidenceSession key={courseAttemptId} courseAttemptId={courseAttemptId}/>;
}

function CanonicalEvidenceSession({courseAttemptId}:{courseAttemptId:string}) {
  const [evidence,setEvidence]=useState<Evidence|null>(null);
  const [error,setError]=useState(false);
  const [open,setOpen]=useState(false);
  const [loading,setLoading]=useState(false);
  useEffect(()=>{ setEvidence(null);setOpen(false);setError(false); },[courseAttemptId]);

  async function refresh() {
    setLoading(true);setError(false);
    try {
      setEvidence(await getCanonicalCourseEvidence({data:{courseAttemptId}}));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return <section className="border bg-card p-4" aria-label="Course evidence">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 className="font-serif text-lg font-semibold">Your course activity and evidence</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Confirmed assessments, submitted feedback, and completion decisions are
          separate from estimated browser activity.
        </p>
      </div>
      <button type="button" className="border px-3 py-2 text-sm font-medium"
        aria-expanded={open} onClick={()=>{
          setOpen(value=>!value);
          if(!open)void refresh();
        }}>{open?"Hide details":"View evidence"}</button>
    </div>
    {open&&<div className="mt-4 space-y-4">
      {loading&&<p role="status" className="text-sm">Loading course evidence...</p>}
      {error&&<p role="alert" className="text-sm">
        Course evidence is temporarily unavailable. Your official progress is unchanged.
      </p>}
      {evidence&&!loading&&<>
        <div className="grid gap-3 sm:grid-cols-3" aria-label="Verified course evidence summary">
          <div className="border p-3">
            <p className="text-xs text-muted-foreground">Submitted assessments</p>
            <p className="font-serif text-2xl font-semibold">
              {evidence.assessments.filter(a=>a.submittedAt!==null).length}
            </p>
          </div>
          <div className="border p-3">
            <p className="text-xs text-muted-foreground">Submitted feedback surveys</p>
            <p className="font-serif text-2xl font-semibold">{evidence.surveys.length}</p>
          </div>
          <div className="border p-3">
            <p className="text-xs text-muted-foreground">Completion decision</p>
            <p className="text-sm font-semibold">
              {evidence.completion?.outcome==="completed"?"Recorded":
                evidence.completion?.outcome==="not_yet_completed"?"Not yet complete":
                evidence.completion?.outcome==="voided"?"Voided":"Not recorded"}
            </p>
          </div>
        </div>
        <div>
          <h4 className="font-semibold">Verified assessment and survey records</h4>
          <ul className="mt-2 divide-y text-sm">
            {evidence.assessments.map(a=><li key={a.id} className="py-2">
              Knowledge check attempt {a.attemptNo}: {a.state}
              {a.finalizedOutcome?(" · Finalized: "+a.finalizedOutcome):""}
              <span className="ml-2 text-xs text-muted-foreground">{dateTime(a.submittedAt??a.startedAt)}</span>
            </li>)}
            {evidence.surveys.map(s=><li key={s.responseId} className="py-2">
              Feedback submitted <span className="ml-2 text-xs text-muted-foreground">
                {dateTime(s.submittedAt)}
              </span>
            </li>)}
            {!evidence.assessments.length&&!evidence.surveys.length&&
              <li className="py-2 text-muted-foreground">No confirmed assessment or survey activity yet.</li>}
          </ul>
        </div>
        <details className="border p-3">
          <summary className="cursor-pointer text-sm font-semibold">
            Browser activity observations ({evidence.observations.length} recent events)
          </summary>
          <p className="my-2 text-xs text-muted-foreground">
            Playback events indicate player interaction, not verified viewing.
            Estimated interaction time is not attendance, academic credit or proof of learning.
          </p>
          <ol className="max-h-72 overflow-y-auto divide-y text-xs">
            {evidence.observations.map(e=><li key={e.id} className="py-2">
              {eventLabels[e.kind]??"Learning interaction"}
              <span className="ml-2 text-muted-foreground">{dateTime(e.receivedAt)}</span>
              {e.estimatedActiveMs>0&&
                <span className="ml-2 text-muted-foreground">
                  Up to {Math.round(e.estimatedActiveMs/1000)}s estimated
                </span>}
            </li>)}
            {!evidence.observations.length&&<li className="py-2">No recent browser observations.</li>}
          </ol>
        </details>
      </>}
    </div>}
  </section>;
}
