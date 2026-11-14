import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
  type ReactNode,
} from "react";
import {
  recordCanonicalLearningEvent, setCanonicalLearningSessionState,
  startCanonicalLearningSession,
} from "@/modules/learning/canonical-learning-activity.functions";
import type { CanonicalLearningEvent } from "@/domain/canonical-learning-activity";
import { pruneLearningOutbox, type LearningOutboxItem } from "@/domain/canonical-learning-outbox";

type Kind = CanonicalLearningEvent["kind"];
type ActivityContext = {
  selectLesson: (id: string | null) => void;
  observe: (kind: Kind, lessonId: string | null, resourceId?: string | null) => void;
  observeNativeVideo: (lessonId: string, durationMs: number) => void;
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
  const pending = useRef<LearningOutboxItem[]>([]);
  const [syncPending, setSyncPending] = useState(false);
  const outboxKey = "can-learning-outbox:" + courseAttemptId;
  const persist = useCallback(() => {
    try {
      if (pending.current.length) {
        window.sessionStorage.setItem(outboxKey, JSON.stringify(pending.current));
      } else {
        window.sessionStorage.removeItem(outboxKey);
      }
    } catch { /* Lack of browser storage never blocks the lesson. */ }
  }, [outboxKey]);

  const serialize = useCallback((work: () => Promise<unknown>) => {
    const next = operation.current.catch(() => undefined).then(work);
    operation.current = next.catch(() => undefined);
    return next;
  }, []);

  const flush = useCallback(() => serialize(async () => {
    const id=session.current;
    if(!id || !alive.current || document.visibilityState!=="visible" ||
      !document.hasFocus())return;
    pending.current=pruneLearningOutbox(pending.current,id,new Date());
    persist();
    while(pending.current.length && alive.current && session.current===id){
      const next=pending.current[0]!;
      try {
        await recordCanonicalLearningEvent({
          data:{courseAttemptId,learningSessionId:id,event:next.event},
        });
        pending.current.shift();
        persist();
      }catch {
        setSyncPending(true);
        return;
      }
    }
    if(!pending.current.length)setSyncPending(false);
  }),[courseAttemptId,serialize,persist]);

  const postEvent = useCallback((
    kind: Kind, lessonId: string | null, resourceId: string | null = null,
    durationMs?: number,
  ) => {
    const id=session.current;
    if(!id || !alive.current)return Promise.resolve();
    const event={
      clientEventId:crypto.randomUUID(),
      kind,lessonId,resourceId,occurredAt:new Date().toISOString(),
      ...(kind==="engaged_interval"
        ? {durationMs,pageVisible:true,windowFocused:true}
        : {}),
    } as CanonicalLearningEvent;
    pending.current.push({learningSessionId:id,event});
    pending.current=pruneLearningOutbox(pending.current,id,new Date());
    persist();
    return flush();
  },[flush,persist]);

  const observeNativeVideo=useCallback((lessonId:string,durationMs:number) => {
    if(!lessonId || !alive.current || needsResume.current ||
      document.visibilityState!=="visible" || !document.hasFocus() ||
      !Number.isFinite(durationMs) || durationMs<1000)return;
    lastInteraction.current=Date.now();
    void postEvent("engaged_interval",lessonId,null,
      Math.floor(Math.min(durationMs,60_000))).catch(()=>{});
  },[postEvent]);

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
    session.current = null;
    pending.current=[];
    try {
      const stored=JSON.parse(window.sessionStorage.getItem(outboxKey)??"[]");
      // Restore only bounded, schema-valid observations for this tab.
      if(Array.isArray(stored)) pending.current=stored.slice(-48).flatMap(item=>{
        const event=item?.event;
        return event && typeof event.clientEventId==="string" &&
          typeof item.learningSessionId==="string" ? [item] : [];
      });
    }catch{pending.current=[];}
    let disposed = false;
    instance.current = tabInstanceId(courseAttemptId);
    // A failed initial session request must not disable evidence for the whole
    // lesson. Retry during an open, focused tab; the server deduplicates starts.
    let starting = false;
    const start = async () => {
      if (disposed || starting || session.current ||
          document.visibilityState !== "visible" || !document.hasFocus()) return;
      starting = true;
      try {
        const result = await startCanonicalLearningSession({
          data: { courseAttemptId, clientInstanceId: instance.current! },
        });
        if (disposed) return;
        session.current = result.learningSessionId;
        pending.current=pruneLearningOutbox(pending.current,result.learningSessionId,new Date());
        persist();
        void flush();
        lastInteraction.current = Date.now();
        const id = lesson.current;
        if (id) void postEvent("lesson_opened",id).catch(() => {});
      } catch {
        // Content remains accessible; a future online/focus retry may succeed.
      } finally { starting = false; }
    };
    void start();

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
      if (!needsResume.current || document.visibilityState !== "visible" || !document.hasFocus()) return;
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
        void flush();
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
    const online=()=>{
      if(needsResume.current)return;
      if(session.current)void flush();
      else void start();
    };
    const retry=window.setInterval(online,15_000);
    window.addEventListener("online",online);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", pause);
    window.addEventListener("focus", resume);
    document.addEventListener("pointerdown", interact, { passive: true });
    document.addEventListener("keydown", interact);
    return () => {
      disposed = true;
      alive.current = false;
      window.clearInterval(retry);
      window.removeEventListener("online",online);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("blur", pause);
      window.removeEventListener("focus", resume);
      document.removeEventListener("pointerdown", interact);
      document.removeEventListener("keydown", interact);
      // Do not race the next mount with a late HTTP pause during refresh.
      // The server enforces the 30-minute inactivity window on reuse.
      session.current = null;
    };
  }, [courseAttemptId, postEvent, serialize, outboxKey, persist, flush]);

  return <Context.Provider value={{ selectLesson, observe, observeNativeVideo }}>
    {children}
    {syncPending && <p role="status" className="border-t border-border px-3 py-1 text-xs text-muted-foreground">
      Recent learning observations will retry while this tab remains open.
    </p>}
  </Context.Provider>;
}
