import { describe, expect, it } from "vitest";
import { resolveAccessContext, type VerifiedAccessGrant } from "@/domain/access-context";
import { assertProgramSchoolScope } from "@/domain/pickup-authorization-scope";

const grant: VerifiedAccessGrant = {
  id: "grant-1", accountId: "account-1", personId: "person-1",
  role: "guardian", organizationId: "org-1", siteId: "site-1", active: true,
};
const actor = () => {
  const context = resolveAccessContext(
    { accountId: grant.accountId, sessionId: "session-1", activeGrantId: grant.id }, [grant],
  );
  context.scope.programIds = ["program-1"];
  return context;
};

describe("pickup's exact Organization, Site and Program grant", () => {
  it("allows the current exact scoped program", () => {
    expect(() => assertProgramSchoolScope(actor(), {
      organizationId: "org-1", siteId: "site-1", programId: "program-1",
    })).not.toThrow();
  });

  it("rejects sibling sites, unrelated programs, and missing site ownership", () => {
    const context = actor();
    for (const resource of [
      { organizationId: "org-1", siteId: "site-2", programId: "program-1" },
      { organizationId: "org-1", siteId: "site-1", programId: "program-2" },
      { organizationId: "org-2", siteId: "site-1", programId: "program-1" },
      { organizationId: "org-1", siteId: null, programId: "program-1" },
    ]) expect(() => assertProgramSchoolScope(context, resource)).toThrow();
  });
});
