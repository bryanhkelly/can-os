import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceShell } from "@/components/workspace";
import { ClassroomCompanionRoom } from "@/components/learning/ClassroomCompanionRoom";
import { ClassroomGovernedLearnerSurveys } from "@/components/learning/ClassroomGovernedLearnerSurveys";
import { Button } from "@/components/ui/button";
import { getLearnerFacilitatedRoom, leaveFacilitatedRoom } from "@/modules/learning/facilitated-learning.functions";
import {
  getRecentClassroomFeedback, submitClassroomFeedback,
} from "@/modules/learning/classroom-feedback.functions";

export const Route = createFileRoute("/classroom/companion")({
  validateSearch: (search: Record<string, unknown>) => ({
    courseAttemptId: typeof search.courseAttemptId === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(search.courseAttemptId)
      ? search.courseAttemptId : "",
  }),
  component: ClassroomCompanionPage,
});

type Rooms = Awaited<ReturnType<typeof getLearnerFacilitatedRoom>>;
type Feedback = Awaited<ReturnType<typeof getRecentClassroomFeedback>>;
type QuestionKey = "clarity" | "technology" | "value";
const feedbackQuestions: ReadonlyArray<readonly [QuestionKey, string]> = [
  ["clarity", "Lesson clarity"],
  ["technology", "Technology worked"],
  ["value", "The session was valuable"],
];

function ClassroomCompanionPage() {
  const { courseAttemptId } = Route.useSearch();
  const [data, setData] = useState<Rooms | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [feedbackBusy, setFeedbackBusy] = useState("");
  const [feedbackError, setFeedbackError] = useState("");
  const [feedbackNotice, setFeedbackNotice] = useState("");

  useEffect(() => {
    setData(null);
    setError("");
    setFeedback(null);
    setFeedbackError("");
    setFeedbackNotice("");
    if (!courseAttemptId) return;
    let active = true;
    const refresh = () => {
      void getLearnerFacilitatedRoom({ data: { courseAttemptId } })
        .then(result => { if (active) { setData(result); setError(""); } })
        .catch(() => { if (active) { setData(null); setError("Your course or room access could not be verified."); } });
    };
    refresh();
    void getRecentClassroomFeedback({ data: { courseAttemptId } })
      .then(result => { if (active) setFeedback(result); })
      .catch(() => { if (active) setFeedbackError("Feedback is unavailable for this course right now."); });
    const interval = window.setInterval(refresh, 15_000);
    return () => { active = false; window.clearInterval(interval); };
  }, [courseAttemptId]);

  async function leave(facilitatedSessionId: string) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      await leaveFacilitatedRoom({ data: { courseAttemptId, facilitatedSessionId } });
      setData(await getLearnerFacilitatedRoom({ data: { courseAttemptId } }));
      // Feedback stays available after leaving a paired room.
    } catch { setError("Unable to leave the room. Please retry."); }
    finally { setBusy(false); }
  }

  async function rate(facilitatedSessionId: string, questionKey: QuestionKey, rating: number) {
    if (feedbackBusy) return;
    const id = facilitatedSessionId + ":" + questionKey;
    setFeedbackBusy(id); setFeedbackError(""); setFeedbackNotice("");
    try {
      await submitClassroomFeedback({ data: {
        facilitatedSessionId, courseAttemptId, questionKey, rating,
      } });
      // Update only after the server confirms the authenticated write.
      setFeedback(previous => previous ? ({
        ...previous,
        rooms: previous.rooms.map(room => room.facilitatedSessionId === facilitatedSessionId
          ? { ...room, ratings: { ...room.ratings, [questionKey]: rating } } : room),
      }) : null);
      setFeedbackNotice("Feedback saved. You may change your rating during the feedback window.");
    } catch {
      setFeedbackError("Your feedback was not saved. Verify your registration and try again.");
    } finally { setFeedbackBusy(""); }
  }

  return <WorkspaceShell width="reading" eyebrow="Classroom Connect"
    title="Learner companion" subtitle="Your device remains linked to your own verified course registration.">
    {!courseAttemptId && <p role="alert">Join with a current facilitator code first.</p>}
    {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
    {courseAttemptId && !data && !error && <p role="status">Checking your room connection…</p>}
    {data?.rooms.map(room => <section key={room.facilitatedSessionId}
      className="mt-4 border border-border bg-card p-5">
      <h2 className="font-serif text-lg font-semibold">Connected to facilitated learning</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {room.latestPlayback
          ? "Latest facilitator playback: " + room.latestPlayback.kind
          : "Waiting for the facilitator to start playback."}
      </p>
      <ClassroomCompanionRoom courseAttemptId={courseAttemptId}
        facilitatedSessionId={room.facilitatedSessionId}/>
      <Button className="mt-4" type="button" variant="outline" disabled={busy}
        onClick={() => void leave(room.facilitatedSessionId)}>Leave room</Button>
    </section>)}
    {data && !data.rooms.length && <p role="status" className="mt-4">
      You are not paired to an active room. You can still rate a recent session below.
    </p>}

    {feedbackError && <p role="alert" className="mt-4 text-sm text-destructive">{feedbackError}</p>}
    {feedbackNotice && <p role="status" className="mt-4 text-sm">{feedbackNotice}</p>}
    {feedback && feedback.rooms.length > 0 && <section
      aria-label="Optional classroom feedback" className="mt-6 border border-border bg-card p-5">
      <h2 className="font-serif text-xl font-semibold">How was your session?</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Optional, identified ratings from 1 (low) to 5 (high). They help improve
        instruction and technology, but never determine attendance, grades or completion.
      </p>
      {feedback.rooms.map(room => <div key={room.facilitatedSessionId}
        className="mt-5 border-t border-border pt-4">
        <p className="text-sm font-medium">
          Session from {new Date(room.startedAt).toLocaleString()}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Feedback available through {new Date(room.feedbackClosesAt).toLocaleDateString()}.
        </p>
        {feedbackQuestions.map(([questionKey, label]) => <fieldset
          key={questionKey} className="mt-4">
          <legend className="text-sm font-medium">{label}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5].map(rating => <Button
              key={rating} type="button" size="sm"
              aria-label={rating + " out of 5: " + label}
              aria-pressed={room.ratings[questionKey] === rating}
              variant={room.ratings[questionKey] === rating ? "default" : "outline"}
              disabled={!!feedbackBusy}
              onClick={() => void rate(room.facilitatedSessionId, questionKey, rating)}>
              {rating}
            </Button>)}
          </div>
        </fieldset>)}
        <ClassroomGovernedLearnerSurveys
          courseAttemptId={courseAttemptId}
          facilitatedSessionId={room.facilitatedSessionId}/>
      </div>)}
    </section>}

    <p className="mt-5 text-xs text-muted-foreground">
      Device pairing and facilitator playback are observations only. They do not
      establish attendance, watched minutes, learning mastery or course completion.
      Feedback is linked to your registration and may be summarized for authorized program staff.
    </p>
    <a href="/join" className="mt-4 inline-block text-sm underline">Join another room</a>
  </WorkspaceShell>;
}
