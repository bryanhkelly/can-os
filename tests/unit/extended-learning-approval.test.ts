import { describe, expect, it } from "vitest";
import {
  extendedSeasonApprovalCategories, isCurrentExtendedSeasonApproval,
  type ExtendedSeasonApprovalScope, type ExtendedSeasonDocument,
} from "@/domain/extended-learning-approval";

const scope: ExtendedSeasonApprovalScope = {
  seasonId: "00000000-0000-4000-8000-000000000001",
  programId: "00000000-0000-4000-8000-000000000002",
  siteId: "00000000-0000-4000-8000-000000000003",
  organizationId: "00000000-0000-4000-8000-000000000004",
  academicProviderOrganizationId: "00000000-0000-4000-8000-000000000005",
};
const uploader = "00000000-0000-4000-8000-000000000006";
const reviewer = "00000000-0000-4000-8000-000000000007";
const now = new Date("2027-05-01T12:00:00.000Z");
const base: ExtendedSeasonDocument = {
  subjectType: "activity_season", subjectId: scope.seasonId,
  category: "extended_learning_staffing",
  uploadedByPersonId: uploader, verifiedByPersonId: reviewer,
  verifiedAt: new Date("2027-04-01T00:00:00.000Z"),
  expiresAt: new Date("2027-08-31T00:00:00.000Z"),
  storageProvider: "cloudflare_r2",
  storageKey: `extended-learning/${scope.seasonId}/00000000-0000-4000-8000-000000000008`,
  sensitivityTier: "restricted",
  metadata: { ...scope, reviewStatus: "approved", storageVerified: true,
    isCurrent: true, staffingSignature: "current-roster" },
};
const allowed = new Set([reviewer]);

describe("independent extended season approval evidence", () => {
  it("accepts only current verified, season-bound private approval", () => {
    for (const category of extendedSeasonApprovalCategories)
      expect(isCurrentExtendedSeasonApproval({ ...base, category }, scope, allowed,
        now, "current-roster")).toBe(true);
  });
  it("invalidates expired, superseded, mis-scoped and self-reviewed evidence", () => {
    const invalid: Partial<ExtendedSeasonDocument>[] = [
      { expiresAt: new Date("2027-04-30T00:00:00.000Z") },
      { verifiedAt: null }, { verifiedByPersonId: uploader },
      { storageKey: "fake" }, { storageProvider: "other" },
      { sensitivityTier: "standard" }, { subjectId: scope.programId },
      { metadata: { ...base.metadata, isCurrent: false } },
      { metadata: { ...base.metadata, reviewStatus: "pending" } },
      { metadata: { ...base.metadata, siteId: "different-site" } },
      { metadata: { ...base.metadata, academicProviderOrganizationId: "another" } },
    ];
    for (const change of invalid)
      expect(isCurrentExtendedSeasonApproval({ ...base, ...change },
        scope, allowed, now, "current-roster")).toBe(false);
    expect(isCurrentExtendedSeasonApproval(base, scope, new Set(), now, "current-roster")).toBe(false);
  });
  it("requires a new staffing approval when assigned sessions change", () => {
    expect(isCurrentExtendedSeasonApproval(base, scope, allowed, now, "updated-roster")).toBe(false);
    expect(isCurrentExtendedSeasonApproval({ ...base, category: "extended_learning_emergency" },
      scope, allowed, now, "updated-roster")).toBe(true);
  });
});
