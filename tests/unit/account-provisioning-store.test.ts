import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { accessAccounts } from "@/db/schema";
import {
  lockAccountProvisioningEmail,
  provisioningAccountSelection,
  readLockedProvisioningAccount,
} from "@/modules/identity/account-provisioning-store.server";

type Tx = Parameters<typeof lockAccountProvisioningEmail>[0];
const dialect = new PgDialect();
const email = "person@school.org";

describe("canonical provisioning account storage", () => {
  it("uses the existing mailbox advisory-lock namespace and a bound parameter", async () => {
    const execute = vi.fn(async (_query: unknown) => undefined);
    await lockAccountProvisioningEmail({ execute } as unknown as Tx, email);
    expect(execute).toHaveBeenCalledOnce();
    const query = dialect.sqlToQuery(execute.mock.calls[0]![0] as never);
    expect(query.sql).toBe("SELECT pg_advisory_xact_lock(hashtext($1))");
    expect(query.params).toEqual(["person-account:" + email]);
  });

  it("selects only the account projection and locks the existing row", async () => {
    const result = [{ id: "account", personId: "person", disabled: false, privateCredential: true }];
    const limit = vi.fn(async (_count: number) => result);
    const lock = vi.fn((_mode: string) => ({ limit }));
    const where = vi.fn((_predicate: unknown) => ({ for: lock }));
    const from = vi.fn((_table: unknown) => ({ where }));
    const select = vi.fn((_selection: unknown) => ({ from }));
    const rows = await readLockedProvisioningAccount({ select } as unknown as Tx, email);

    expect(select).toHaveBeenCalledWith(provisioningAccountSelection);
    expect(from).toHaveBeenCalledWith(accessAccounts);
    expect(dialect.sqlToQuery(where.mock.calls[0]![0] as never).params).toEqual([email]);
    expect(lock).toHaveBeenCalledWith("update");
    expect(limit).toHaveBeenCalledWith(1);
    expect(rows).toEqual(result);
    expect(Object.keys(provisioningAccountSelection).sort()).toEqual([
      "disabled", "id", "personId", "privateCredential",
    ]);
  });
});
