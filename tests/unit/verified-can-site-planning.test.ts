import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessContext } from "@/domain/access-context";
import type { CommandContext } from "@/domain/command-context";

const state = vi.hoisted(() => ({
  cookie: "verified-can-cookie" as string | undefined,
  accountRows: [] as Array<{ email: string; verifiedAt: Date | null; disabled: boolean }>,
  siteRows: [] as Array<{ id: string; organizationId: string; lifecycleStatus: "planning" | "active" | "closed" | null }>,
}));
vi.mock("@/domain/session-cookies", () => ({
  readCookie: vi.fn(() => state.cookie),
}));
vi.mock("@/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => state.accountRows }),
      }),
    }),
  },
}));
vi.mock("@/modules/identity/command-context.server", () => ({
  getIdentityContext: vi.fn(),
}));
vi.mock("@/modules/identity/canonical-command-context.server", () => ({
  getCanonicalCommandContext: vi.fn(),
}));
import { getIdentityContext } from "@/modules/identity/command-context.server";
import { getCanonicalCommandContext } from "@/modules/identity/canonical-command-context.server";
import {
  assertVerifiedCanPlanningSite,
  getBlueprintPlanningContext,
  isVerifiedCanSitePlanning,
} from "@/modules/blueprints/verified-site-planning.server";

const siteId = "10000000-0000-4000-8000-000000000001";
const otherSite = "10000000-0000-4000-8000-000000000002";
const orgId = "20000000-0000-4000-8000-000000000001";
const otherOrg = "20000000-0000-4000-8000-000000000002";
const request = new Request("https://can.example/launch/site");

function canActor(overrides: Partial<AccessContext> = {}): AccessContext {
  return {
    accountId: "30000000-0000-4000-8000-000000000001",
    grantId: "40000000-0000-4000-8000-000000000001",
    sessionId: "50000000-0000-4000-8000-000000000001",
    grantSiteId: siteId,
    actorPersonId: "60000000-0000-4000-8000-000000000001",
    role: "site_admin",
    capabilities: new Set(["program.launch.start"]),
    scope: { organizationIds: [orgId], siteIds: [siteId] },
    ...overrides,
  };
}

function siteTx() {
  return {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => state.siteRows }),
      }),
    }),
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  state.cookie = "verified-can-cookie";
  state.accountRows = [{
    email: "founder@example.org", verifiedAt: new Date("2026-11-19T10:00:00Z"), disabled: false,
  }];
  state.siteRows = [{ id: siteId, organizationId: orgId, lifecycleStatus: "planning" }];
  vi.mocked(getIdentityContext).mockResolvedValue(canActor());
});

describe("verified CAN Site planning authorization", () => {
  it("accepts a verified founder without a second native grant or SQL role", async () => {
    const context = await getBlueprintPlanningContext(request);
    expect(isVerifiedCanSitePlanning(context)).toBe(true);
    expect(context.scope).toEqual({ organizationIds: [orgId], siteIds: [siteId] });
    expect(context.capabilities).toEqual(
      new Set(["blueprint.read", "blueprint.configure", "program.launch.start"]),
    );
    expect(context.capabilities.has("blueprint.review")).toBe(false);
    expect(context.capabilities.has("blueprint.execute")).toBe(false);
    expect(await assertVerifiedCanPlanningSite(siteTx(), context, siteId, orgId)).toBe(orgId);
    expect(getCanonicalCommandContext).not.toHaveBeenCalled();
  });

  it("keeps unauthenticated or non-administrator sessions on their original path", async () => {
    state.cookie = undefined;
    const legacy = { actorPersonId: null, capabilities: new Set(), scope: {} } as CommandContext;
    vi.mocked(getCanonicalCommandContext).mockResolvedValue(legacy);
    expect(await getBlueprintPlanningContext(request)).toBe(legacy);
    expect(isVerifiedCanSitePlanning(legacy)).toBe(false);
    state.cookie = "verified-can-cookie";
    vi.mocked(getIdentityContext).mockResolvedValue(canActor({ role: "guardian" }));
    expect(await getBlueprintPlanningContext(request)).toBe(legacy);
  });

  it("rejects unverified or disabled founders and demo delegation", async () => {
    state.accountRows[0] = { email: "founder@example.org", verifiedAt: null, disabled: false };
    await expect(getBlueprintPlanningContext(request)).rejects.toThrow();
    state.accountRows[0] = { email: "founder@example.org", verifiedAt: new Date(), disabled: true };
    await expect(getBlueprintPlanningContext(request)).rejects.toThrow();
    state.accountRows[0] = { email: "founder@example.org", verifiedAt: new Date(), disabled: false };
    vi.mocked(getIdentityContext).mockResolvedValue(
      canActor({ sessionAccountId: "70000000-0000-4000-8000-000000000001" }),
    );
    await expect(getBlueprintPlanningContext(request)).rejects.toThrow();
  });

  it("rejects another Site, sibling Organization, and closed Sites inside the transaction", async () => {
    const context = await getBlueprintPlanningContext(request);
    await expect(assertVerifiedCanPlanningSite(siteTx(), context, otherSite, orgId)).rejects.toThrow();
    state.siteRows = [{ id: siteId, organizationId: otherOrg, lifecycleStatus: "planning" }];
    await expect(assertVerifiedCanPlanningSite(siteTx(), context, siteId, orgId)).rejects.toThrow();
    state.siteRows = [{ id: siteId, organizationId: orgId, lifecycleStatus: "closed" }];
    await expect(assertVerifiedCanPlanningSite(siteTx(), context, siteId, orgId)).rejects.toThrow();
    state.siteRows = [{ id: siteId, organizationId: orgId, lifecycleStatus: "planning" }];
    await expect(assertVerifiedCanPlanningSite(siteTx(), context, siteId, otherOrg)).rejects.toThrow();
  });

  it("does not accept a spoofed plain command context as verified CAN authority", async () => {
    const untrusted: CommandContext = {
      actorPersonId: "60000000-0000-4000-8000-000000000001",
      role: "site_admin",
      capabilities: new Set(["blueprint.read", "blueprint.configure"]),
      scope: { organizationIds: [orgId], siteIds: [siteId] },
    };
    expect(isVerifiedCanSitePlanning(untrusted)).toBe(false);
    await expect(assertVerifiedCanPlanningSite(siteTx(), untrusted, siteId, orgId)).rejects.toThrow();
  });
});
