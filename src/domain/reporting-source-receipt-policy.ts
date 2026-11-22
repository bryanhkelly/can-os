/**
 * Deterministic classification used by the durable reporting projection.
 * It operates on digest values only; source data stays in domain_events.
 */
export type SourceReceiptSignature = { payloadFingerprint: string };
export type SourceReceiptDisposition = "accepted" | "duplicate";

export function determineSourceReceiptDisposition(
  prior: SourceReceiptSignature | null,
  incoming: SourceReceiptSignature,
): SourceReceiptDisposition {
  if (!incoming.payloadFingerprint || !/^[0-9a-f]{64}$/.test(incoming.payloadFingerprint)) {
    throw new Error("Invalid canonical reporting source fingerprint");
  }
  if (!prior) return "accepted";
  if (prior.payloadFingerprint !== incoming.payloadFingerprint) {
    throw new Error("Conflicting source revision: canonical event payload differs");
  }
  return "duplicate";
}
