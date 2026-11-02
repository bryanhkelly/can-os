import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect, type PgTable } from "drizzle-orm/pg-core";
import type { Database } from "@/db/client";

type Row = Record<string, unknown>;
const state = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>, audit: vi.fn(), event: vi.fn(),
}));
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/platform/mutation", () => ({ writeAudit: state.audit, emitEvent: state.event }));
vi.mock("@/modules/identity/session-grants.server", () => ({
  listDemoSourceGrants: async () => (state.tables.account_person_grants ?? []).flatMap(grant => {
    const account = state.tables.access_accounts?.find(row => row.id === grant.accountId);
    const person = state.tables.people?.find(row => row.id === grant.personId);
    return grant.active && account && !account.disabled && person?.active &&
      ["student", "teacher", "specialist", "guardian", "registrar"].includes(String(grant.role)) &&
      String(account.emailNormalized).endsWith("@valorschool.demo") && account.id !== "f7100000-0000-4000-8000-000000000002"
      ? [{ ...grant, email: account.emailNormalized }] : [];
  }),
}));
import { provisionDemoSchoolAccess, demoRegistrar, demoRegistrarInstitutionalCapabilities } from "@/modules/_demo/provision-demo-registrar";
import { LOCAL_DEMO_ADMIN } from "@/domain/local-demo-access";

const dialect = new PgDialect();
function matches(row: Row, predicate: SQL) {
  const query = dialect.sqlToQuery(predicate);
  const comparisons = [...query.sql.matchAll(/"([^"]+)" (?:= |in \()\$(\d+)/g)];
  if (!comparisons.length) throw new Error(`Unsupported fixture predicate: ${query.sql}`);
  return comparisons.every(match => {
    const key = match[1]!.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
    if (!(key in row)) throw new Error(`Missing fixture field ${key} in ${query.sql}`);
    return row[key] === query.params[Number(match[2]) - 1];
  });
}
// Exercise the real transaction callback against isolated records, including rollback.
const database: Pick<Database, "transaction"> = {
  transaction: vi.fn(async callback => {
    const snapshot = structuredClone(state.tables);
    const tx = {
      execute: vi.fn(),
      transaction: database.transaction,
      select: () => {
        let table: string, predicate: SQL;
        const execute = () => state.tables[table]!.filter(row => matches(row, predicate));
        return {
          from(value: PgTable) { table = getTableName(value); return this; },
          where(value: SQL) { predicate = value; return this; },
          for: async () => execute(),
          then(resolve: (value: Row[]) => unknown, reject: (error: unknown) => unknown) {
            return Promise.resolve().then(execute).then(resolve, reject);
          },
        };
      },
      insert: () => ({
        values() { return this; }, onConflictDoNothing() { return this; },
        returning: async () => [],
      }),
      update: (table: PgTable) => ({
        set(values: Row) {
          return { where: async (predicate: SQL) => {
            for (const row of state.tables[getTableName(table)]!.filter(row => matches(row, predicate))) Object.assign(row, values);
          } };
        },
      }),
    };
    try {
      // The fake implements only the query operations exercised by this bootstrap.
      return await callback(tx as Parameters<Parameters<Database["transaction"]>[0]>[0]);
    } catch (error) {
      state.tables = snapshot;
      throw error;
    }
  }),
};
const sourcePeople = [
  "f1000000-0000-4000-8000-000000000005", "f1000000-0000-4000-8000-000000000006",
  "f4100000-0000-4000-8000-000000000003", "f3000000-0000-4000-8000-000000000007",
];
const emails = ["jordan.student", "riley.teacher", "casey.specialist", "morgan.guardian"];
const roles = ["student", "teacher", "specialist", "guardian"];
beforeEach(() => {
  vi.clearAllMocks();
  const registrars = [demoRegistrar, LOCAL_DEMO_ADMIN];
  state.tables = {
    organizations: [{ id: LOCAL_DEMO_ADMIN.organizationId, metadata: { synthetic: true } }],
    sites: [{ id: LOCAL_DEMO_ADMIN.siteId, organizationId: LOCAL_DEMO_ADMIN.organizationId, metadata: { synthetic: true } }],
    programs: [{ id: "new-program", siteId: LOCAL_DEMO_ADMIN.siteId, organizationId: LOCAL_DEMO_ADMIN.organizationId, metadata: {} }],
    people: [
      ...registrars.map(fixture => ({ id: fixture.personId, active: true, metadata: { synthetic: true } })),
      ...sourcePeople.map(id => ({ id, active: true, metadata: { synthetic: true } })),
    ],
    access_accounts: [
      ...registrars.map(fixture => ({ id: fixture.accountId, emailNormalized: fixture.email, disabled: false })),
      ...emails.map((email, index) => ({ id: `fa000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, emailNormalized: `${email}@can-os.invalid`, disabled: false })),
    ],
    account_person_grants: [
      ...registrars.map(fixture => ({ id: fixture.grantId, accountId: fixture.accountId, personId: fixture.personId,
        role: "registrar", organizationId: fixture.organizationId, siteId: fixture.siteId, active: true })),
      ...sourcePeople.map((personId, index) => ({
        id: `fb000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        accountId: `fa000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        personId, role: roles[index], active: true,
        organizationId: LOCAL_DEMO_ADMIN.organizationId, siteId: LOCAL_DEMO_ADMIN.siteId,
      })),
    ],
    memberships: registrars.map(fixture => ({ personId: fixture.personId, organizationId: fixture.organizationId, metadata: { synthetic: true } })),
    role_assignments: registrars.map(fixture => ({
      id: fixture.roleAssignmentId, personId: fixture.personId, organizationId: fixture.organizationId,
      siteId: fixture.siteId, programId: null, roleKey: "registrar",
      capabilities: [...demoRegistrarInstitutionalCapabilities], metadata: { synthetic: true },
    })),
  };
});
const env = { NODE_ENV: "test", CAN_DEMO_FIXED_ACCESS_ENABLED: "true" };
describe("explicit legacy demo source convergence", () => {
  it("normalizes all four known source addresses without replacing identity or grants", async () => {
    const grants = structuredClone(state.tables.account_person_grants);
    const result = await provisionDemoSchoolAccess(database, env);
    expect(result.changedAccounts).toHaveLength(4);
    expect(state.tables.access_accounts!.slice(2).map(row => row.emailNormalized))
      .toEqual(emails.map(email => `${email}@valorschool.demo`));
    expect(state.tables.account_person_grants).toEqual(grants);
    expect(state.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: "demo.account.switching.provision",
      context: expect.objectContaining({ normalizedAccountIds: result.changedAccounts }),
    }));
    expect((await provisionDemoSchoolAccess(database, env)).changedAccounts).toEqual([]);
  });
  it.each(["disabled", "revoked", "wrong-person", "wrong-tenant", "address-collision", "wrong-address"])(
    "fails closed and rolls back earlier address updates for %s", async scenario => {
      const account = state.tables.access_accounts![5]!;
      const grant = state.tables.account_person_grants![5]!;
      if (scenario === "disabled") account.disabled = true;
      if (scenario === "revoked") grant.active = false;
      if (scenario === "wrong-person") grant.personId = sourcePeople[0];
      if (scenario === "wrong-tenant") grant.organizationId = "other-tenant";
      if (scenario === "wrong-address") account.emailNormalized = "other@example.org";
      if (scenario === "address-collision") state.tables.access_accounts!.push({
        id: "other-account", emailNormalized: "morgan.guardian@valorschool.demo", disabled: false,
      });
      const before = structuredClone(state.tables);
      await expect(provisionDemoSchoolAccess(database, env)).rejects.toThrow();
      expect(state.tables).toEqual(before);
    },
  );
  it("does not bypass revoked memberships on already normalized fixed accounts", async () => {
    state.tables.access_accounts![5]!.emailNormalized = "morgan.guardian@valorschool.demo";
    state.tables.account_person_grants![5]!.active = false;
    const before = structuredClone(state.tables);
    await expect(provisionDemoSchoolAccess(database, env)).rejects.toThrow("membership");
    expect(state.tables).toEqual(before);
  });
  it("rolls back all address changes when transactional audit fails", async () => {
    const before = structuredClone(state.tables);
    state.audit.mockRejectedValueOnce(new Error("audit unavailable"));
    await expect(provisionDemoSchoolAccess(database, env)).rejects.toThrow("audit unavailable");
    expect(state.tables).toEqual(before);
  });
});
