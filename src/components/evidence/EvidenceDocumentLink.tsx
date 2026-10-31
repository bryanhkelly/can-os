import { useState } from "react";
import { Button } from "@/components/ui/button";

export interface EvidenceDocumentLinkProps {
  label?: string;
  onGetDownloadUrl: () => Promise<string>;
}

/** Retrieves a fresh, authorized private URL at click time; never stores it in the DOM. */
export function EvidenceDocumentLink({
  label = "Open private document", onGetDownloadUrl,
}: EvidenceDocumentLinkProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function open() {
    if (busy) return;
    setBusy(true); setError("");
    // Reserve the browsing context synchronously so popup blockers do not
    // reject the eventual URL after the authorization request completes.
    const popup = window.open("", "_blank");
    try {
      const url = await onGetDownloadUrl();
      if (popup) {
        popup.opener = null;
        popup.location.replace(url);
      } else {
        // Do not redirect the current workspace to a short-lived private URL.
        throw new Error("Allow pop-ups to open the private document");
      }
    } catch (cause) {
      popup?.close();
      setError(cause instanceof Error ? cause.message : "Unable to open private evidence");
    } finally { setBusy(false); }
  }
  return <div className="mt-2">
    <Button variant="ghost" size="sm" disabled={busy} onClick={() => void open()}>
      {busy ? "Opening…" : label}
    </Button>
    {error && <p role="alert" className="mt-1 text-xs text-danger">{error}</p>}
  </div>;
}
