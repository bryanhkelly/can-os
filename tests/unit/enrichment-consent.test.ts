import { describe, expect, it } from "vitest";
import { enrichmentConsentContext } from "@/domain/enrichment-consent";

describe("guardian enrichment permission context", () => {
  const original = enrichmentConsentContext("child-a", "household-a", "permission/v1");

  it("keeps a repeat acknowledgement for the same child, household and version", () => {
    expect(enrichmentConsentContext("child-a", "household-a", "permission/v1")).toBe(original);
  });

  it("requires a fresh acknowledgement when the selected child changes", () => {
    expect(enrichmentConsentContext("child-b", "household-a", "permission/v1")).not.toBe(original);
  });

  it("requires a fresh acknowledgement when the household changes", () => {
    expect(enrichmentConsentContext("child-a", "household-b", "permission/v1")).not.toBe(original);
  });

  it("requires a fresh acknowledgement when the published permission version changes", () => {
    expect(enrichmentConsentContext("child-a", "household-a", "permission/v2")).not.toBe(original);
  });
});
