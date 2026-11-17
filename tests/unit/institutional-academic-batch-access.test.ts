import { describe, expect, it } from "vitest";
import { listInstitutionallyAuthorizedAcademicProgramIds } from
  "@/modules/programs/institutional-academic-authority-read.server";

function reader(rows: unknown[][]) {
  const calls = { count: 0 };
  const db = {
    select: () => ({
      from() { return this; },
      leftJoin() { return this; },
      innerJoin() { return this; },
      where() {
        calls.count += 1;
        return Promise.resolve(rows.shift() ?? []);
      },
    }),
  };
  return { db, calls };
}

const program = {
  id: "program-a", organizationId: "host-a",
  hostOrganizationId: null, siteId: "site-a",
  siteOrganizationId: "host-a", hostType: "school",
  institutionOrganizationId: "institution-a",
  creditIssuingOrganizationId: null,
};
const required = ["academic_instruction", "curriculum"] as const;

describe("institutional batch projection is not a general Program grant", () => {
  it("denies unrelated Programs even when no church agreement is needed", async () => {
    const { db, calls } = reader([[program], [{id:"institution-a",type:"school"}]]);
    const ids = await listInstitutionallyAuthorizedAcademicProgramIds(
      db as never, { role: "teacher", grantSiteId: null, scope: { organizationIds: ["another-institution"] } },
      [program.id], required,
    );
    expect([...ids]).toEqual([]);
    expect(calls.count).toBe(2);
  });

  it("permits only the matching institution for an ordinary Program", async () => {
    const { db } = reader([[program], [{id:"institution-a",type:"school"}]]);
    const ids = await listInstitutionallyAuthorizedAcademicProgramIds(
      db as never, { role: "teacher", grantSiteId: null, scope: { organizationIds: ["institution-a"] } },
      [program.id], required,
    );
    expect([...ids]).toEqual(["program-a"]);
  });

  it("never grants an independent church Program without a reviewed contract", async () => {
    const church = { ...program, hostType: "church",
      institutionOrganizationId: "institution-a" };
    const { db, calls } = reader([
      [church], [{id:"institution-a",type:"can_network"}], [],
    ]);
    const ids = await listInstitutionallyAuthorizedAcademicProgramIds(
      db as never, { scope: { organizationIds: ["institution-a"] } },
      [church.id], required,
    );
    expect([...ids]).toEqual([]);
    expect(calls.count).toBe(3);
  });

  it("rejects a site-scoped teacher or non-teacher caller", async () => {
    const { db } = reader([]);
    await expect(listInstitutionallyAuthorizedAcademicProgramIds(
      db as never, { role: "site_admin", grantSiteId: null,
        scope: { organizationIds: ["institution-a"] } }, [program.id], required,
    )).rejects.toThrow();
    await expect(listInstitutionallyAuthorizedAcademicProgramIds(
      db as never, { role: "teacher", grantSiteId: "site-a",
        scope: { organizationIds: ["institution-a"] } }, [program.id], required,
    )).rejects.toThrow();
  });

  it("cannot grant Programs when the request is empty", async () => {
    const { db, calls } = reader([]);
    const ids = await listInstitutionallyAuthorizedAcademicProgramIds(
      db as never, { scope: { organizationIds: ["institution-a"] } },
      [], required,
    );
    expect(ids.size).toBe(0);
    expect(calls.count).toBe(0);
  });
});
