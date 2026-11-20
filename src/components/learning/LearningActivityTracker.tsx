import { Button } from "@/components/ui/button";
import { learnerInteractionInputSchema } from "@/domain/learning-activity-policy";
import { useEffect, useRef, useState } from "react";
import {
  endLearningActivitySession, getLearningActivityHistory,
  recordLearningInteraction, startLearningActivitySession,
} from "@/modules/learning/learning-activity.functions";

type ActivityItem = Awaited<ReturnType<typeof getLearningActivityHistory>>["evidence"][number];
export type ClassLearningVideoController = {
  observeVideo: (kind: "video_opened" | "video_played" | "video_paused" | "video_ended", resourceId: string) => void;
  observeNativeVideo: (durationMs: number) => void;
};

/**
 * A student-only lesson instrument. No passive timer or simulated engagement:
 * only trusted visible keyboard/pointer interactions can submit time estimates.
 * Tracking is nonblocking; failure never marks a lesson complete or changes attendance.
 */
export function LearningActivityTracker({ sectionId, lessonId, controllerRef }: { sectionId: string; lessonId: string; controllerRef?: { current: ClassLearningVideoController | null } }) {
  const [status, setStatus] = useState<"connecting" | "recording" | "unavailable">("connecting");
  const [retry, setRetry] = useState(0);
  const [history, setHistory] = useState<ActivityItem[] | null>(null);
  const [message, setMessage] = useState("");
  const sessionRef = useRef<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    let lastSent = Date.now();
    let mustResume = false;
    sessionRef.current = null;
    setStatus("connecting");
    setHistory(null);
    setMessage("");

    async function record(
      sessionId: string,
      kind: "lesson_opened" | "lesson_resumed" | "engaged_interval" | "resource_opened" | "video_opened" | "video_played" | "video_paused" | "video_ended",
      options?: { durationMs?: number; resourceId?: string },
    ) {
      const base = {
        clientEventId: crypto.randomUUID(), sectionId, lessonId,
        occurredAt: new Date().toISOString(),
      };
      const interaction = learnerInteractionInputSchema.parse(kind === "engaged_interval"
        ? { ...base, kind, durationMs: options?.durationMs ?? 1, pageVisible: true, windowFocused: true }
        : kind === "resource_opened" || kind.startsWith("video_")
          ? { ...base, kind, resourceId: options?.resourceId ?? "" }
          : { ...base, kind });
      // Keep the same client event ID on retries: the server deduplicates
      // successful writes when an acknowledgment is lost.
      for (let attempt = 0; attempt < 3; attempt++) {
        if (cancelled) return;
        try {
          await recordLearningInteraction({ data: { learningSessionId: sessionId, interaction } });
          return;
        } catch (error) {
          if (attempt === 2 || cancelled) throw error;
          await new Promise<void>(resolve => window.setTimeout(resolve, 300 * (attempt + 1)));
        }
      }
    }

    void startLearningActivitySession({ data: { sectionId } })
      .then(async started => {
        if (cancelled) {
          await endLearningActivitySession({ data: { sectionId, learningSessionId: started.learningSessionId } });
          return;
        }
        sessionRef.current = started.learningSessionId;
        await record(started.learningSessionId, "lesson_opened");
        if (!cancelled) setStatus("recording");
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("unavailable");
          setMessage("The learning session could not be saved. Try reconnecting. Your lesson and assignments remain accessible.");
        }
      });

    const recordFailure = () => {
      if (cancelled) return;
      setStatus("unavailable");
      setMessage("Some learning activity could not be saved. Retry tracking to start a new session.");
    };
    const controller: ClassLearningVideoController = {
      observeVideo(kind, resourceId) {
        const id = sessionRef.current;
        if (!id || cancelled || document.visibilityState !== "visible" || !document.hasFocus()) return;
        void record(id, kind, { resourceId }).catch(recordFailure);
      },
      observeNativeVideo(durationMs) {
        const id = sessionRef.current;
        if (!id || cancelled || !Number.isFinite(durationMs) || durationMs < 1000 ||
            document.visibilityState !== "visible" || !document.hasFocus()) return;
        void record(id, "engaged_interval", { durationMs: Math.min(60_000, Math.floor(durationMs)) })
          .catch(recordFailure);
      },
    };
    if (controllerRef) controllerRef.current = controller;
    const onInteraction = (event: Event) => {
      const sessionId = sessionRef.current;
      // Workspace navigation, menus and unrelated app controls never count as
      // learning activity. Only interaction inside the selected lesson qualifies.
      const target = event.target;
      if (!sessionId || !event.isTrusted || !(target instanceof Element) ||
          !target.closest("[data-learning-content]") ||
          document.visibilityState !== "visible" || !document.hasFocus()) return;
      const now = Date.now();
      if (mustResume) {
        mustResume = false;
        lastSent = now;
        void record(sessionId, "lesson_resumed")
          .catch(recordFailure);
        return;
      }
      const elapsed = now - lastSent;
      if (elapsed < 30_000) return;
      lastSent = now;
      // Only foreground interaction at both ends. This is an estimated upper
      // bound on engaged time, not attendance or verified study.
      void record(sessionId, "engaged_interval", { durationMs: Math.min(60_000, elapsed) })
        .catch(recordFailure);
    };
    const onResourceClick = (event: MouseEvent) => {
      const sessionId = sessionRef.current;
      if (!sessionId || !event.isTrusted || !(event.target instanceof Element) ||
          document.visibilityState !== "visible" || !document.hasFocus()) return;
      const trigger = event.target.closest<HTMLElement>("[data-learning-resource-id]");
      if (!trigger?.closest("[data-learning-content]")) return;
      const resourceId = trigger.dataset.learningResourceId;
      if (!resourceId) return;
      // Records a user-initiated access attempt, NOT successful download,
      // reading, watching, mastery, attendance, or earned course credit.
      void record(sessionId, "resource_opened", { resourceId })
        .catch(recordFailure);
    };
    const onVisibilityChange = () => {
      // Never count time spent in a hidden or unfocused page.
      mustResume = true;
      lastSent = Date.now();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onVisibilityChange);
    document.addEventListener("click", onResourceClick);
    document.addEventListener("pointerdown", onInteraction, { passive: true });
    document.addEventListener("keydown", onInteraction);
    return () => {
      cancelled = true;
      if (controllerRef?.current === controller) controllerRef.current = null;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onVisibilityChange);
      document.removeEventListener("click", onResourceClick);
      document.removeEventListener("pointerdown", onInteraction);
      document.removeEventListener("keydown", onInteraction);
      const activeSession = sessionRef.current;
      sessionRef.current = null;
      if (activeSession) {
        void endLearningActivitySession({ data: { sectionId, learningSessionId: activeSession } })
          .catch(() => { /* Server idle expiry remains authoritative. */ });
      }
    };
  }, [sectionId, lessonId, retry, controllerRef]);

  async function loadHistory() {
    try {
      const result = await getLearningActivityHistory({ data: { sectionId } });
      setHistory(result.evidence.slice(0, 15));
      setMessage("");
    } catch {
      setMessage("Your activity history could not be loaded.");
    }
  }

  return <section className="my-4  border p-3 text-sm" aria-label="Learning activity">
    <p className="font-medium">Learning activity</p>
    <p className="mt-1 text-xs text-muted-foreground">
      {status === "recording" ? "Lesson activity is being recorded." :
        status === "connecting" ? "Connecting to the learning activity service…" :
        "Learning activity is not being recorded."}
      {" "}Estimated active time is not attendance, mastery, or a grade.
    </p>
    <Button variant="ghost" type="button" className="mt-2 underline" onClick={() => void loadHistory()}>
      View recent learning history
    </Button>
    {message && <p role={status === "unavailable" ? "alert" : "status"} className="mt-2 text-xs">{message}</p>}
    {status === "unavailable" && <Button type="button" variant="outline" size="sm" onClick={() => setRetry(value => value + 1)}>
      Retry activity tracking
    </Button>}
    {history && <ul className="mt-3 space-y-1 text-xs">
      {history.map(item => <li key={item.id}>
        {item.kind.replaceAll("_", " ")} · {item.lessonId} · {new Date(item.receivedAt).toLocaleString()}
        {item.estimatedActiveMs ? ` · up to ${Math.round(item.estimatedActiveMs / 1000)}s estimated` : ""}
      </li>)}
      {!history.length && <li>No recorded activity yet.</li>}
    </ul>}
  </section>;
}
