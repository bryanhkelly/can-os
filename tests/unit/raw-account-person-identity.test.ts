import { describe, expect, it } from "vitest";
import {
  assertRawAccountPerson, assertUnambiguousAdultAccount,
} from "@/modules/identity/unambiguous-adult-account.server";

function reader(answers: unknown[][]) {
  const db = { select: () => ({
    from() { return this; },
    where() { return this; },
    limit() { return Promise.resolve(answers.shift() ?? []); },
  }) };
  return db;
}

const account = { personId: "person-a", disabled: false, emailVerifiedAt: new Date() };

describe("raw account-Person invariant", () => {
  it("rejects conflicting raw active membership", async () => {
    await expect(assertRawAccountPerson("account-a", "person-a",
      reader([[{ id: "other-person-grant" }]]) as never)).rejects.toThrow();
  });

  it("requires the authoritative account anchor before adult enrollment", async () => {
    await expect(assertUnambiguousAdultAccount("account-a", "person-a",
      reader([[{ ...account, personId: "person-b" }]]) as never)).rejects.toThrow();
    await expect(assertUnambiguousAdultAccount("account-a", "person-a",
      reader([[{ ...account, disabled: true }]]) as never)).rejects.toThrow();
  });

  it("rejects student roles, conflicting grants, and overflow", async () => {
    for (const grants of [
      [{ personId: "person-a", role: "student" }],
      [{ personId: "person-b", role: "guardian" }],
      Array.from({ length: 101 }, () => ({ personId: "person-a", role: "guardian" })),
    ]) {
      await expect(assertUnambiguousAdultAccount("account-a", "person-a",
        reader([[account], [], grants]) as never)).rejects.toThrow();
    }
  });

  it("allows an active verified single-person adult account", async () => {
    await expect(assertUnambiguousAdultAccount("account-a", "person-a",
      reader([[account], [], [{ personId: "person-a", role: "guardian" }]]) as never)
    ).resolves.toBeUndefined();
  });
});
