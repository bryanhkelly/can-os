import { describe, expect, it, vi, beforeEach } from "vitest";
import { z } from "zod";
import { AuthorizationError } from "@/domain/command-context";

const mocks = vi.hoisted(() => ({
  getRequest: vi.fn(() => new Request("https://can-os.test/private")),
  setResponseHeader: vi.fn(),
  getCommandContext: vi.fn(),
  withAuth: vi.fn(),
}));

vi.mock("@tanstack/react-start/server", () => ({
  getRequest: mocks.getRequest,
  setResponseHeader: mocks.setResponseHeader,
}));

// Execute the real registered validator and handler without a web server.
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator(validate: (value: unknown) => unknown) {
      return {
        handler(fn: (args: { data: unknown }) => Promise<unknown>) {
          return async ({ data }: { data: unknown }) => fn({ data: validate(data) });
        },
      };
    },
  }),
}));

vi.mock("@/modules/identity/command-context.server", () => ({
  getCommandContext: mocks.getCommandContext,
  withAuth: mocks.withAuth,
}));

import { authenticatedQuery, authenticatedCommand, scopedQuery, institutionalDecision } from "./server-functions";

const schema = z.object({ siteId: z.string().min(1) });
const verified = { actorPersonId: "verified-person", capabilities: new Set(["read"]), scope: { siteIds: ["site-1"] } };

describe("server function factories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCommandContext.mockResolvedValue(verified);
    mocks.withAuth.mockImplementation(async (_request, capability, handler) => {
      if (!verified.capabilities.has(capability)) throw new AuthorizationError(capability);
      return handler(verified);
    });
  });

  it("validates input before execution and never trusts a supplied actor", async () => {
    const handler = vi.fn(async (actor, input) => ({ actor: actor.actorPersonId, siteId: input.siteId }));
    const fn = authenticatedQuery(schema, handler);
    await expect(fn({ data: { siteId: "" } })).rejects.toThrow();
    expect(handler).not.toHaveBeenCalled();
    expect(await fn({ data: { siteId: "site-1", actorPersonId: "forged" } }))
      .toEqual({ actor: "verified-person", siteId: "site-1" });
    expect(mocks.getCommandContext).toHaveBeenCalledWith(expect.any(Request));
    expect(mocks.setResponseHeader).toHaveBeenCalledWith("Cache-Control", "private, no-store");
  });

  it("commands use verified sessions", async () => {
    const fn = authenticatedCommand(schema, async actor => actor.actorPersonId);
    expect(await fn({ data: { siteId: "site-1" } })).toBe("verified-person");
  });

  it("executes capability and resource checks before scoped query", async () => {
    const guard = vi.fn(async () => undefined);
    const read = vi.fn(async () => "ok");
    const fn = scopedQuery(schema, "read", guard, read);
    expect(await fn({ data: { siteId: "site-1" } })).toBe("ok");
    expect(guard).toHaveBeenCalledOnce();
    expect(read).toHaveBeenCalledOnce();
  });

  it("does not execute institutional decisions after authorization denial", async () => {
    const decide = vi.fn(async () => "approved");
    const fn = institutionalDecision(schema, "approve", async () => undefined, decide);
    await expect(fn({ data: { siteId: "site-1" } })).rejects.toThrow();
    expect(decide).not.toHaveBeenCalled();
  });
});
