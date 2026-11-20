import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getBlueprintPlanningContext, isVerifiedCanSitePlanning, assertVerifiedCanPlanningSite,
} from "@/modules/blueprints/verified-site-planning.server";
import type { CommandContext } from "@/domain/command-context";

const mock = vi.hoisted(() => ({
  session: vi.fn(),
  identity: vi.fn(),
  canonical: vi.fn(),
  account: vi.fn(),
}));

vi.mock("@/domain/session-cookies", () => ({readCookie: mock.session}));
vi.mock("@/modules/identity/command-context.server", () => ({getIdentityContext: mock.identity}));
vi.mock("@/modules/identity/canonical-command-context.server", () => ({
  getCanonicalCommandContext: mock.canonical,
}));
vi.mock("@/db/client", () => ({
  db: {select: () => ({from: () => ({where: () => ({limit: () => mock.account()})})})},
}));

const siteId = "22220000-0000-4000-8000-000000000001";
const siblingSiteId = "22220000-0000-4000-8000-000000000002";
const organizationId = "11110000-0000-4000-8000-000000000001";
const otherOrganizationId = "11110000-0000-4000-8000-000000000002";
const request = new Request("https://can-os.example/launch/site");

function siteTransaction(site: {
  id: string; organizationId: string; lifecycleStatus: "planning"|"active"|"closed"|null;
} | null) {
  return {select: () => ({from: () => ({where: () => ({
    limit: async () => site ? [site] : [],
  })})})} as unknown as Parameters<typeof assertVerifiedCanPlanningSite>[0];
}

describe("verified CAN owner: private Blueprint planning security matrix", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.session.mockReturnValue("signed-cookie");
    mock.canonical.mockRejectedValue(new Error("Native fallback must not be used"));
    mock.identity.mockResolvedValue({
      actorPersonId:"33330000-0000-4000-8000-000000000001",
      accountId:"44440000-0000-4000-8000-000000000001",
      sessionAccountId:null, role:"site_admin",
      scope:{organizationIds:[organizationId],siteIds:[siteId]},
      capabilities:new Set(["program.launch.start"]),
    });
    mock.account.mockResolvedValue([{email:"verified@example.com",verifiedAt:new Date(),disabled:false}]);
  });

  it("only server-verified sessions carry the private planning marker", async () => {
    const context = await getBlueprintPlanningContext(request);
    expect(isVerifiedCanSitePlanning(context)).toBe(true);
    expect([...context.capabilities].sort()).toEqual(["blueprint.configure","blueprint.read","program.launch.start"]);
    const forged: CommandContext = {...context};
    expect(isVerifiedCanSitePlanning(forged)).toBe(false);
    await expect(assertVerifiedCanPlanningSite(siteTransaction({
      id:siteId,organizationId,lifecycleStatus:"planning",
    }),forged,siteId)).rejects.toThrow();
  });

  it("requires exact current Site and Organization ownership inside the write transaction", async () => {
    const context=await getBlueprintPlanningContext(request);
    const valid=siteTransaction({id:siteId,organizationId,lifecycleStatus:"planning"});
    await expect(assertVerifiedCanPlanningSite(valid,context,siteId)).resolves.toBe(organizationId);
    await expect(assertVerifiedCanPlanningSite(valid,context,siblingSiteId)).rejects.toThrow();
    await expect(assertVerifiedCanPlanningSite(valid,context,siteId,otherOrganizationId)).rejects.toThrow();
    await expect(assertVerifiedCanPlanningSite(siteTransaction({
      id:siteId,organizationId:otherOrganizationId,lifecycleStatus:"planning",
    }),context,siteId)).rejects.toThrow();
    await expect(assertVerifiedCanPlanningSite(siteTransaction(null),context,siteId)).rejects.toThrow();
  });

  it("supports unclassified legacy private planning but refuses closed Sites", async () => {
    const context=await getBlueprintPlanningContext(request);
    await expect(assertVerifiedCanPlanningSite(siteTransaction({
      id:siteId,organizationId,lifecycleStatus:null,
    }),context,siteId)).resolves.toBe(organizationId);
    await expect(assertVerifiedCanPlanningSite(siteTransaction({
      id:siteId,organizationId,lifecycleStatus:"closed",
    }),context,siteId)).rejects.toThrow();
  });

  it("rejects disabled, unverified, or demo CAN accounts", async () => {
    for(const account of [
      {email:"verified@example.com",verifiedAt:null,disabled:false},
      {email:"verified@example.com",verifiedAt:new Date(),disabled:true},
      {email:"alex.registrar@valorschool.demo",verifiedAt:new Date(),disabled:false},
    ]) {
      mock.account.mockResolvedValueOnce([account]);
      await expect(getBlueprintPlanningContext(request)).rejects.toThrow();
    }
  });

  it("never treats a missing Site grant or multiple Organizations as planning authority", async () => {
    for (const scope of [
      {organizationIds:[organizationId],siteIds:[]},
      {organizationIds:[organizationId,otherOrganizationId],siteIds:[siteId]},
      {organizationIds:[],siteIds:[siteId]},
    ]) {
      mock.identity.mockResolvedValueOnce({
        actorPersonId:"33330000-0000-4000-8000-000000000001",
        accountId:"44440000-0000-4000-8000-000000000001",
        sessionAccountId:null,role:"site_admin",scope,
        capabilities:new Set(["program.launch.start"]),
      });
      await expect(getBlueprintPlanningContext(request)).rejects.toThrow();
    }
  });
});
