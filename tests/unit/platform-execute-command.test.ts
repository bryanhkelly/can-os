import { describe, expect, it, vi } from "vitest";
import { executeCommand } from "../../src/platform/execute-command";
import type { CommandContext } from "../../src/domain/command-context";

const actor: CommandContext = {
  actorPersonId: "person-1",
  capabilities: new Set(["records:update"]),
  scope: { siteIds: ["site-1"] },
};

describe("shared command execution boundary", () => {
  it("executes with verified context and records audit within transaction", async () => {
    const events: string[] = [];
    const result = await executeCommand({ value: 2 }, {
      authenticate: async () => { events.push("authenticate"); return actor; },
      capability: "records:update",
      validate: input => { events.push("validate"); return input.value; },
      authorize: async () => { events.push("authorize"); },
      transaction: async work => { events.push("begin"); const value = await work({}); events.push("commit"); return value; },
      execute: async (_, __, input) => { events.push("execute"); return input * 2; },
      audit: async () => { events.push("audit"); },
    });
    expect(result).toBe(4);
    expect(events).toEqual(["authenticate", "validate", "authorize", "begin", "execute", "audit", "commit"]);
  });

  it("denies missing capability before validation and writes", async () => {
    const validate = vi.fn((input: number) => input);
    const transaction = vi.fn(async (work: (tx: object) => Promise<number>) => work({}));
    await expect(executeCommand(1, {
      authenticate: async () => ({ ...actor, capabilities: new Set<string>() }),
      capability: "records:update", validate, transaction,
      execute: async () => 1,
      audit: async () => undefined,
    })).rejects.toThrow();
    expect(validate).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("uses the feature-owned idempotency adapter rather than executing twice", async () => {
    const stored = new Map<string, number>();
    const execute = vi.fn(async () => 12);
    const options = {
      authenticate: async () => actor,
      capability: "records:update",
      validate: (input: number) => input,
      transaction: async (work: (tx: object) => Promise<number>) => work({}),
      execute,
      audit: async () => undefined,
      idempotency: {
        key: (_: CommandContext, input: number) => `record:${input}`,
        run: async (_: object, key: string, work: () => Promise<number>) => {
          if (stored.has(key)) return stored.get(key)!;
          const result = await work();
          stored.set(key, result);
          return result;
        },
      },
    };
    expect(await executeCommand(8, options)).toBe(12);
    expect(await executeCommand(8, options)).toBe(12);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("propagates audit failure without claiming success", async () => {
    await expect(executeCommand(1, {
      authenticate: async () => actor,
      capability: "records:update",
      validate: input => input,
      transaction: async work => work({}),
      execute: async () => "written",
      audit: async () => { throw new Error("audit unavailable"); },
    })).rejects.toThrow("audit unavailable");
  });
});
