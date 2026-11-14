import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { joinPathForCode } from "@/domain/classroom-sessions";
import { mutationErrorMessage } from "@/lib/mutation-feedback";
import { Button } from "@/components/ui/button";
import { PageEyebrow, PageFrame, PageTitle } from "@/components/workspace";
import {
  endClassroomSession,
  getClassroomPresentation,
  rotateClassroomJoinCode,
} from "@/modules/learning/classroom-join.functions";

export const Route = createFileRoute("/classroom/$sessionId/presentation")({
  component: ClassroomPresentationPage,
});

/**
 * Facilitator presentation view for one shared screen. Shows only aggregate,
 * non-identifying data: session title, the join code/QR and a learner count.
 */
function ClassroomPresentationPage() {
  const { sessionId } = Route.useParams();
  const queryClient = useQueryClient();
  const presentation = useQuery({
    queryKey: ["classroom-presentation", sessionId],
    queryFn: () => getClassroomPresentation({ data: { sessionId } }),
    refetchInterval: 30_000,
    retry: false,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["classroom-presentation", sessionId] });
  const rotate = useMutation({
    mutationFn: () => rotateClassroomJoinCode({ data: { sessionId } }),
    onSuccess: refresh,
  });
  const end = useMutation({
    mutationFn: () => endClassroomSession({ data: { sessionId } }),
    onSuccess: refresh,
  });

  if (presentation.isPending) {
    return <PageFrame width="wide"><p className="py-16 text-center text-muted-foreground">Loading classroom…</p></PageFrame>;
  }
  if (presentation.isError) {
    return <PageFrame width="wide">
      <div className="py-16 text-center">
        <PageTitle>Classroom unavailable</PageTitle>
        <p className="mt-2 text-muted-foreground">
          {mutationErrorMessage(presentation.error, "Sign in as the session facilitator to present.")}
        </p>
        <Button asChild variant="outline" className="mt-6"><Link to="/">Back to workspace</Link></Button>
      </div>
    </PageFrame>;
  }

  const data = presentation.data;
  const joinUrl = typeof window !== "undefined" && data.code
    ? `${window.location.origin}${joinPathForCode(data.code)}` : null;

  return (
    <PageFrame width="wide" aria-label="Classroom presentation">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <PageEyebrow>CAN Classroom Connect</PageEyebrow>
          <PageTitle>{data.title}</PageTitle>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => rotate.mutate()} disabled={rotate.isPending || data.status !== "open"}>
            {rotate.isPending ? "Rotating…" : "New code"}
          </Button>
          <Button variant="outline" onClick={() => {
            if (window.confirm("End this classroom session? Learners will not be able to join.")) end.mutate();
          }} disabled={end.isPending || data.status !== "open"}>
            {end.isPending ? "Ending…" : "End session"}
          </Button>
        </div>
      </div>

      {data.status !== "open" ? (
        <p className="mt-16 text-center text-2xl font-semibold">
          This session has {data.status === "ended" ? "ended" : "closed"}.
        </p>
      ) : (
        <div className="mt-10 flex flex-col items-center justify-center gap-10 lg:flex-row lg:gap-20">
          <QrPanel url={joinUrl} code={data.code} />
          <section aria-label="Join instructions" className="text-center lg:text-left">
            <p className="text-xl text-muted-foreground">Scan the QR code, or join at</p>
            <p className="mt-2 break-all text-2xl font-semibold text-primary">{joinUrl}</p>
            <p className="mt-8 text-muted-foreground">Then enter the class code:</p>
            <p className="mt-2 text-7xl font-black tracking-widest" aria-label={`Class code ${data.code ?? ""}`}>
              {data.code}
            </p>
            <p className="mt-8 text-2xl" aria-live="polite">
              {data.participantCount} {data.participantCount === 1 ? "learner is" : "learners are"} connected
            </p>
            {data.joinCodeExpiresAt && (
              <p className="mt-2 text-muted-foreground">
                This code refreshes automatically; ask for a new one if it expires.
              </p>
            )}
          </section>
        </div>
      )}

      {(rotate.isError || end.isError) && (
        <p role="alert" className="mt-4 text-destructive">
          {mutationErrorMessage(rotate.error ?? end.error, "Unable to update the session.")}
        </p>
      )}
    </PageFrame>
  );
}

function QrPanel({ url, code }: { url: string | null; code: string | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [qrFailed, setQrFailed] = useState(false);

  useEffect(() => {
    if (!url || !canvasRef.current) return;
    let cancelled = false;
    QRCode.toCanvas(canvasRef.current, url, { width: 360, margin: 2, errorCorrectionLevel: "M" })
      .catch(() => { if (!cancelled) setQrFailed(true); });
    return () => { cancelled = true; };
  }, [url]);

  if (!url) return null;
  return (
    <figure className="rounded-3xl border bg-card p-6 shadow-lg">
      {qrFailed
        ? <p className="flex h-[360px] w-[360px] items-center justify-center p-6 text-center text-muted-foreground">
            QR unavailable — join by entering the code {code} at /join.</p>
        : <canvas ref={canvasRef} aria-label={`QR code to join with class code ${code ?? ""}`} role="img" />}
    </figure>
  );
}
