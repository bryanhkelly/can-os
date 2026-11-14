import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { classroomJoinPath, displayClassroomCode } from "@/domain/classroom-connect";

/**
 * Shared-display pairing instructions. QR generation is entirely client-side:
 * the short-lived code is not submitted to an external QR-generation service.
 */
export function ClassroomConnectQr({ code, expiresAt }: { code: string; expiresAt: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [url, setUrl] = useState("");
  const [qrError, setQrError] = useState(false);
  const displayCode = displayClassroomCode(code);

  useEffect(() => {
    setUrl(window.location.origin + classroomJoinPath(code));
  }, [code]);

  useEffect(() => {
    if (!url || !canvasRef.current) return;
    let active = true;
    setQrError(false);
    void QRCode.toCanvas(canvasRef.current, url, {
      width: 300, margin: 2, errorCorrectionLevel: "M",
    }).catch(() => { if (active) setQrError(true); });
    return () => { active = false; };
  }, [url]);

  return <div className="mt-4 grid gap-6 border-t border-border pt-4 md:grid-cols-[minmax(0,320px)_1fr]">
    <figure className="flex min-h-72 items-center justify-center border border-border bg-background p-3">
      {qrError
        ? <p role="status" className="text-center text-sm">QR unavailable. Enter the code at /join.</p>
        : <canvas ref={canvasRef} role="img" aria-label="Scan to open the Classroom Connect join page" />}
    </figure>
    <div className="flex flex-col justify-center">
      <p className="text-sm font-medium">Scan the QR code or enter this pairing code on your own device.</p>
      <p className="mt-3 break-all font-mono text-3xl font-semibold tracking-wider" aria-label={"Classroom code " + displayCode}>
        {displayCode}
      </p>
      <p className="mt-3 text-sm text-muted-foreground">
        Code expires at {new Date(expiresAt).toLocaleTimeString()}. Use “Generate new pairing code” when it expires.
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        Learners must sign in and choose their currently authorized course. Pairing is not verified attendance.
      </p>
      {url && <p className="mt-3 break-all text-xs text-muted-foreground">{url}</p>}
    </div>
  </div>;
}
