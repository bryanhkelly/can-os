import { describe, expect, it, vi } from "vitest";
import {
  createCanonicalSection,
  createHighSchoolExtensionProgram,
  createOrganization,
  createSite,
  createSyntheticPersonaGrant,
  createVerifiedAccessAccount,
  insertFixtureId,
} from "../e2e/helpers/canonical-fixture";
import type { Sql } from "../e2e/fixture";

function sqlReturning(ids: string[]) {
  const query = vi.fn();
  for (const id of ids) query.mockResolvedValueOnce([{ id }]);
  return { sql: { query } as unknown as Sql, query };
}

describe("canonical browser fixture primitives", () => {
  it("builds the hierarchy with explicit host, academic provider and credit issuer", async () => {
    const { sql, query } = sqlReturning(["org-id", "site-id", "program-id", "section-id"]);

    await expect(createOrganization(sql, {
      type: "christian_school", name: "Host", slug: "host",
    })).resolves.toBe("org-id");
    await expect(createSite(sql, {
      organizationId: "org-id", name: "Campus", slug: "campus",
    })).resolves.toBe("site-id");
    await expect(createHighSchoolExtensionProgram(sql, {
      hostOrganizationId: "org-id",
      siteId: "site-id",
      jurisdictionId: "jurisdiction-id",
      academicProviderOrganizationId: "provider-id",
      creditIssuingOrganizationId: "issuer-id",
      name: "Program",
      slug: "program",
    })).resolves.toBe("program-id");
    await expect(createCanonicalSection(sql, {
      programId: "program-id",
      siteId: "site-id",
      courseTemplateVersionId: "version-id",
      code: "SECTION-1",
      title: "Section",
      termId: "term-id",
    })).resolves.toBe("section-id");

    expect(query.mock.calls.map(call => call[0])).toEqual([
      expect.stringContaining("insert into organizations"),
      expect.stringContaining("insert into sites"),
      expect.stringContaining("insert into programs"),
      expect.stringContaining("insert into sections"),
    ]);
    expect(query.mock.calls[2]?.[1]).toEqual([
      "org-id", "site-id", "jurisdiction-id", "Program", "program",
      "org-id", "provider-id", "issuer-id",
    ]);
    expect(query.mock.calls[3]?.[1]).toEqual([
      "program-id", "site-id", "version-id", "SECTION-1", "Section", "term-id",
    ]);
  });

  it("creates verified accounts and explicitly synthetic scoped persona grants", async () => {
    const { sql, query } = sqlReturning(["account-id", "grant-id"]);

    await expect(createVerifiedAccessAccount(sql, "person@can-os.invalid"))
      .resolves.toBe("account-id");
    await expect(createSyntheticPersonaGrant(sql, {
      accountId: "account-id",
      personId: "person-id",
      role: "registrar",
      organizationId: "org-id",
      siteId: "site-id",
    })).resolves.toBe("grant-id");

    expect(query.mock.calls[0]?.[0]).toContain("email_verified_at");
    expect(query.mock.calls[1]?.[0]).toContain("site_id, active");
    expect(query.mock.calls[1]?.[0]).not.toContain("is_synthetic");
    expect(query.mock.calls[1]?.[1]).toEqual([
      "account-id", "person-id", "registrar", "org-id", "site-id",
    ]);
  });

  it("fails setup instead of returning an undefined canonical ID", async () => {
    const query = vi.fn().mockResolvedValue([]);
    await expect(insertFixtureId({ query } as unknown as Sql, "insert into example", []))
      .rejects.toThrow("Insert returned no id");
  });
});
