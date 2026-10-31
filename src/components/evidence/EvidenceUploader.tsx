import { useState } from "react";

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
  const [error, setError] = useState("");
  async function upload() {
    if (busy || disabled) return;
    setBusy(true); setError("");
    try {
      let attempt = pending;
      if (!attempt) {
        if (!file || !expiry) throw new Error("Choose a document and its actual expiry date");
        if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type))
          throw new Error("Only PDF, JPEG and PNG evidence is supported");
        const input = makeInput(file, new Date(expiry + "T23:59:59.999Z").toISOString());
        const begun = await adapter.begin(input);
        const response = await fetch(begun.uploadUrl, {
          method: "PUT", headers: begun.uploadHeaders, body: file,
        });
        if (!response.ok) throw new Error("Private upload failed; evidence was not recorded");
        attempt = { key: begun.key, input };
        setPending(attempt);
      }
      await adapter.finish({ ...attempt.input, key: attempt.key });
      // Finalization succeeded: never retry the same command if refreshing the view fails.
      setPending(null); setFile(null); setExpiry("");
      try { await onUploaded(); }
      catch (cause) {
        setError(cause instanceof Error ? `Evidence recorded, but refresh failed: ${cause.message}` :
          "Evidence recorded, but the view could not refresh");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Evidence upload was not recorded");
    } finally { setBusy(false); }
  }
  return <div className="mt-3 rounded border p-3 text-xs">
    <div className="grid gap-2 sm:grid-cols-2">
      <label>PDF, JPEG or PNG
        <input type="file" accept="application/pdf,image/jpeg,image/png" className="mt-1 block w-full"
          disabled={disabled || busy} onChange={event => { setFile(event.target.files?.[0] ?? null); setPending(null); }}/>
      </label>
      <label>{label}
        <input type="date" value={expiry} disabled={disabled || busy}
          className="mt-1 block w-full rounded border bg-background p-2"
          onChange={event => { setExpiry(event.target.value); setPending(null); }}/>
      </label>
    </div>
    <button type="button" className="mt-2 rounded border px-3 py-2 disabled:opacity-50"
      disabled={disabled || busy || (!pending && (!file || !expiry))}
      onClick={() => void upload()}>
      {busy ? "Submitting…" : pending ? "Retry recording uploaded evidence" : submitLabel}
    </button>
    {pending && <p role="status" className="mt-2">The private file is uploaded. Retry recording without uploading the bytes again.</p>}
    {error && <p role="alert" className="mt-2 text-danger">{error}</p>}
  </div>;
}
