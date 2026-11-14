import { afterEach, describe, expect, it, vi } from "vitest";
import type { CommandContext } from "@/domain/command-context";

const state = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("@/db/client", () => ({ db: { transaction: state.transaction } }));

import { getAvailableOfferings } from "@/modules/programs/program-discovery.server";

const siteId = "00000000-0000-4000-8000-000000000002";
const context: CommandContext = {
  actorPersonId: "00000000-0000-4000-8000-000000000001",
  capabilities: new Set(["program.launch.start"]),
  scope: {
    organizationIds: ["00000000-0000-4000-8000-000000000003"],
    siteIds: [siteId],
  },
};
const discovery = { subject: { kind: "site" as const, siteId }, deliveryContext: "onsite" as const };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("published Offering catalog deployment boundary", () => {
  it("does not touch PostgreSQL when canonical catalog is disabled", async () => {
    vi.stubEnv("CAN_CANONICAL_CATALOG_ENABLED", "false");
    await expect(getAvailableOfferings(context, discovery)).rejects.toThrow(
      "Published program discovery is not yet enabled",
    );
    expect(state.transaction).not.toHaveBeenCalled();
  });

  it("requires exact opt-in rather than truthy environment strings", async () => {
    vi.stubEnv("CAN_CANONICAL_CATALOG_ENABLED", "1");
    await expect(getAvailableOfferings(context, discovery)).rejects.toThrow(
      "Published program discovery is not yet enabled",
    );
    expect(state.transaction).not.toHaveBeenCalled();
  });

  it("denies missing authorization before starting a catalog transaction", async () => {
    vi.stubEnv("CAN_CANONICAL_CATALOG_ENABLED", "true");
    await expect(getAvailableOfferings({
      ...context, capabilities: new Set(),
    }, discovery)).rejects.toThrow("program.launch.start");
    expect(state.transaction).not.toHaveBeenCalled();
  });

  it("permits a provisioned caller to reach the scoped database transaction", async () => {
    vi.stubEnv("CAN_CANONICAL_CATALOG_ENABLED", "true");
    state.transaction.mockResolvedValueOnce([]);
    await expect(getAvailableOfferings(context, discovery)).resolves.toEqual([]);
    expect(state.transaction).toHaveBeenCalledTimes(1);
  });
});
