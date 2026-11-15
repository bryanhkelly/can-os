import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { classroomJoinPath, displayClassroomCode } from "@/domain/classroom-connect";

/** Local QR rendering: never send short-lived pairing secrets to a third party. */
export function ClassroomConnectQr({ code, expiresAt }: { code: string; expiresAt: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [url, setUrl] = useState("");
  const [qrError, setQrError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [clock, setClock] = useState(0);
  const displayCode = displayClassroomCode(code);
  const expired = clock > 0 && new Date(expiresAt).getTime() <= clock;

  useEffect(() => {
    setUrl(window.location.origin + classroomJoinPath(code));
    setClock(Date.now());
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [code]);

  useEffect(() => {
    if (!url || !canvasRef.current || expired) return;
    let active = true;
    setQrError(false);
    void QRCode.toCanvas(canvasRef.current, url, {
      width: 300, margin: 2, errorCorrectionLevel: "M",
    }).catch(() => { if (active) setQrError(true); });
    return () => { active = false; };
  }, [url, retry, expired]);

  return <div className="mt-4 grid gap-6 border-t border-border pt-4 md:grid-cols-[minmax(0,320px)_1fr]">
    <figure className="flex min-h-72 flex-col items-center justify-center border border-border bg-background p-3">
      {!expired && <canvas ref={canvasRef} role="img"
        className={qrError ? "hidden" : "block"}
        aria-label="Scan to open the Classroom Connect join page" />}
      {expired && <p role="status" className="text-center text-sm">Pairing code expired. Generate a new code.</p>}
      {!expired && qrError && <div className="space-y-2 text-center">
        <p role="status" className="text-sm">QR unavailable. Enter the code at /join.</p>
        <button type="button" className="text-sm underline" onClick={() => setRetry(v => v + 1)}>
          Retry QR rendering
        </button>
      </div>}
    </figure>
    <div className="flex flex-col justify-center">
      <p className="text-sm font-medium">Scan the QR code or enter this pairing code on your own device.</p>
      <p className="mt-3 break-all font-mono text-3xl font-semibold tracking-wider">{expired ? "Expired" : displayCode}</p>
      <p className="mt-3 text-sm text-muted-foreground">
        Code expires at {new Date(expiresAt).toLocaleTimeString()}. A new code replaces the old one.
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        Learners must sign in and use their authorized course attempt. Pairing is not verified attendance.
      </p>
      {!expired && url && <p className="mt-3 break-all text-xs text-muted-foreground">{url}</p>}
    </div>
  </div>;
}
