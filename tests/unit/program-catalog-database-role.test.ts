import { describe, expect, it } from "vitest";
import { programCatalogDatabaseRole } from "../../src/domain/program-catalog-database-role";
import { AuthorizationError } from "../../src/domain/command-context";

describe("program catalog database role", () => {
  it("derives the role from one verified Organization scope", () => {
    expect(programCatalogDatabaseRole({
      scope: { organizationIds: ["A0B1C2D3-E4F5-4678-9012-3456789ABCDE"] },
    })).toBe("can_v30_program_catalog_a0b1c2d3e4f5467890123456789abcde");
  });

  it("rejects absent, ambiguous, or malformed Organization scope", () => {
    for (const organizationIds of [
      undefined,
      [],
      ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"],
      ["not-a-uuid"],
    ]) {
      expect(() => programCatalogDatabaseRole({
        scope: { organizationIds },
      })).toThrow(AuthorizationError);
    }
  });
});
