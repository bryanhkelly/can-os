import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ClassroomGovernedLearnerSurveys } from "@/components/learning/ClassroomGovernedLearnerSurveys";
import { getRecentClassroomFeedback, submitClassroomFeedback } from "@/modules/learning/classroom-feedback.functions";

type QuestionKey = "clarity" | "technology" | "value";
const questions: ReadonlyArray<readonly [QuestionKey, string]> = [
  ["clarity", "Lesson clarity"],
  ["technology", "Technology worked"],
  ["value", "The session was valuable"],
];

/** Reuses canonical feedback and governed invitations in the native Class. */
export function ClassroomFeedbackPanel({ courseAttemptId }: { courseAttemptId: string }) {
  const client = useQueryClient();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const feedback = useQuery({
    queryKey: ["classroom-recent-feedback", courseAttemptId],
    queryFn: () => getRecentClassroomFeedback({ data: { courseAttemptId } }),
    enabled: Boolean(courseAttemptId), staleTime: 0, retry: false,
  });
  async function rate(sessionId: string, questionKey: QuestionKey, rating: number) {
    if (busy) return;
    setBusy(sessionId + ":" + questionKey); setError(""); setNotice("");
    try {
      await submitClassroomFeedback({ data: {
        facilitatedSessionId: sessionId, courseAttemptId, questionKey, rating,
      } });
      client.setQueryData<typeof feedback.data>(["classroom-recent-feedback", courseAttemptId],
        previous => previous ? ({
          ...previous,
          rooms: previous.rooms.map(room => room.facilitatedSessionId === sessionId
            ? { ...room, ratings: { ...room.ratings, [questionKey]: rating } } : room),
        }) : previous);
      setNotice("Feedback saved. Ratings may be changed during the feedback window.");
    } catch {
      setError("Feedback was not saved. Verify your registration and retry.");
    } finally { setBusy(""); }
  }
  return <section className="border border-border bg-card p-4" aria-label="Optional classroom feedback">
    <h3 className="text-base font-semibold">Session feedback and approved surveys</h3>
    <p className="mt-2 text-sm text-muted-foreground">
      Feedback and personally invited surveys use your existing Course Attempt.
      Neither determines attendance, grades or completion.
    </p>
    {feedback.isPending && <p role="status" className="mt-3 text-sm">Checking recent sessions…</p>}
    {feedback.isError && <p role="alert" className="mt-3 text-sm">
      Feedback cannot be verified. <Button size="sm" variant="outline"
        onClick={() => void feedback.refetch()}>Retry</Button>
    </p>}
    {feedback.isSuccess && feedback.data.rooms.length === 0 && <p className="mt-3 text-sm text-muted-foreground">
      No sessions currently qualify for feedback.
    </p>}
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="mt-3 text-sm">{notice}</p>}
    {feedback.isSuccess && feedback.data.rooms.map(room => <div
      className="mt-4 border-t border-border pt-4" key={room.facilitatedSessionId}>
      <p className="text-sm font-medium">Session from {new Date(room.startedAt).toLocaleString()}</p>
      <p className="mt-1 text-xs text-muted-foreground">Feedback through {new Date(room.feedbackClosesAt).toLocaleDateString()}.</p>
      {questions.map(([key, label]) => <fieldset className="mt-3" key={key}>
        <legend className="text-sm font-medium">{label}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5].map(rating => <Button key={rating}
            type="button" size="sm" disabled={!!busy}
            aria-label={rating + " out of 5: " + label}
            aria-pressed={room.ratings[key] === rating}
            variant={room.ratings[key] === rating ? "default" : "outline"}
            onClick={() => void rate(room.facilitatedSessionId, key, rating)}>{rating}</Button>)}
        </div>
      </fieldset>)}
      <ClassroomGovernedLearnerSurveys courseAttemptId={courseAttemptId}
        facilitatedSessionId={room.facilitatedSessionId}/>
    </div>)}
  </section>;
}
