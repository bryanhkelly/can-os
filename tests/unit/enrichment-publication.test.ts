import { describe, expect, it } from "vitest";
import { assertEnrichmentRegistrationPublished, readEnrichmentPublication } from "@/domain/enrichment-publication";

const published = {
  version: 1 as const, permissionVersion: "camp-2027-1",
  permissionText: "I authorize my child to participate in this supervised enrichment program.",
  approvedByPersonId: "00000000-0000-4000-8000-000000000001",
  publishedAt: "2027-02-01T00:00:00.000Z",
  siteId: "00000000-0000-4000-8000-000000000002",
  programId: "00000000-0000-4000-8000-000000000003",
  seasonId: "00000000-0000-4000-8000-000000000004",
  operationalResponsibilityConfirmed: true as const,
};
const base = {
  programType: "summer_enrichment" as const, programStatus: "active",
  activityStatus: "active", seasonStatus: "registration",
  siteId: published.siteId, programSiteId: published.siteId,
  programId: published.programId, seasonId: published.seasonId,
  creditIssuerId: null,
  metadata: { enrichmentPublication: published },
  consentVersion: published.permissionVersion, acknowledged: true,
};
describe("Enrichment publication contract", () => {
  it("requires an explicitly published, site-bound permission version", () => {
    expect(readEnrichmentPublication(base.metadata)).toEqual(published);
    expect(assertEnrichmentRegistrationPublished(base)).toEqual(published);
    expect(() => assertEnrichmentRegistrationPublished({...base, acknowledged: false})).toThrow(/acknowledge/);
    expect(() => assertEnrichmentRegistrationPublished({...base, consentVersion: "stale"})).toThrow(/acknowledge/);
  });
  it("fails closed on draft/inactive/wrong-site/unpublished/credit-bearing", () => {
    for (const changed of [
      {seasonStatus: "draft"}, {programStatus: "launching"},
      {siteId: "other"}, {metadata: {}}, {creditIssuerId: "issuer"},
      {programType: "full_school"},
    ]) expect(() => assertEnrichmentRegistrationPublished({...base, ...changed})).toThrow();
  });
  it("never accepts loose, unsigned operator flags as publication", () => {
    expect(readEnrichmentPublication({enrichmentPublication: {
      ...published, operationalResponsibilityConfirmed: false,
    }})).toBeNull();
  });
});
