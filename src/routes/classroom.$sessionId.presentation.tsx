import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ClassroomProjectorPlayer } from "@/components/learning/ClassroomProjectorPlayer";
import { ClassroomConnectQr } from "@/components/learning/ClassroomConnectQr";
import { classroomCodeFromFragment } from "@/domain/classroom-connect";
import { getClassroomPresentationState } from "@/modules/learning/classroom-evidence.functions";

/**
 * Standalone shared screen. Every request is facilitator-authorized; the
 * response contains no learner identity, responses, presence or attendance.
 * An optional QR code is passed via one-time URL fragment, never an HTTP path.
 */
export const Route = createFileRoute("/classroom/$sessionId/presentation")({
  head: () => ({ meta: [{ name: "referrer", content: "no-referrer" }] }),
  component: ClassroomPresentation,
});
function ClassroomPresentation() {
  const { sessionId } = Route.useParams();
  const [pair, setPair] = useState<{ code: string; expiresAt: string } | null>(null);
  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
    const code = classroomCodeFromFragment("#pair=" + (params.get("pair") ?? ""));
    const expiry = params.get("expires");
    // Scrub the pairing code from tab history as soon as it is consumed.
    if (hash.startsWith("#pair=")) {
      window.history.replaceState(window.history.state, "",
        window.location.pathname + window.location.search);
    }
    const exp = expiry ? Date.parse(expiry) : NaN;
    if (code && Number.isFinite(exp) && exp > Date.now() &&
        exp <= Date.now() + 15 * 60_000) {
      setPair({ code, expiresAt: new Date(exp).toISOString() });
    } else setPair(null);
  }, [sessionId]);

  const state = useQuery({
    queryKey: ["classroom-projector-activity", sessionId],
    queryFn: () => getClassroomPresentationState({
      data: { facilitatedSessionId: sessionId },
    }),
    refetchInterval: 8000, staleTime: 0, retry: false,
  });
  const live = state.isSuccess && state.data?.roomState === "live";

  return <main className="min-h-screen bg-background px-4 py-6 md:px-10"
    aria-label="Shared-screen classroom presentation">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
      <div>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          CAN OS · Classroom Connect
        </p>
        <h1 className="font-serif text-3xl font-semibold">
          Facilitated classroom
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Watch together. Answer on your own device.
        </p>
      </div>
      <Button type="button" variant="outline" onClick={() =>
        void document.documentElement.requestFullscreen?.()}>
        Full screen
      </Button>
    </header>
    {state.isPending && <p role="status" className="mt-6">
      Verifying current facilitator and room authority…
    </p>}
    {state.isError && <p role="alert" className="mt-6">
      This classroom presentation is unavailable. Sign in as its authorized facilitator.
    </p>}
    {state.isSuccess && state.data && !live && <p role="status" className="mt-6 border border-border p-5">
      This room is {state.data.roomState}. The presentation is closed.
    </p>}
    {state.isSuccess && state.data && live && <div className="mx-auto mt-6 grid max-w-screen-2xl gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div><ClassroomProjectorPlayer facilitatedSessionId={sessionId}/></div>
      <aside className="space-y-4">
        {pair ? <section className="border border-border bg-card p-4"
          aria-label="Audience join code and QR">
          <h2 className="font-serif text-lg font-semibold">Join on your device</h2>
          <ClassroomConnectQr code={pair.code} expiresAt={pair.expiresAt}/>
        </section> : <section className="border border-border bg-card p-4">
          <h2 className="font-serif text-lg font-semibold">Join on your device</h2>
          <p className="mt-3 text-lg font-semibold">Open /join</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter the current ten-character code shown in the facilitator console.
            To show a new QR here, open this screen from the code panel.
          </p>
        </section>}
        <section className="border border-border bg-card p-5"
          aria-label="Current classroom activity">
          <h2 className="font-serif text-xl font-semibold">Current question</h2>
          {state.data.current ? <div className="mt-4">
            <p className="text-lg font-medium">{state.data.current.prompt}</p>
            {state.data.current.answerType === "single_choice" &&
              <ol className="mt-3 list-inside list-decimal space-y-2">
                {state.data.current.choices.map((choice, index) =>
                  <li key={index} className="text-base">{choice}</li>)}
              </ol>}
            <p className="mt-3 text-sm text-muted-foreground">
              Respond privately on your paired device.
            </p>
          </div> : <p className="mt-3 text-sm text-muted-foreground">
            Waiting for your facilitator to release a question.
          </p>}
        </section>
        <p className="text-xs text-muted-foreground">
          No learner names, raw answers or attendance records are projected.
        </p>
      </aside>
    </div>}
  </main>;
}
