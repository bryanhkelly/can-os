import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  results: [] as unknown[][],
  transaction: vi.fn(), insert: vi.fn(), execute: vi.fn(),
  emit: vi.fn(), audit: vi.fn(), draft: vi.fn(),
}));
vi.mock("@/db/client", () => ({ db: { transaction: state.transaction } }));
vi.mock("@/db/schema", () => Object.fromEntries([
  "journeys", "journeyDefinitions", "activities", "activitySeasons", "calendarEvents",
  "journeyRequirements", "organizations", "programs", "schoolYears", "sections",
  "sectionTeachers", "sites", "terms",
].map(name => [name, new Proxy({}, { get: (_target, key) => name + "." + String(key) })])));
vi.mock("@/domain/attendance-configuration-lock", () => ({ lockAttendanceConfigurationAtSite: vi.fn() }));
vi.mock("@/domain/event-types", () => ({ EventTypes: {} }));
vi.mock("@/modules/journeys/instantiate", () => ({ instantiateJourneyFromDefinition: vi.fn() }));
vi.mock("@/platform/mutation", () => ({ emitEvent: state.emit, writeAudit: state.audit }));
vi.mock("@/platform/calendar/projection", () => ({ createProjectionIfAbsent: vi.fn() }));
vi.mock("@/modules/programs/section-readiness-service", () => ({ evaluateSectionReadiness: vi.fn() }));
vi.mock("@/modules/staffing/launch-staffing.server", () => ({ lockLaunchTeacherClaims: vi.fn() }));
vi.mock("@/modules/programs/opening-handoff.server", () => ({
  assertOpeningOperator: vi.fn(), createOpeningHandoff: vi.fn(), listOpeningHandoffs: vi.fn(),
}));
vi.mock("@/modules/activities/extended-learning-sessions.server", () => ({ listExtendedSessionStaff: vi.fn() }));
vi.mock("@/modules/programs/program-site-authorization.server", () => ({ requireCurrentProgramSiteAuthorization: vi.fn() }));
vi.mock("@/modules/sites/site-public-provisioning.server", () => ({ ensureExistingSitePublicationDraftForLaunch: state.draft }));

import { startProgramLaunch } from "@/modules/programs/program-launch-service";
const input = {
  name: "Grace School", slug: "grace-school", type: "church_hosted_academy" as const,
  hostOrganizationId: "church", siteId: "site", jurisdictionId: "jurisdiction",
  academicProviderOrganizationId: "can", creditIssuingOrganizationId: "can",
  targetOpeningDate: "2027-08-23", gradeRange: { min: "K", max: "5" },
  deliveryModel: { onsite: true, onsiteDaysPerWeek: 5 },
};
function actor() {
  return { actorPersonId: "operator", capabilities: new Set(["program.launch.start"]),
    scope: { organizationIds: ["church"], siteIds: ["site"], programIds: ["program"] } };
}
function saved() {
  return { ...input, id: "program", organizationId: "church", status: "launching",
    metadata: { creditMode: "credit_bearing", targetOpeningDate: input.targetOpeningDate },
    accreditationAuthorityOrganizationId: null };
}
function journey() {
  return { id: "journey", programId: "program", siteId: "site", organizationId: "church" };
}
function responses(savedJourney: unknown[] = [journey()]) {
  state.results = [[{ id: "church", type: "church" }], [{ id: "can", type: "can_network" }],
    [{ id: "can", type: "can_network" }], [{ id: "site", organizationId: "church", slug: "school" }],
    [saved()], savedJourney];
}
beforeEach(() => {
  vi.clearAllMocks();
  responses();
  state.draft.mockResolvedValue({ slug: "school", host: "school.example.test", status: "draft", created: false });
  state.transaction.mockImplementation(async callback => {
    const tx = {
      insert: state.insert, execute: state.execute,
      select: () => {
        const rows = state.results.shift() ?? [];
        const chain = { from: () => chain, where: () => chain, for: () => chain,
          innerJoin: () => chain, limit: async () => rows };
        return chain;
      },
    };
    return callback(tx);
  });
});
describe("startProgramLaunch retry with mocked persistence", () => {
  it("returns the existing canonical IDs without another insert, event or audit", async () => {
    expect(await startProgramLaunch(actor(), input)).toMatchObject({ programId: "program", journeyId: "journey" });
    expect(state.execute).toHaveBeenCalledTimes(1);
    expect(state.insert).not.toHaveBeenCalled();
    expect(state.emit).not.toHaveBeenCalled();
    expect(state.audit).not.toHaveBeenCalled();
  });
  it("retains the launch capability boundary before opening a transaction", async () => {
    await expect(startProgramLaunch({ ...actor(), capabilities: new Set() }, input)).rejects.toThrow("capability");
    expect(state.transaction).not.toHaveBeenCalled();
  });
  it("denies an existing Program outside current Program scope", async () => {
    const context = actor(); context.scope.programIds = ["another-program"];
    await expect(startProgramLaunch(context, input)).rejects.toThrow("program scope");
    expect(state.insert).not.toHaveBeenCalled();
    expect(state.draft).not.toHaveBeenCalled();
  });
  it("rejects a changed proposal without mutating the old launch", async () => {
    await expect(startProgramLaunch(actor(), { ...input, targetOpeningDate: "2028-08-23" }))
      .rejects.toThrow("slug is already in use");
    expect(state.insert).not.toHaveBeenCalled();
    expect(state.emit).not.toHaveBeenCalled();
  });
  it("does not manufacture a Journey to repair an incomplete existing record", async () => {
    responses([]);
    await expect(startProgramLaunch(actor(), input)).rejects.toThrow("canonical launch Journey reviewed");
    expect(state.insert).not.toHaveBeenCalled();
  });
  it("rejects a mismatched or ambiguous saved Journey", async () => {
    for (const rows of [[{ ...journey(), siteId: "other-site" }], [journey(), journey()]]) {
      responses(rows);
      await expect(startProgramLaunch(actor(), input)).rejects.toThrow("canonical launch Journey reviewed");
    }
    expect(state.insert).not.toHaveBeenCalled();
    expect(state.emit).not.toHaveBeenCalled();
  });
});

