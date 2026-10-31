import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { submitEvidenceUpload } from "./evidence-upload";

export type EvidenceMimeType = "application/pdf" | "image/jpeg" | "image/png";
export interface EvidenceUploadAdapter<T> {
  begin(input: T): Promise<{ key: string; uploadUrl: string; uploadHeaders: Record<string, string> }>;
  finish(input: T & { key: string }): Promise<unknown>;
}
export interface EvidenceUploaderProps<T extends { fileName: string; mimeType: EvidenceMimeType; size: number; expiresAt: string }> {
  adapter: EvidenceUploadAdapter<T>;
  makeInput: (file: File, expiresAt: string) => T;
  onUploaded: () => Promise<void> | void;
  disabled?: boolean;
  label?: string;
  submitLabel?: string;
}
/** The adapter delegates begin/finalize to canonical server commands. */
export function EvidenceUploader<T extends { fileName: string; mimeType: EvidenceMimeType; size: number; expiresAt: string }>({
  adapter, makeInput, onUploaded, disabled = false, label = "Evidence expires on",
  submitLabel = "Submit for review",
}: EvidenceUploaderProps<T>) {
  const [file, setFile] = useState<File | null>(null);
  const [expiry, setExpiry] = useState("");
  const [pending, setPending] = useState<{ key: string; input: T } | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  async function upload() {
    if (inFlight.current || disabled) return;
    inFlight.current = true;
    setBusy(true); setError("");
    try {
      await submitEvidenceUpload(adapter, makeInput, file, expiry, pending, setPending);
      // Finalization succeeded: never retry the same command if refreshing the view fails.
      setPending(null); setFile(null); setExpiry("");
      if (fileInput.current) fileInput.current.value = "";
      try { await onUploaded(); }
      catch (cause) {
        setError(cause instanceof Error ? `Evidence recorded, but refresh failed: ${cause.message}` :
          "Evidence recorded, but the view could not refresh");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Evidence upload was not recorded");
    } finally { inFlight.current = false; setBusy(false); }
  }
  return <div className="mt-3 rounded border p-3 text-xs">
    <div className="grid gap-2 sm:grid-cols-2">
      <label>PDF, JPEG or PNG
        <input ref={fileInput} type="file" accept="application/pdf,image/jpeg,image/png" className="mt-1 block w-full"
          disabled={disabled || busy} onChange={event => { setFile(event.target.files?.[0] ?? null); setPending(null); }}/>
      </label>
      <label>{label}
        <input type="date" value={expiry} disabled={disabled || busy}
          className="mt-1 block w-full rounded border bg-background p-2"
          onChange={event => { setExpiry(event.target.value); setPending(null); }}/>
      </label>
    </div>
    <Button type="button" variant="outline" size="sm" className="mt-2"
      disabled={disabled || busy || (!pending && (!file || !expiry))}
      onClick={() => void upload()}>
      {busy ? "Submitting…" : pending ? "Retry recording uploaded evidence" : submitLabel}
    </Button>
    {pending && <p role="status" className="mt-2">The private file is uploaded. Retry recording without uploading the bytes again.</p>}
    {error && <p role="alert" className="mt-2 text-danger">{error}</p>}
  </div>;
}
