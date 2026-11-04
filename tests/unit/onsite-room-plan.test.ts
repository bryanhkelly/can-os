import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessContext } from "@/domain/access-context";
import { submitRoomPlanSchema, effectiveRoomPrimary, assertRoomPrimaryChoice } from "@/domain/onsite-room-plan";
import { submitOnsiteRoomPlan, reviewOnsiteRoomPlan, getOnsiteRoomPlanning } from "@/modules/operations/onsite-room-plan.server";
const state = vi.hoisted(() => ({ rows: [] as unknown[][], inserts: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[], delegate: vi.fn(), reviewer: vi.fn(), safety: vi.fn(),
  room: vi.fn(), appointed: true, occupancy: 0,
  coverage: undefined as undefined | {
    id: string; revision: number; roomId: string; primaryPersonId: string; backupPersonId: string;
    startsAtLocal: string; endsAtLocal: string;
  } }));
vi.mock("@/modules/operations/site-rooms.server", () => ({
  requireSiteRoom: state.room, listSiteRooms: async () => [],
}));
vi.mock("@/modules/operations/room-coverage.server", () => ({
  loadRoomCoverageSchedules: async () => [], roomCoverageForBlock: () => state.coverage,
  roomCoverageOccupancy: async () => state.occupancy,
}));
vi.mock("@/modules/operations/school-opening.server", () => ({
  schoolIdentity: async () => ({ programId:"program", siteId:"site", organizationId:"church", institutionId:"can" }),
  verifyChurchEvidenceSubmitter: vi.fn(), verifyCANSchoolApprover: state.reviewer,
}));
vi.mock("@/modules/operations/site-local-delegation.server", () => ({ requireCurrentSiteLocalDelegate: state.delegate }));
vi.mock("@/platform/mutation", () => ({ emitEvent: async () => "event", writeAudit: vi.fn(), notifyMany: vi.fn() }));
vi.mock("@/modules/operations/section-coverage-verification.server", () => ({
  verifiedScheduledSectionFacilitators: async () => new Map(), scheduledBlockHasNamedFacilitator: () => state.appointed,
}));
vi.mock("@/modules/operations/onsite-block-safety.server", () => ({ requireCurrentOnsiteAdultSafety: state.safety }));
vi.mock("@/modules/programs/program-site-authorization.server", () => ({ requireChurchHostedOperatingServices: vi.fn() }));
vi.mock("@/db/client", () => {
  const tx = {
    execute: vi.fn(),
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
const actor = () => ({ actorPersonId:"director", role:"site_leader", grantSiteId:"site", sessionAccountId:undefined,
  scope:{ organizationIds:["church"], siteIds:["site"], programIds:["program"] } }) as AccessContext;
const input = () => ({ programId:id(1), sectionId:id(2), periodId:id(3), documentId:id(4), expectedDocumentId:null,
  date:new Date(Date.now()+86400_000).toISOString().slice(0,10), primaryPersonId:id(5), backupPersonId:id(6),
  roomId:id(7),roomLabel:"Classroom A", roomCapacity:20, expiresAt:new Date(Date.now()+3*86400_000).toISOString(),
  rationale:"The local director has reviewed this room and named adult plan." });
beforeEach(() => {
  vi.clearAllMocks(); state.inserts=[]; state.updates=[]; state.appointed=true;
  state.coverage=undefined; state.occupancy=0;
  state.room.mockResolvedValue({id:id(7),name:"Classroom A",capacity:20});
  state.rows=[[{id:"site"}],[{id:"program"}],[{ startsAtLocal:"09:00",endsAtLocal:"10:00",title:"Class" }],
    [{timezone:"UTC"}],[{personId:id(5),from:null,through:null}],[],[]];
});
describe("room plan submission", () => {
  it("rejects a room outside the current Site", async () => {
    state.room.mockRejectedValueOnce(new Error("physical room belonging to this exact Site"));
    await expect(submitOnsiteRoomPlan(actor(),input())).rejects.toThrow("this exact Site");
    expect(state.inserts).toEqual([]);
  });
  it("does not accept an inflated client occupancy limit", async () => {
    await expect(submitOnsiteRoomPlan(actor(),{...input(),roomCapacity:99})).rejects.toThrow("Room details changed");
    expect(state.inserts).toEqual([]);
  });
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
    state.rows[6]=[{id:id(9)}];
    await expect(submitOnsiteRoomPlan(actor(),input())).rejects.toThrow("Room plan changed");
    expect(state.inserts).toEqual([]); expect(state.updates).toEqual([]);
  });
  it("rejects a noninstructional or unavailable scheduled block", async () => {
    state.rows[2]=[];
    await expect(submitOnsiteRoomPlan(actor(),input())).rejects.toThrow("current scheduled instructional Section");
    expect(state.inserts).toEqual([]);
  });
  it("requires distinct named adults and a real calendar date", () => {
    const value=input();
    expect(submitRoomPlanSchema.safeParse({...value,backupPersonId:value.primaryPersonId}).success).toBe(false);
    expect(submitRoomPlanSchema.safeParse({...value,date:"2026-02-30"}).success).toBe(false);
  });
});

function prepareReview() {
  const value=input();
  const review={programId:value.programId,sectionId:value.sectionId,periodId:value.periodId,date:value.date,
    documentId:value.documentId,decision:"approve" as const,reason:"Independent review of the named classroom coverage plan."};
  const document={id:value.documentId,uploadedByPersonId:"director",expiresAt:new Date(value.expiresAt),metadata:{
    ...value,siteId:"site",programId:value.programId,reviewStatus:"pending",startsAtLocal:"09:00",endsAtLocal:"10:00"}};
  state.rows=[[{id:"site"}],[{id:"program"}],[{startsAtLocal:"09:00",endsAtLocal:"10:00",title:"Class"}],[document],[{timezone:"UTC"}],[{personId:value.primaryPersonId,from:null,through:null}]];
  return {review,document,can:{...actor(),role:"can_network_steward",actorPersonId:"reviewer"} as AccessContext};
}
describe("independent room plan review",()=>{
  function prepareSharedReview(occupancy: number) {
    const prepared=prepareReview();
    const value=input();
    state.coverage={id:id(8),revision:2,roomId:value.roomId,primaryPersonId:value.primaryPersonId,
      backupPersonId:value.backupPersonId,startsAtLocal:"08:00",endsAtLocal:"14:00"};
    state.occupancy=occupancy;
    Object.assign(prepared.document.metadata,{roomCoverageId:id(8),roomCoverageRevision:2});
    return prepared;
  }
  it("allows exactly 20 distinct mixed-course occupants and checks both adults for the full room day",async()=>{
    const {review,can}=prepareSharedReview(20);
    expect(await reviewOnsiteRoomPlan(can,review)).toMatchObject({changed:true});
    expect(state.safety).toHaveBeenCalledTimes(2);
    expect(state.safety).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({
      startsAtLocal:"08:00",endsAtLocal:"14:00",
    }));
  });
  it("rejects 21 combined occupants in a capacity-20 room without an approval",async()=>{
    const {review,can}=prepareSharedReview(21);
    await expect(reviewOnsiteRoomPlan(can,review)).rejects.toThrow("combined mixed-course room roster");
    expect(state.updates).toEqual([]);
    expect(state.safety).not.toHaveBeenCalled();
  });
  it("invalidates daily approval when the shared room assignment revision changes",async()=>{
    const {review,can}=prepareSharedReview(20);
    state.coverage!.revision=3;
    await expect(reviewOnsiteRoomPlan(can,review)).rejects.toThrow("Room coverage changed");
    expect(state.updates).toEqual([]);
  });
  it("rechecks the room's canonical Site and occupancy limit before approving",async()=>{
    const {review,can}=prepareReview();
    state.room.mockResolvedValueOnce({id:id(7),name:"Classroom A",capacity:10});
    await expect(reviewOnsiteRoomPlan(can,review)).rejects.toThrow("room details no longer match");
    expect(state.updates).toEqual([]);
  });
  it("checks both adult appointments and safety before approving",async()=>{
    const {review,can}=prepareReview();
    expect(await reviewOnsiteRoomPlan(can,review)).toMatchObject({changed:true});
    expect(state.safety).toHaveBeenCalledTimes(2);
    expect(state.updates[0]).toMatchObject({verifiedByPersonId:"reviewer",metadata:expect.objectContaining({reviewStatus:"approved"})});
  });
  it("denies an unauthorized reviewer before mutation",async()=>{
    const {review,can}=prepareReview();state.reviewer.mockImplementationOnce(()=>{throw new Error("CAN authority required");});
    await expect(reviewOnsiteRoomPlan(can,review)).rejects.toThrow("CAN authority required");
    expect(state.updates).toEqual([]);
  });
  it("denies self-review even when the actor has CAN authority",async()=>{
    const {review,can}=prepareReview();
    await expect(reviewOnsiteRoomPlan({...can,actorPersonId:"director"},review)).rejects.toThrow("other than the submitter");
    expect(state.updates).toEqual([]);
  });
  it("denies approval when an adult appointment is no longer current",async()=>{
    const {review,can}=prepareReview();state.appointed=false;
    await expect(reviewOnsiteRoomPlan(can,review)).rejects.toThrow("primary and backup Section appointments");
    expect(state.updates).toEqual([]);
  });
  it("allows rejection with a reason even if adult credentials have lapsed",async()=>{
    const {review,can}=prepareReview();state.appointed=false;
    expect(await reviewOnsiteRoomPlan(can,{...review,decision:"reject"})).toMatchObject({changed:true});
    expect(state.safety).not.toHaveBeenCalled();
    expect(state.updates[0]).toMatchObject({verifiedAt:null,metadata:expect.objectContaining({reviewStatus:"rejected"})});
  });
});

describe("room planning read boundary",()=>{
  it.each(["room_facilitator","guardian","teacher"])("does not expose planning staff or rationale to %s",async role=>{
    const value=input();
    await expect(getOnsiteRoomPlanning({...actor(),role} as AccessContext,{programId:value.programId,date:value.date}))
      .rejects.toThrow("current local director");
  });
});

describe("bounded reviewed onsite substitution",()=>{
  it("uses only a replacement bound to the current scheduled primary",()=>{
    expect(effectiveRoomPrimary("primary",{primaryPersonId:"substitute",substitutesForPersonId:"primary"})).toBe("substitute");
    expect(effectiveRoomPrimary("changed-primary",{primaryPersonId:"substitute",substitutesForPersonId:"primary"})).toBe("changed-primary");
    expect(effectiveRoomPrimary("primary",undefined)).toBe("primary");
    expect(effectiveRoomPrimary(null,{primaryPersonId:"substitute",substitutesForPersonId:"primary"})).toBeNull();
  });
  it("requires an explicit current-primary reference for an alternate adult",()=>{
    expect(()=>assertRoomPrimaryChoice(["primary"],"substitute","primary")).not.toThrow();
    expect(()=>assertRoomPrimaryChoice(["primary"],"substitute")).toThrow("scheduled primary changed");
    expect(()=>assertRoomPrimaryChoice(["primary","other"],"substitute","primary")).toThrow("single current scheduled primary");
  });
  it("records a pending substitution without rewriting the delivery arrangement",async()=>{
    expect(await submitOnsiteRoomPlan(actor(),{...input(),primaryPersonId:id(7),substitutesForPersonId:id(5)})).toMatchObject({created:true});
    expect(state.inserts[0]?.metadata).toMatchObject({primaryPersonId:id(7),substitutesForPersonId:id(5),reviewStatus:"pending"});
    expect(state.updates).toEqual([]);
  });
});
