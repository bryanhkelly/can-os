import { describe, expect, it, vi } from "vitest";
import { memberships, roleAssignments } from "@/db/schema";
import { roleCapabilities } from "@/domain/access-context";
import {
  provisionSiteWebsitePublisherRelationship, siteWebsitePublisherCapabilities,
} from "@/modules/sites/site-publisher-invitation.server";

const input = {
  personId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  organizationId: "dddddddd-dddd-4ddd-8ddd-ddddddddddd1",
  siteId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1",
};

function transaction(membership: unknown[], assignment: unknown[]) {
  const inserts: Array<{ table: unknown; value: any }> = [];
  const tx = {
    select: vi.fn()
      .mockImplementationOnce(() => ({ from: () => ({ where: () => ({ limit: async () => membership }) }) }))
      .mockImplementationOnce(() => ({ from: () => ({ where: () => ({ limit: async () => assignment }) }) })),
    insert: vi.fn((table: unknown) => ({ values: (value: unknown) => {
      inserts.push({ table, value });
      return { returning: async () => [{ id: table === memberships ? "membership-1" : "assignment-1" }] };
    } })),
  };
  return { tx, inserts };
}

describe("exact-Site website publisher invitation relationship", () => {
  it("creates only church-local website capabilities, never CAN institutional authority", async () => {
    const { tx, inserts } = transaction([], []);
    await expect(provisionSiteWebsitePublisherRelationship(tx as never, input)).resolves.toEqual({
      membershipCreated: true, assignmentCreated: true,
    });
    expect(inserts.find(row => row.table === memberships)?.value).toMatchObject({
      personId: input.personId, organizationId: input.organizationId,
    });
    expect(inserts.find(row => row.table === roleAssignments)?.value).toMatchObject({
      personId: input.personId, organizationId: input.organizationId, siteId: input.siteId,
      programId: null, roleKey: "site_website_editor",
      capabilities: ["site.website.draft.read", "site.website.local.publish"],
    });
    expect(siteWebsitePublisherCapabilities).not.toContain("site.publication.manage");
    expect(roleCapabilities.site_website_editor).not.toContain("admin.manage");
    expect(roleCapabilities.site_website_editor).not.toContain("enrollment.decide");
  });

  it("is idempotent for an existing exact membership and narrow assignment", async () => {
    const { tx, inserts } = transaction([{ id: "membership-1" }], [{
      id: "assignment-1", capabilities: [...siteWebsitePublisherCapabilities],
    }]);
    await expect(provisionSiteWebsitePublisherRelationship(tx as never, input)).resolves.toEqual({
      membershipCreated: false, assignmentCreated: false,
    });
    expect(inserts).toEqual([]);
  });

  it("does not silently broaden or repair an unexpected existing assignment", async () => {
    const { tx, inserts } = transaction([{ id: "membership-1" }], [{
      id: "assignment-1", capabilities: ["site.website.draft.read", "site.publication.manage"],
    }]);
    await expect(provisionSiteWebsitePublisherRelationship(tx as never, input))
      .rejects.toThrow(/separate access review/);
    expect(inserts).toEqual([]);
  });
});
