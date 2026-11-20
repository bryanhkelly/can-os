import { Link } from "@tanstack/react-router";
import type { getTeacherLearningEvidence } from "@/modules/learning/teacher-learning-evidence.functions";
import { TeacherLearningFollowUpForm } from "@/components/learning/TeacherLearningFollowUpForm";

type Evidence = Awaited<ReturnType<typeof getTeacherLearningEvidence>>;

/** Observational learning-evidence panel for teacher workspaces.
 * Recorded interactions are neither attendance, grades nor a clinical signal.
 * The authorized follow-up form owns its own server mutation.
 */
export function TeacherLearningParticipationPanel({
  activity, error, onCreated,
}: {
  activity: Evidence | null;
  error: string;
  onCreated: () => void;
}) {
  return <section className="mt-10" aria-label="Observed learning participation">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Learning participation</p>
      <p className="mt-2 text-sm text-muted-foreground">
        Verified CAN OS interaction evidence from your assigned sections, not attendance, grades or a diagnosis of disengagement.
        Uninstrumented and offline learning may not appear.
      </p>
      {error && <p role="status" className="mt-3 text-sm">{error}</p>}
      {!activity && !error && <p role="status" className="mt-3 text-sm">Loading observed activity…</p>}
      {activity && <>
        <p className="mt-2 text-xs text-muted-foreground">{activity.note}</p>
        {activity.truncated && <p className="mt-2 text-xs">Large roster: showing a limited evidence sample.</p>}
        <div className="mt-4 grid gap-3">
          {activity.students.filter(student => student.observedEvents7d > 0).slice(0, 12).map(student =>
            <article key={student.sectionId + ":" + student.studentProfileId} className="border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">{student.sectionTitle}</p>
              <Link to="/staff/students/$personId" params={{ personId: student.studentPersonId }} className="mt-1 block font-semibold underline">{student.studentName}</Link>
              <p className="mt-1 text-xs text-muted-foreground">{student.observedEvents7d} recorded interactions in 7 days
                · latest {student.latestObservedAt ? new Date(student.latestObservedAt).toLocaleString() : "not recorded"}
                · up to {Math.round(student.estimatedActiveMs7d / 60_000)} min estimated active time</p>
              {student.nativeVideoObservations7d > 0 && <p className="mt-1 text-xs text-muted-foreground">
                Native video: {student.nativeVideoStarts7d} observed starts and {student.nativeVideoObservations7d} player events.
                These are browser observations, not proof of viewing or completion.
              </p>}
              {student.latestEventId && <TeacherLearningFollowUpForm
                sectionId={student.sectionId} studentProfileId={student.studentProfileId}
                learningEventId={student.latestEventId} onCreated={onCreated} />}
            </article>)}
          {!activity.students.some(student => student.observedEvents7d > 0) &&
            <p className="text-sm">No interaction evidence has been collected for these classes yet. This does not mean students have not been learning.</p>}
        </div>
        <p className="mt-3 text-sm">Use existing <Link to="/teacher/missing-work" className="underline">missing-work follow-up</Link> and authorized support referrals for human-reviewed interventions.</p>
      </>}
    </section>;
}
