export type EvidenceSummary = {
  id: string; fileName: string; verifiedAt: string; expiresAt: string | null;
};

/** Authorized metadata only; eligibility and document access stay domain-owned. */
export function EvidenceDetails({ evidence }: { evidence: EvidenceSummary }) {
  return <div className="mt-2 text-xs">
    <p className="font-medium">{evidence.fileName}</p>
    <p role="status">
      Verified: {evidence.verifiedAt} · {evidence.expiresAt
        ? "Expires: " + evidence.expiresAt : "No recorded expiry"}
    </p>
  </div>;
}
