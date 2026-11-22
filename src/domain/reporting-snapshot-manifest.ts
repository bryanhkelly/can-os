import { z } from "zod";
import { canonicalJson } from "@/lib/canonical-json";

/**
 * Immutable private manifest. Source fingerprints refer to finalized, source-
 * linked reporting receipts. No participant counts or impact claims are
 * inferred from an event manifest.
 */
const uuid = z.string().uuid();
const fingerprint = z.string().regex(/^[0-9a-f]{64}$/);
export const reportingSnapshotManifestSchema = z.object({
  schemaVersion: z.literal(1),
  organizationId: uuid,
  siteId: uuid,
  from: z.string().datetime({offset:true}),
  to: z.string().datetime({offset:true}),
  asOf: z.string().datetime({offset:true}),
  sources: z.array(z.object({
    eventId: uuid,
    payloadFingerprint: fingerprint,
    sourceVersion: z.string().min(1).max(128),
  }).strict()).max(2000),
}).strict();
export type ReportingSnapshotManifest = z.infer<typeof reportingSnapshotManifestSchema>;

/** Stable canonical bytes before SHA-256 signing. */
export function canonicalReportingSnapshotManifest(raw: ReportingSnapshotManifest): string {
  const manifest = reportingSnapshotManifestSchema.parse(raw);
  if (Date.parse(manifest.from) >= Date.parse(manifest.to) ||
      Date.parse(manifest.to) > Date.parse(manifest.asOf)) {
    throw new Error("Invalid reporting snapshot temporal boundaries");
  }
  const keys = manifest.sources.map(r => r.eventId);
  if (new Set(keys).size !== keys.length) {
    throw new Error("Duplicate snapshot source event");
  }
  if (keys.some((value, i) => i > 0 && keys[i-1]! > value)) {
    throw new Error("Snapshot source events must have deterministic ordering");
  }
  return canonicalJson(manifest);
}
