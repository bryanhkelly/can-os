import {
  createContext, useCallback, useContext, useEffect, useRef,
  type ReactNode,
} from "react";
import {
  recordCanonicalLearningEvent, setCanonicalLearningSessionState,
  startCanonicalLearningSession,
} from "@/modules/learning/canonical-learning-activity.functions";
import type { CanonicalLearningEvent } from "@/domain/canonical-learning-activity";

type Kind = CanonicalLearningEvent["kind"];
type ActivityContext = {
  selectLesson: (id: string | null) => void;
  observe: (kind: Kind, lessonId: string | null, resourceId?: string | null) => void;
};
const Context = createContext<ActivityContext | null>(null);

export function useCanonicalLearningActivity(): ActivityContext {
  const value = useContext(Context);
  if (!value) throw new Error("Canonical course activity requires a course session provider");
  return value;
}

function tabInstanceId(courseAttemptId: string): string {
  // A non-secret, tab-scoped instance key persists across reloads, never across devices.
  const key = "can-learning-instance:" + courseAttemptId;
  try {
    const saved = window.sessionStorage.getItem(key);
    if (saved && /^[0-9a-f-]{36}$/i.test(saved)) return saved;
    const next = crypto.randomUUID();
    window.sessionStorage.setItem(key, next);
    return next;
  } catch {
    return crypto.randomUUID();
  }
}

/**
 * Evidence is non-authoritative and never grants attendance, credit or completion.
 * Failing telemetry does not prevent a learner from viewing course content.
 */
export function CanonicalLearningActivityProvider({
  courseAttemptId, children,
}: { courseAttemptId: string; children: ReactNode }) {
  const session = useRef<string | null>(null);
  const lesson = useRef<string | null>(null);
  const lastInteraction = useRef(Date.now());
  const needsResume = useRef(false);
  const operation = useRef<Promise<unknown>>(Promise.resolve());
  const alive = useRef(false);
  const instance = useRef<string | null>(null);

  const serialize = useCallback((work: () => Promise<unknown>) => {
    const next = operation.current.catch(() => undefined).then(work);
    operation.current = next.catch(() => undefined);
    return next;
  }, []);

  const postEvent = useCallback((
    kind: Kind, lessonId: string | null, resourceId: string | null = null,
    durationMs?: number,
  ) => serialize(async () => {
    const id = session.current;
    if (!id || !alive.current) return;
    const event = {
      clientEventId: crypto.randomUUID(),
      kind, lessonId, resourceId, occurredAt: new Date().toISOString(),
      ...(kind === "engaged_interval"
        ? { durationMs, pageVisible: true, windowFocused: true }
        : {}),
    };
    await recordCanonicalLearningEvent({
      data: { courseAttemptId, learningSessionId: id, event },
    });
  }), [courseAttemptId, serialize]);

  const selectLesson = useCallback((id: string | null) => {
    if (lesson.current === id) return;
    lesson.current = id;
    lastInteraction.current = Date.now();
    if (id && session.current && document.visibilityState === "visible")
      void postEvent("lesson_opened", id).catch(() => {});
  }, [postEvent]);

  const observe = useCallback((kind: Kind, lessonId: string | null, resourceId?: string | null) => {
    if (!lessonId || !alive.current ||
      document.visibilityState !== "visible" || !document.hasFocus()) return;
    if (kind === "engaged_interval" || kind === "lesson_opened" || kind === "lesson_resumed") return;
    void postEvent(kind, lessonId, resourceId ?? null).catch(() => {});
  }, [postEvent]);

  useEffect(() => {
    alive.current = true;
    let disposed = false;
    instance.current = tabInstanceId(courseAttemptId);
    void startCanonicalLearningSession({
      data: { courseAttemptId, clientInstanceId: instance.current },
    }).then(result => {
      if (disposed) return;
      session.current = result.learningSessionId;
      lastInteraction.current = Date.now();
      const id = lesson.current;
      if (id && document.visibilityState === "visible")
        void postEvent("lesson_opened", id).catch(() => {});
    }).catch(() => {/* Course remains accessible when tracking is offline. */});

    const pause = () => {
      needsResume.current = true;
      lastInteraction.current = Date.now();
      void serialize(async () => {
        if (!session.current || !alive.current) return;
        await setCanonicalLearningSessionState({
          data: { courseAttemptId, learningSessionId: session.current, action: "pause" },
        });
      }).catch(() => {});
    };
    const resume = () => {
      if (document.visibilityState !== "visible" || !document.hasFocus()) return;
      void serialize(async () => {
        if (!session.current || !alive.current) return;
        const result = await setCanonicalLearningSessionState({
          data: { courseAttemptId, learningSessionId: session.current, action: "resume" },
        });
        if (result.state === "ended") {
          const renewed = await startCanonicalLearningSession({
            data: { courseAttemptId, clientInstanceId: instance.current! },
          });
          session.current = renewed.learningSessionId;
        }
        if (lesson.current) {
          await recordCanonicalLearningEvent({
            data: { courseAttemptId, learningSessionId: session.current!, event: {
              clientEventId: crypto.randomUUID(), kind: "lesson_resumed",
              lessonId: lesson.current, resourceId: null, occurredAt: new Date().toISOString(),
            } },
          });
        }
        needsResume.current = false;
      }).catch(() => {});
    };
    const visibility = () => {
      if (document.visibilityState === "visible") resume();
      else pause();
    };
    const interact = (event: Event) => {
      const target = event.target;
      if (!alive.current || !session.current || !lesson.current || needsResume.current ||
        !event.isTrusted || !(target instanceof Element) ||
        !target.closest("[data-learning-content]") ||
        document.visibilityState !== "visible" || !document.hasFocus()) return;
      const now = Date.now(), elapsed = now - lastInteraction.current;
      if (elapsed < 30_000) return;
      lastInteraction.current = now;
      const lessonId = lesson.current;
      void postEvent("engaged_interval", lessonId, null, Math.min(elapsed, 60_000))
        .catch(() => {});
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", pause);
    window.addEventListener("focus", resume);
    document.addEventListener("pointerdown", interact, { passive: true });
    document.addEventListener("keydown", interact);
    return () => {
      disposed = true;
      alive.current = false;
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("blur", pause);
      window.removeEventListener("focus", resume);
      document.removeEventListener("pointerdown", interact);
      document.removeEventListener("keydown", interact);
      // Preserve a live instance across reloads. Server idle timeout is authoritative.
      const previous = session.current;
      session.current = null;
      if (previous) {
        void setCanonicalLearningSessionState({
          data: { courseAttemptId, learningSessionId: previous, action: "pause" },
        }).catch(() => {});
      }
    };
  }, [courseAttemptId, postEvent, serialize]);

  return <Context.Provider value={{ selectLesson, observe }}>{children}</Context.Provider>;
}
