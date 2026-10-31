import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessContext } from "@/domain/access-context";
import { submitRoomPlanSchema } from "@/domain/onsite-room-plan";
import { submitOnsiteRoomPlan } from "@/modules/operations/onsite-room-plan.server";
const state = vi.hoisted(() => ({ rows: [] as unknown[][], inserts: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[], delegate: vi.fn() }));
vi.mock("@/modules/operations/school-opening.server", () => ({
  schoolIdentity: async () => ({ programId:"program", siteId:"site", organizationId:"church", institutionId:"can" }),
  verifyChurchEvidenceSubmitter: vi.fn(),
}));
vi.mock("@/modules/operations/site-local-delegation.server", () => ({ requireCurrentSiteLocalDelegate: state.delegate }));
vi.mock("@/platform/mutation", () => ({ emitEvent: async () => "event", writeAudit: vi.fn() }));
vi.mock("@/db/client", () => {
  const tx = {
    select: () => ({ from() { return this; }, innerJoin() { return this; }, where() { return this; },
      orderBy() { return this; }, for() { return this; },
      limit: async () => state.rows.shift() ?? [],
      then(resolve: (rows: unknown[]) => unknown) { return Promise.resolve(state.rows.shift() ?? []).then(resolve); },
    }),
    insert: () => ({ values: async (value: Record<string, unknown>) => { state.inserts.push(value); } }),
    update: () => ({ set(value: Record<string, unknown>) { state.updates.push(value); return { where: async () => {} }; } }),
  };
  return { db: { transaction: async (fn: (tx: unknown) => unknown) => fn(tx) } };
});
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const actor = () => ({ actorPersonId:"director", role:"site_leader", grantSiteId:"site", demoFacilitator:false,
  scope:{ organizationIds:["church"], siteIds:["site"], programIds:["program"] } }) as AccessContext;
const input = () => ({ programId:id(1), sectionId:id(2), periodId:id(3), documentId:id(4), expectedDocumentId:null,
  date:new Date(Date.now()+86400_000).toISOString().slice(0,10), primaryPersonId:id(5), backupPersonId:id(6),
  roomLabel:"Classroom A", roomCapacity:20, expiresAt:new Date(Date.now()+3*86400_000).toISOString(),
  rationale:"The local director has reviewed this room and named adult plan." });
beforeEach(() => {
  vi.clearAllMocks(); state.inserts=[]; state.updates=[];
  state.rows=[[{id:"program"}],[{ startsAtLocal:"09:00",endsAtLocal:"10:00",title:"Class" }],
    [{timezone:"UTC"}],[],[]];
});
describe("room plan submission", () => {
  it("creates an unapproved structured plan without claiming physical presence or external evidence", async () => {
    expect(await submitOnsiteRoomPlan(actor(),input())).toMatchObject({ created:true });
    expect(state.inserts[0]).toMatchObject({ storageProvider:"internal_record",
      metadata:expect.objectContaining({ reviewStatus:"pending", isCurrent:true, source:"staff_room_plan" }) });
    expect(state.inserts[0]?.verifiedAt).toBeUndefined();
    expect(state.delegate).toHaveBeenCalled();
  });
  it("denies a wrong-site director before creating a plan", async () => {
    await expect(submitOnsiteRoomPlan({...actor(),grantSiteId:"other"},input())).rejects.toThrow("current local director");
    expect(state.inserts).toEqual([]);
  });
  it("requires current director delegation, not just a site-leader role", async () => {
    state.delegate.mockRejectedValueOnce(new Error("Delegation revoked"));
    await expect(submitOnsiteRoomPlan(actor(),input())).rejects.toThrow("Delegation revoked");
    expect(state.inserts).toEqual([]);
  });
  it("does not overwrite a newer plan discovered after the form was loaded", async () => {
    state.rows[4]=[{id:id(9)}];
    await expect(submitOnsiteRoomPlan(actor(),input())).rejects.toThrow("Room plan changed");
    expect(state.inserts).toEqual([]); expect(state.updates).toEqual([]);
  });
  it("rejects a noninstructional or unavailable scheduled block", async () => {
    state.rows[1]=[];
    await expect(submitOnsiteRoomPlan(actor(),input())).rejects.toThrow("current scheduled instructional Section");
    expect(state.inserts).toEqual([]);
  });
  it("requires distinct named adults and a real calendar date", () => {
    const value=input();
    expect(submitRoomPlanSchema.safeParse({...value,backupPersonId:value.primaryPersonId}).success).toBe(false);
    expect(submitRoomPlanSchema.safeParse({...value,date:"2026-02-30"}).success).toBe(false);
  });
});
