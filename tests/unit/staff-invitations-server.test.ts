import { beforeEach, describe, expect, it, vi } from "vitest";
import { accountPersonGrants } from "@/db/schema";
import { EventTypes } from "@/domain/event-types";
import {
  acceptStaffInvitations, listPendingStaffInvitations, type PendingStaffInvitation,
} from "@/modules/identity/staff-invitations.server";

const mutation = vi.hoisted(() => ({ emit: vi.fn(), audit: vi.fn() }));
vi.mock("@/platform/mutation", () => ({ emitEvent: mutation.emit, writeAudit: mutation.audit }));

const accountId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const base: PendingStaffInvitation = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1", accountId,
  personId: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1", role: "site_leader",
  organizationId: "dddddddd-dddd-4ddd-8ddd-ddddddddddd1",
  siteId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1",
};

beforeEach(() => {
  mutation.emit.mockReset(); mutation.audit.mockReset();
});

describe("pending staff invitation lookup", () => {
  it("returns only inactive, nonsynthetic, exact-site grants with an unaccepted invitation", async () => {
    const grants = [
      base,
      { ...base, id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2", role: "network_admin" },
      { ...base, id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3", siteId: null },
      { ...base, id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4" },
    ];
    const reader = {
      select: vi.fn()
        .mockImplementationOnce(() => ({
          from: () => ({ innerJoin: () => ({ where: async () => grants }) }),
        }))
        .mockImplementationOnce(() => ({
          from: () => ({ where: async () => [
            { grantId: base.id, eventType: EventTypes.StaffInvitationIssued },
            { grantId: grants[1]!.id, eventType: EventTypes.StaffInvitationIssued },
            { grantId: grants[2]!.id, eventType: EventTypes.StaffInvitationIssued },
            { grantId: grants[3]!.id, eventType: EventTypes.StaffInvitationIssued },
            { grantId: grants[3]!.id, eventType: EventTypes.StaffInvitationAccepted },
          ] }),
        })),
    };

    await expect(listPendingStaffInvitations(reader as never, accountId)).resolves.toEqual([base]);
  });
});

describe("transactional staff invitation acceptance", () => {
  it("activates the exact grant and emits acceptance audit/outbox evidence", async () => {
    const updates: unknown[] = [];
    const tx = {
      update: vi.fn(table => {
        expect(table).toBe(accountPersonGrants);
        return {
          set: (value: unknown) => {
            updates.push(value);
            return { where: () => ({ returning: async () => [{ id: base.id }] }) };
          },
        };
      }),
      select: vi.fn(() => ({ from: () => ({ where: () => ({ limit: async () => [{ id: accountId }] }) }) })),
      insert: vi.fn(),
    };

    await expect(acceptStaffInvitations(tx as never, accountId, [base])).resolves.toEqual([base]);
    expect(updates).toEqual([{ active: true, updatedAt: expect.any(Date) }]);
    expect(mutation.emit).toHaveBeenCalledWith(tx, expect.objectContaining({
      eventType: EventTypes.StaffInvitationAccepted, aggregateId: base.id,
      organizationId: base.organizationId, siteId: base.siteId,
    }));
    expect(mutation.audit).toHaveBeenCalledWith(tx, expect.objectContaining({
      action: "identity.staff_invitation.accepted", resourceId: base.id,
      before: { active: false }, after: expect.objectContaining({ active: true, role: "site_leader" }),
    }));
  });

  it("is idempotent when the grant was already activated", async () => {
    const tx = {
      update: vi.fn(() => ({ set: () => ({ where: () => ({ returning: async () => [] }) }) })),
      select: vi.fn(), insert: vi.fn(),
    };
    await expect(acceptStaffInvitations(tx as never, accountId, [base])).resolves.toEqual([]);
    expect(mutation.emit).not.toHaveBeenCalled();
    expect(mutation.audit).not.toHaveBeenCalled();
  });
});
