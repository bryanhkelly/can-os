import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { submitEvidenceUpload } from "./evidence-upload";
import type { PrivateUpload } from "@/platform/storage/private-upload";
import { mutationErrorMessage } from "@/lib/mutation-feedback";
import {FileSelectionField,UploadedFileNotice} from "./FileSelectionField";

export type EvidenceMimeType = "application/pdf" | "image/jpeg" | "image/png";
export interface EvidenceUploadAdapter<T> {
  begin(input: T): Promise<PrivateUpload>;
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
  const [error, setError] = useState("");
  async function upload() {
    if (inFlight.current || disabled) return;
    inFlight.current = true;
    setBusy(true); setError("");
    try {
      await submitEvidenceUpload(adapter, makeInput, file, expiry, pending, setPending);
      // Finalization succeeded: never retry the same command if refreshing the view fails.
      setPending(null); setFile(null); setExpiry("");
      try { await onUploaded(); }
      catch {
        setError("Evidence recorded, but the view could not refresh. Reopen it before submitting again.");
      }
    } catch (cause) {
      setError(mutationErrorMessage(cause,"Evidence upload was not recorded"));
    } finally { inFlight.current = false; setBusy(false); }
  }
  return <div className="mt-3 rounded border p-3 text-xs">
    <div className="grid gap-2 sm:grid-cols-2">
      <FileSelectionField label="PDF, JPEG or PNG" accept="application/pdf,image/jpeg,image/png"
        file={file} disabled={disabled||busy} onChange={selected=>{setFile(selected);setPending(null);}}/>
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
    {pending && <UploadedFileNotice/>}
    {error && <p role="alert" className="mt-2 text-danger">{error}</p>}
  </div>;
}
