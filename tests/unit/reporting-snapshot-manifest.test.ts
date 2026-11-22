import { describe, expect, it } from "vitest";
import { canonicalReportingSnapshotManifest } from "@/domain/reporting-snapshot-manifest";

const a="11111111-1111-4111-8111-111111111111";
const b="22222222-2222-4222-8222-222222222222";
const c="33333333-3333-4333-8333-333333333333";
const example={
  schemaVersion:1 as const,organizationId:a,siteId:b,
  from:"2026-11-20T00:00:00Z",to:"2026-11-21T00:00:00Z",
  asOf:"2026-11-22T00:00:00Z",
  sources:[{eventId:c,payloadFingerprint:"a".repeat(64),sourceVersion:"1"}],
};

describe("reproducible private source snapshot manifest",()=>{
  it("produces stable canonical manifest bytes",()=>{
    expect(canonicalReportingSnapshotManifest(example))
      .toBe(canonicalReportingSnapshotManifest({...example}));
  });
  it("rejects a changed fingerprint as a different manifest",()=>{
    expect(canonicalReportingSnapshotManifest(example))
      .not.toBe(canonicalReportingSnapshotManifest({...example,
        sources:[{...example.sources[0],payloadFingerprint:"b".repeat(64)}]}));
  });
  it("fails closed on duplicates, incorrect order and invalid time windows",()=>{
    expect(()=>canonicalReportingSnapshotManifest({...example,
      sources:[example.sources[0],example.sources[0]]})).toThrow("Duplicate");
    expect(()=>canonicalReportingSnapshotManifest({...example,
      sources:[{eventId:c,payloadFingerprint:"a".repeat(64),sourceVersion:"1"},
        {eventId:b,payloadFingerprint:"b".repeat(64),sourceVersion:"2"}]}))
      .toThrow("deterministic ordering");
    expect(()=>canonicalReportingSnapshotManifest({...example,to:"2026-11-19T00:00:00Z"}))
      .toThrow("temporal");
  });
});
