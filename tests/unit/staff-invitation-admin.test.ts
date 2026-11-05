import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  accessAccounts, accountPersonGrants, auditEvents, domainEvents, memberships, people, roleAssignments,
} from "@/db/schema";
import { EventTypes } from "@/domain/event-types";

const state = vi.hoisted(() => ({
  handlers: [] as Array<(input: { data: any }) => Promise<any>>,
  selects: [] as unknown[][],
  inserts: [] as Array<{ table: unknown; value: any }>,
  requestAccess: vi.fn(),
  transactions: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      validator: () => builder,
      handler: (handler: (input: { data: any }) => Promise<any>) => { state.handlers.push(handler); return builder; },
    };
    return builder;
  },
}));
vi.mock("@/modules/identity/actors.server", () => ({
  requireActor: vi.fn(async () => actor),
  recordAudit: vi.fn(async (tx, _actor, entry) => {
    await tx.insert(auditEvents).values({ action: entry.action, resourceId: entry.resourceId });
  }),
}));
vi.mock("@/modules/identity/passwordless-access.server", () => ({ requestOneTimeAccessWithDeliveryStatus: state.requestAccess }));
vi.mock("@/modules/operations/onsite-block-safety.server", () => ({ verifiedAdultSafetyEvidence: vi.fn() }));

const actor = {
  actorPersonId: "99999999-9999-4999-8999-999999999999", accountId: "99999999-9999-4999-8999-999999999998",
  sessionId: "session", grantId: "registrar-grant", role: "registrar", grantSiteId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1",
  capabilities: new Set(["admin.manage"]),
  scope: { organizationIds: ["dddddddd-dddd-4ddd-8ddd-ddddddddddd1"], siteIds: ["eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1"] },
};
const db = {
  select: vi.fn(() => {
    const rows = state.selects.shift() ?? [];
    const query = {
      innerJoin: () => query,
      where: () => ({ limit: async () => rows }),
    };
    return { from: () => query };
  }),
  insert: vi.fn((table: unknown) => ({ values: (value: unknown) => {
    state.inserts.push({ table, value });
    const id = table === accessAccounts ? "account-1" : table === people ? "person-1" : table === accountPersonGrants ? "grant-1" : "event-1";
    return {
      returning: async () => [{ id }],
      then: (resolve: (value: unknown) => unknown) => resolve(undefined),
    };
  } })),
  execute: vi.fn(async () => undefined),
  transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(db)),
};
vi.mock("@/db/client", () => ({ get db() { return db; } }));

import "@/modules/identity/admin.functions";

const input = {
  email: "Director@Example.test", firstName: "Local", lastName: "Director", role: "site_leader",
  siteId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1",
};

beforeEach(() => {
  actor.role = "registrar";
  state.selects.length = 0; state.inserts.length = 0;
  state.requestAccess.mockReset(); state.requestAccess.mockResolvedValue("dispatched");
  db.select.mockClear(); db.insert.mockClear(); db.transaction.mockClear();
});

describe("authorized church-local invitation provisioning", () => {
  it("creates only an inactive exact-site grant and sends the canonical access link", async () => {
    state.selects.push(
      [{ siteId: actor.grantSiteId }],
      [{ id: input.siteId, organizationType: "church" }],
      [], [], [],
    );

    const result = await state.handlers[3]!({ data: input });

    expect(result).toMatchObject({ created: true, pending: true, emailSent: true, grantId: "grant-1" });
    expect(state.inserts.find(row => row.table === accountPersonGrants)?.value).toMatchObject({
      accountId: "account-1", personId: "person-1", role: "site_leader",
      organizationId: actor.scope.organizationIds[0], siteId: input.siteId, active: false,
    });
    expect(state.inserts.find(row => row.table === domainEvents)?.value).toMatchObject({
      eventType: EventTypes.StaffInvitationIssued, aggregateId: "grant-1",
    });
    expect(state.inserts.some(row => row.table === auditEvents && row.value.action === "admin.staff_invitation.issued")).toBe(true);
    expect(state.requestAccess).toHaveBeenCalledWith("director@example.test", undefined);
  });

  it("returns an invited teacher to their professional profile after secure sign-in", async () => {
    state.selects.push(
      [{ siteId: actor.grantSiteId }],
      [{ id: input.siteId, organizationType: "church" }],
      [], [], [],
    );

    await state.handlers[3]!({ data: { ...input, role: "teacher" } });

    expect(state.requestAccess).toHaveBeenCalledWith("director@example.test", "/profiles");
  });

  it("provisions a pending publisher with only the exact-Site website relationship", async () => {
    state.selects.push(
      [{ siteId: actor.grantSiteId }],
      [{ id: input.siteId, organizationType: "church" }],
      [], [], [], [], [],
    );
    const result = await state.handlers[3]!({ data: { ...input, role: "site_website_editor" } });
    expect(result).toMatchObject({ created: true, pending: true, emailSent: true });
    expect(state.inserts.find(row => row.table === accountPersonGrants)?.value).toMatchObject({
      role: "site_website_editor", siteId: input.siteId, active: false,
    });
    expect(state.inserts.find(row => row.table === memberships)?.value).toMatchObject({
      personId: "person-1", organizationId: actor.scope.organizationIds[0],
    });
    expect(state.inserts.find(row => row.table === roleAssignments)?.value).toMatchObject({
      personId: "person-1", organizationId: actor.scope.organizationIds[0], siteId: input.siteId,
      programId: null, roleKey: "site_website_editor",
      capabilities: ["site.website.draft.read", "site.website.local.publish"],
    });
    expect(state.requestAccess).toHaveBeenCalledOnce();
  });

  it("rejects CAN institutional provisioning before any transaction", async () => {
    state.selects.push(
      [{ siteId: actor.grantSiteId }],
      [{ id: input.siteId, organizationType: "can_network" }],
    );
    await expect(state.handlers[3]!({ data: input })).rejects.toThrow(/separate, independently authorized/);
    expect(db.transaction).not.toHaveBeenCalled();
    expect(state.requestAccess).not.toHaveBeenCalled();
  });

  it("denies a site-bound inviter access to a sibling Site", async () => {
    state.selects.push([{ siteId: actor.grantSiteId }]);
    await expect(state.handlers[3]!({ data: { ...input, siteId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2" } }))
      .rejects.toThrow(/sibling school/);
    expect(db.transaction).not.toHaveBeenCalled();
  });
  it("allows a Site Admin to invite an exact-school demo teacher without sending email", async () => {
    actor.role = "site_admin";
    state.selects.push(
      [{ siteId: actor.grantSiteId }],
      [{ id: input.siteId, organizationType: "christian_school" }],
      [{ domain: "newschool.demo", enabled: true }],
      [], [], [], [],
    );
    const result = await state.handlers[3]!({ data: {
      ...input, email: "teacher@newschool.demo", role: "teacher",
    } });
    expect(result).toMatchObject({ created: true, pending: true, emailSent: false });
    expect(state.requestAccess).not.toHaveBeenCalled();
    expect(state.inserts.find(row => row.table === accountPersonGrants)?.value).toMatchObject({
      siteId: input.siteId, active: false, role: "teacher",
    });
    expect(state.inserts.find(row => row.table === domainEvents)?.value).toMatchObject({
      eventType: EventTypes.StaffInvitationIssued, aggregateId: "grant-1",
      payload: {
        organizationId: actor.scope.organizationIds[0], siteId: input.siteId,
        accountId: "account-1", personId: "person-1", role: "teacher",
      },
    });
  });
  it("does not allow a registrar to deactivate the school's Site Admin", async () => {
    state.selects.push(
      [{ siteId: actor.grantSiteId }],
      [{ id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd9", accountId: "administrator-account",
        organizationId: actor.scope.organizationIds[0], siteId: input.siteId,
        active: true, role: "site_admin" }],
    );
    await expect(state.handlers[4]!({ data: {
      grantId: "dddddddd-dddd-4ddd-8ddd-ddddddddddd9", active: false,
    } })).rejects.toThrow("grant organization scope");
    expect(state.inserts).toEqual([]);
  });
  it("invites a real-email tester into the exact synthetic Site", async () => {
    state.selects.push(
      [{ siteId: actor.grantSiteId }],
      [{ id: input.siteId, organizationType: "christian_school" }],
      [{ domain: "newschool.demo", enabled: true }],
      [], [], [], 
    );
    const result = await state.handlers[3]!({ data: input });
    expect(result).toMatchObject({ created: true, pending: true, emailSent: true, deliveryStatus: "dispatched" });
    expect(state.requestAccess).toHaveBeenCalledWith("director@example.test", undefined);
    expect(state.inserts.find(row => row.table === domainEvents)?.value).toMatchObject({
      eventType: EventTypes.StaffInvitationIssued, aggregateId: "grant-1",
      payload: expect.objectContaining({ invitationMode: "verified_email", emailNormalized: "director@example.test" }),
    });
  });

  it("does not report an email as sent when the provider skipped dispatch", async () => {
    state.requestAccess.mockResolvedValue("cooldown");
    state.selects.push(
      [{ siteId: actor.grantSiteId }],
      [{ id: input.siteId, organizationType: "church" }],
      [], [], [],
    );
    const result = await state.handlers[3]!({ data: input });
    expect(result).toMatchObject({ created: true, pending: true, emailSent: false, deliveryStatus: "cooldown" });
  });
});
