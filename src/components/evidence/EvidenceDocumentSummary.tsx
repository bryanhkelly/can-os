import { EvidenceDocumentLink } from "./EvidenceDocumentLink";

export interface EvidenceDocumentSummaryProps {
  fileName?: string | null;
  version?: number | null;
  expiresAt?: string | null;
  submittedAt?: string | null;
  onGetDownloadUrl: () => Promise<string>;
  downloadLabel?: string;
}

/** A reusable presentation of server-owned document metadata and private access. */
export function EvidenceDocumentSummary({
  fileName, version, expiresAt, submittedAt, onGetDownloadUrl, downloadLabel,
}: EvidenceDocumentSummaryProps) {
  return <div className="mt-3 rounded border p-3 text-xs">
    <p><strong>{version == null ? "Current document" : `Current v${version}`}:</strong> {fileName ?? "Private evidence"}</p>
    <p className="mt-1">
      {submittedAt && <>Submitted {new Date(submittedAt).toLocaleString()} · </>}
      expires {expiresAt ? new Date(expiresAt).toLocaleDateString() : "not recorded"}
    </p>
    <EvidenceDocumentLink label={downloadLabel} onGetDownloadUrl={onGetDownloadUrl}/>
  </div>;
}
