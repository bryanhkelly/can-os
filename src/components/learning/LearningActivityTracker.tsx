import { Button } from "@/components/ui/button";
import { learnerInteractionInputSchema } from "@/domain/learning-activity-policy";
import { useEffect, useRef, useState } from "react";
import {
  endLearningActivitySession, getLearningActivityHistory,
  recordLearningInteraction, startLearningActivitySession,
} from "@/modules/learning/learning-activity.functions";

type ActivityItem = Awaited<ReturnType<typeof getLearningActivityHistory>>["evidence"][number];
type Kind = "lesson_opened" | "lesson_resumed" | "engaged_interval" | "resource_opened" |
  "video_opened" | "video_played" | "video_paused" | "video_ended";
type TrackingState = "connecting" | "recording" | "unavailable";
export type ClassLearningVideoController = {
  observeVideo: (kind: "video_opened" | "video_played" | "video_paused" | "video_ended", resourceId: string) => void;
  observeNativeVideo: (durationMs: number) => void;
};

const MAX_PENDING_EVENTS = 48;

/**
 * Student-only, Section-scoped observation. No passive timer, playback completion
 * credit, or grades. The session is declared recording only after the initial
 * lesson_opened event is durably acknowledged. Writes are serialized to preserve
 * receivedAt ordering and prevent overlapping active-time accounting.
 */
export function LearningActivityTracker({ sectionId, lessonId, controllerRef }: {
  sectionId: string; lessonId: string;
  controllerRef?: { current: ClassLearningVideoController | null };
}) {
  const [status, setStatus] = useState<TrackingState>("connecting");
  const [retry, setRetry] = useState(0);
  const [history, setHistory] = useState<ActivityItem[] | null>(null);
  const [message, setMessage] = useState("");
  const sessionRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let failed = false;
    let currentStatus: TrackingState = "connecting";
    let activeSession: string | null = null;
    let tail: Promise<void> = Promise.resolve();
    let pendingCount = 0;
    let lastPointerAt = Date.now();
    let needsResume = false;
    let videoPlaying = false;
    sessionRef.current = null;
    setStatus("connecting");
    setHistory(null);
    setMessage("");

    function fail(messageText = "Some activity could not be saved. Try reconnecting.") {
      if (cancelled || failed) return;
      failed = true;
      currentStatus = "unavailable";
      setStatus("unavailable");
      setMessage(messageText + " Your lesson remains accessible.");
      const id = activeSession;
      sessionRef.current = null;
      activeSession = null;
      // Do not race queued writes. The server also enforces idle expiry and
      // rejects writes to a closed session.
      if (id) void tail.finally(() =>
        endLearningActivitySession({ data: { sectionId, learningSessionId: id } })
      ).catch(() => {});
    }

    function enqueue(kind: Kind, options?: { durationMs?: number; resourceId?: string }): Promise<void> {
      if (cancelled || failed || !activeSession || pendingCount >= MAX_PENDING_EVENTS) {
        if (!cancelled && !failed && pendingCount >= MAX_PENDING_EVENTS)
          fail("Activity queue capacity was reached.");
        return Promise.resolve();
      }
      const sessionId = activeSession;
      const base = {
        clientEventId: crypto.randomUUID(), sectionId, lessonId,
        occurredAt: new Date().toISOString(),
      };
      const event = learnerInteractionInputSchema.parse(kind === "engaged_interval"
        ? { ...base, kind, durationMs: options?.durationMs ?? 1, pageVisible: true, windowFocused: true }
        : kind === "resource_opened" || kind.startsWith("video_")
          ? { ...base, kind, resourceId: options?.resourceId ?? "" }
          : { ...base, kind });
      pendingCount++;
      const task = tail.then(async () => {
        if (cancelled || failed || activeSession !== sessionId) return;
        for (let attempt = 0; attempt < 3; attempt++) {
          if (cancelled || failed || activeSession !== sessionId) return;
          try {
            await recordLearningInteraction({ data: { learningSessionId: sessionId, interaction: event } });
            return;
          } catch (error) {
            if (attempt === 2) throw error;
            await new Promise<void>(resolve => window.setTimeout(resolve, 300 * (attempt + 1)));
          }
        }
      });
      // A failed write blocks all later observations. Each idempotent retry
      // keeps exactly the same event UUID and request digest.
      tail = task.then(() => {}, () => {});
      return task.then(() => { pendingCount--; }, () => {
        pendingCount--;
        fail();
      });
    }

    void startLearningActivitySession({ data: { sectionId } }).then(async started => {
      if (cancelled) {
        await endLearningActivitySession({ data: { sectionId, learningSessionId: started.learningSessionId } })
          .catch(() => {});
        return;
      }
      activeSession = started.learningSessionId;
      sessionRef.current = started.learningSessionId;
      await enqueue("lesson_opened");
      if (!cancelled && !failed) {
        currentStatus = "recording";
        setStatus("recording");
      }
    }).catch(() => fail("The learning session could not be started."));

    const controller: ClassLearningVideoController = {
      observeVideo(kind, resourceId) {
        if (cancelled || failed || currentStatus !== "recording" ||
            document.visibilityState !== "visible" || !document.hasFocus()) return;
        if (kind === "video_played") videoPlaying = true;
        if (kind === "video_paused" || kind === "video_ended") videoPlaying = false;
        // Resume pointer estimation only after video interaction ends;
        // never count a video heartbeat and pointer interval for the same time.
        lastPointerAt = Date.now();
        void enqueue(kind, { resourceId });
      },
      observeNativeVideo(durationMs) {
        if (cancelled || failed || currentStatus !== "recording" ||
            !Number.isFinite(durationMs) || durationMs < 1_000 ||
            document.visibilityState !== "visible" || !document.hasFocus()) return;
        // This callback is emitted only by verified advancing native media.
        // After a focus transition it reestablishes native playback as the
        // active accounting source without trusting passive wall-clock time.
        videoPlaying = true;
        lastPointerAt = Date.now();
        void enqueue("engaged_interval", { durationMs: Math.min(60_000, Math.floor(durationMs)) });
      },
    };
    if (controllerRef) controllerRef.current = controller;

    const onInteraction = (event: Event) => {
      if (cancelled || failed || currentStatus !== "recording" || videoPlaying ||
          !event.isTrusted || !(event.target instanceof Element) ||
          !event.target.closest("[data-learning-content]") ||
          event.target.closest("[data-learning-video-player]") ||
          document.visibilityState !== "visible" || !document.hasFocus()) return;
      const now = Date.now();
      if (needsResume) {
        needsResume = false;
        lastPointerAt = now;
        void enqueue("lesson_resumed");
        return;
      }
      const elapsed = now - lastPointerAt;
      if (elapsed < 30_000) return;
      lastPointerAt = now;
      void enqueue("engaged_interval", { durationMs: Math.min(60_000, elapsed) });
    };
    const onResourceClick = (event: MouseEvent) => {
      if (cancelled || failed || currentStatus !== "recording" || !event.isTrusted ||
          !(event.target instanceof Element) ||
          document.visibilityState !== "visible" || !document.hasFocus()) return;
      const trigger = event.target.closest<HTMLElement>("[data-learning-resource-id]");
      if (!trigger?.closest("[data-learning-content]") ||
          trigger.closest("[data-learning-video-player]")) return;
      const resourceId = trigger.dataset.learningResourceId;
      if (resourceId) void enqueue("resource_opened", { resourceId });
    };
    const onVisibilityChange = () => {
      needsResume = true;
      videoPlaying = false;
      lastPointerAt = Date.now();
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
      const closingSession = activeSession;
      activeSession = null;
      sessionRef.current = null;
      if (closingSession) void tail.finally(() =>
        endLearningActivitySession({ data: { sectionId, learningSessionId: closingSession } })
      ).catch(() => {});
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

  return <section className="my-4 border p-3 text-sm" aria-label="Learning activity">
    <p className="font-medium">Learning activity</p>
    <p className="mt-1 text-xs text-muted-foreground">
      {status === "recording" ? "Lesson activity is being recorded." :
        status === "connecting" ? "Connecting to learning activity…" :
        "Learning activity is not being recorded."}
      {" "}Estimated active time is not attendance, mastery, or a grade.
    </p>
    <Button variant="ghost" type="button" className="mt-2 underline" onClick={() => void loadHistory()}>
      View recent learning history
    </Button>
    {message && <p role={status === "unavailable" ? "alert" : "status"} className="mt-2 text-xs">{message}</p>}
    {status === "unavailable" && <Button type="button" variant="outline" size="sm"
      onClick={() => setRetry(value => value + 1)}>Retry activity tracking</Button>}
    {history && <ul className="mt-3 space-y-1 text-xs">
      {history.map(item => <li key={item.id}>
        {item.kind.replaceAll("_", " ")} · {item.lessonId} · {new Date(item.receivedAt).toLocaleString()}
        {item.estimatedActiveMs ? ` · up to ${Math.round(item.estimatedActiveMs / 1000)}s estimated` : ""}
      </li>)}
      {!history.length && <li>No recorded activity yet.</li>}
    </ul>}
  </section>;
}
