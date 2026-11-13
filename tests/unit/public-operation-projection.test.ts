import { describe, expect, it } from "vitest";
import {
  currentPublicProgramClaimsSchema,
  projectPublicOperation,
  projectPublicSiteClaims,
  publicOperationProjectionInputSchema,
  publicSiteClaimRowsSchema,
  publicSiteProjectionInputSchema,
} from "../../src/domain/public-operation-projection";

const operationId = "00000000-0000-4000-8000-000000000001";

function claim(
  claimId: string,
  programClaimKind: "proposed" | "approved" | "enrolling" | "operating",
  patch: Record<string, unknown> = {},
) {
  return {
    claimId,
    operationId,
    programClaimKind,
    displayText: `${programClaimKind} learning program`,
    publishedAt: new Date("2026-11-12T12:00:00.000Z"),
    ...patch,
  };
}

describe("canonical public Operation projection", () => {
  it("validates the public lookup contract", () => {
    expect(publicOperationProjectionInputSchema.parse({ operationId })).toEqual({ operationId });
    expect(() => publicOperationProjectionInputSchema.parse({ operationId: "not-a-uuid" })).toThrow();
    expect(() => publicOperationProjectionInputSchema.parse({
      operationId,
      includeDrafts: true,
    })).toThrow();
  });

  describe("canonical public Site projection", () => {
    const siteId = "00000000-0000-4000-8000-000000000010";
    const operationId = "00000000-0000-4000-8000-000000000011";

    it("accepts only a valid public slug", () => {
      expect(publicSiteProjectionInputSchema.parse({ slug: "north-school" })).toEqual({
        slug: "north-school",
      });
      expect(() => publicSiteProjectionInputSchema.parse({ slug: "not--valid" })).toThrow();
      expect(() => publicSiteProjectionInputSchema.parse({
        slug: "north-school",
        includeDrafts: true,
      })).toThrow();
    });

    it("keeps an empty published Site distinct from an unresolved slug", () => {
      const rows = publicSiteClaimRowsSchema.parse([{
        siteId,
        siteName: "North School",
        operationId: null,
        programClaimKind: null,
        displayText: null,
        publishedAt: null,
      }]);
      expect(projectPublicSiteClaims(rows)).toEqual({ siteName: "North School", claims: [] });
      expect(projectPublicSiteClaims([])).toBeNull();
    });

    it("projects only public claim fields and sorts them deterministically", () => {
      const rows = publicSiteClaimRowsSchema.parse([
        {
          siteId,
          siteName: "North School",
          operationId,
          programClaimKind: "enrolling",
          displayText: "Middle School",
          publishedAt: "2026-11-12T12:00:00.000Z",
        },
        {
          siteId,
          siteName: "North School",
          operationId,
          programClaimKind: "approved",
          displayText: "Primary School",
          publishedAt: "2026-11-11T12:00:00.000Z",
        },
      ]);

      const projection = projectPublicSiteClaims(rows);
      expect(projection?.claims.map(({ kind }) => kind)).toEqual(["approved", "enrolling"]);
      expect(projection?.claims[0]).not.toHaveProperty("siteId");
      expect(projection?.claims[0]).not.toHaveProperty("sourceAuthorizationDecisionId");
    });

    it("rejects partial claim rows", () => {
      expect(() => publicSiteClaimRowsSchema.parse([{
        siteId,
        siteName: "North School",
        operationId,
        programClaimKind: "approved",
        displayText: null,
        publishedAt: null,
      }])).toThrow();
    });
  });

  it("preserves separate partial-approval claim kinds and omits internal identifiers", () => {
    const rows = currentPublicProgramClaimsSchema.parse([
      claim("00000000-0000-4000-8000-000000000003", "proposed"),
      claim("00000000-0000-4000-8000-000000000002", "enrolling"),
      claim("00000000-0000-4000-8000-000000000004", "approved"),
      claim("00000000-0000-4000-8000-000000000005", "operating"),
    ]);

    const projection = projectPublicOperation(operationId, rows);
    expect(projection.claims.map(({ kind }) => kind)).toEqual([
      "approved",
      "enrolling",
      "operating",
      "proposed",
    ]);
    expect(projection.claims[0]).not.toHaveProperty("claimId");
    expect(projection.claims[0]).not.toHaveProperty("sourceAuthorizationDecisionId");
  });

  it("filters cross-Operation rows and keeps the empty state explicit", () => {
    const rows = currentPublicProgramClaimsSchema.parse([
      claim("00000000-0000-4000-8000-000000000006", "proposed", {
        operationId: "00000000-0000-4000-8000-000000000007",
      }),
    ]);

    expect(projectPublicOperation(operationId, rows)).toEqual({
      operationId,
      claims: [],
    });
  });

  it("rejects malformed rows instead of turning them into a success-shaped empty projection", () => {
    expect(() => currentPublicProgramClaimsSchema.parse([
      claim("00000000-0000-4000-8000-000000000008", "approved", {
        programClaimKind: "draft",
      }),
    ])).toThrow();
  });
});
