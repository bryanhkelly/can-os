import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/modules/identity/actors.server";
const mocks = vi.hoisted(() => ({ authorize: vi.fn(), institutional: vi.fn(), row: null as unknown }));
vi.mock("@/modules/learning/class-access.server", () => ({ authorizeClass: mocks.authorize }));
vi.mock("@/modules/identity/institutional-capability.server", () => ({ hasInstitutionalProgramCapability: mocks.institutional }));
vi.mock("@/db/client", () => {
  const chain = { from: () => chain, innerJoin: () => chain, where: () => chain, limit: async () => mocks.row ? [mocks.row] : [] };
  return { db: { select: () => chain } };
});
import { authorizeClassVideoManager } from "@/modules/learning/class-video-access.server";
const actor = (role: Actor["role"]) => ({ role, actorPersonId: "person", capabilities: new Set(["teacher:read"]), scope: {} } as Actor);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.row = { id: "section", programId: "program", siteId: "site", program: { id: "program", siteId: "site" } };
  mocks.institutional.mockResolvedValue(false);
  mocks.authorize.mockResolvedValue({ section: { id: "section" } });
});
describe("class video manager authorization", () => {
  it("delegates teacher relationship and qualification checks to canonical class authorization", async () => {
    expect(await authorizeClassVideoManager(actor("teacher"), "section")).toEqual({ id: "section" });
    expect(mocks.authorize).toHaveBeenCalledWith(actor("teacher"), "section", undefined, undefined);
    expect(mocks.institutional).not.toHaveBeenCalled();
  });
  it.each(["student", "guardian", "site_staff", "counselor"] as const)("rejects %s upload authority", async role => {
    await expect(authorizeClassVideoManager(actor(role), "section")).rejects.toThrow();
    expect(mocks.institutional).not.toHaveBeenCalled();
  });
  it("denies a teacher without the required capability", async () => {
    await expect(authorizeClassVideoManager({ ...actor("teacher"), capabilities: new Set() }, "section")).rejects.toThrow();
    expect(mocks.authorize).not.toHaveBeenCalled();
  });
  it.each(["registrar", "site_admin"] as const)("requires institutional curriculum authority for %s", async role => {
    await expect(authorizeClassVideoManager(actor(role), "section")).rejects.toThrow();
    expect(mocks.institutional.mock.calls.map(call => call[2])).toEqual(["curriculum.publish", "curriculum.adopt"]);
    mocks.institutional.mockResolvedValueOnce(true);
    expect(await authorizeClassVideoManager(actor(role), "section")).toMatchObject({ id: "section" });
    expect(mocks.authorize).not.toHaveBeenCalled();
  });
  it("rejects missing sections and a program/site mismatch", async () => {
    mocks.row = null; mocks.institutional.mockResolvedValue(true);
    await expect(authorizeClassVideoManager(actor("registrar"), "section")).rejects.toThrow();
    mocks.row = { id: "section", siteId: "other-site", program: { siteId: "site" } };
    await expect(authorizeClassVideoManager(actor("site_admin"), "section")).rejects.toThrow();
    expect(mocks.institutional).not.toHaveBeenCalled();
  });
});
