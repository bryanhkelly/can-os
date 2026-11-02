import { useRef, useState } from "react";
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
  const inFlight = useRef(false);
  const [error, setError] = useState("");
  async function open() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setError("");
    // Reserve the browsing context synchronously so popup blockers do not
    // reject the eventual URL after the authorization request completes.
    let popup: Window | null = null;
    try {
      popup = window.open("", "_blank");
      if (popup) popup.opener = null;
      const url = await onGetDownloadUrl();
      if (popup) {
        popup.location.replace(url);
      } else {
        // Do not redirect the current workspace to a short-lived private URL.
        throw new Error("Allow pop-ups to open the private document");
      }
    } catch (cause) {
      try { popup?.close(); } catch { /* Preserve the authorization error. */ }
      setError(cause instanceof Error ? cause.message : "Unable to open private evidence");
    } finally { inFlight.current = false; setBusy(false); }
  }
  return <div className="mt-2">
    <Button variant="ghost" size="sm" disabled={busy} onClick={() => void open()}>
      {busy ? "Opening…" : label}
    </Button>
    {error && <p role="alert" className="mt-1 text-xs text-danger">{error}</p>}
  </div>;
}
