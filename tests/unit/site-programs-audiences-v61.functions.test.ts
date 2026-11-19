import { beforeEach, describe, expect, it, vi } from "vitest";

const siteId = "00000000-0000-4000-8000-000000000121";
const organizationId = "00000000-0000-4000-8000-000000000122";
const initialTime = "2026-11-19T10:00:00.000Z";

const state = vi.hoisted(() => ({
  actor: {} as {
    actorPersonId: string | null; role: string; grantSiteId: string | null;
    capabilities: Set<string>;
    scope: { organizationIds: string[]; siteIds: string[] };
  },
  site: null as null | {
    id: string; organizationId: string; updatedAt: Date;
    metadata: Record<string, unknown>;
  },
  audit: vi.fn(), event: vi.fn(), transaction: vi.fn(), update: vi.fn(),
  lock: vi.fn(), saved: null as null | Record<string, unknown>,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (value: unknown) => value;
    const builder = {
      validator(fn: typeof validate) { validate = fn; return builder; },
      handler(fn: (input: { data: unknown }) => Promise<unknown>) {
        return (input: { data: unknown }) => fn({ data: validate(input.data) });
      },
    };
    return builder;
  },
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => new Request("https://example.test/launch/site"),
  setResponseHeader: vi.fn(),
}));
vi.mock("@/modules/identity/command-context.server", () => ({
  getCommandContext: async () => state.actor,
}));
vi.mock("@/platform/mutation", () => ({
  writeAudit: state.audit, emitEvent: state.event,
}));
vi.mock("@/db/client", () => {
  const select = () => {
    const query = {
      limit: async () => state.site ? [state.site] : [],
      for: (mode: string) => { state.lock(mode); return query; },
    };
    return { from: () => ({ where: () => query }) };
  };
  const tx = {
    select,
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => {
            state.update(values);
            if (!state.site) return [];
            state.saved = values;
            state.site = { ...state.site, ...values } as typeof state.site;
            return [{ updatedAt: state.site.updatedAt }];
          },
        }),
      }),
    }),
  };
  return {
    db: {
      select,
      transaction: async (work: (tx: typeof tx) => Promise<unknown>) => {
        state.transaction();
        return work(tx);
      },
    },
  };
});

import {
  readSiteProgramsAudiencesV61, saveSiteProgramsAudiencesV61,
} from "@/modules/programs/site-programs-audiences-v61.functions";

const plan = {
  interestIds: ["grades-9-12", "senior"],
  timingIds: ["weekdays", "daytime"],
  audienceIds: ["teens", "older_adults"],
  startingFocus: "grades-9-12",
} as const;
const saveInput = () => ({
  siteId, expectedRevision: initialTime, intent: {
    interestIds: [...plan.interestIds],
    timingIds: [...plan.timingIds],
    audienceIds: [...plan.audienceIds],
    startingFocus: plan.startingFocus,
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  state.actor = {
    actorPersonId: "00000000-0000-4000-8000-000000000123",
    role: "site_admin", grantSiteId: siteId,
    capabilities: new Set(["program.read", "program.launch.start"]),
    scope: { organizationIds: [organizationId], siteIds: [siteId] },
  };
  state.site = {
    id: siteId, organizationId, updatedAt: new Date(initialTime),
    metadata: {
      siteEnvironmentV61: { delivery: "both", physicalSpaceArrangement: "planned" },
      launchPreferences: {
        delivery: "both", interestIds: ["grades-9-12", "weekend"],
      },
    },
  };
  state.saved = null;
});

describe("Programs & Audiences authorized Site save-and-return", () => {
  it("loads the exact Site, normalizing legacy timing without writing", async () => {
    const loaded = await readSiteProgramsAudiencesV61({ data: { siteId } });
    expect(loaded).toMatchObject({
      siteId, revision: initialTime, saved: true,
      intent: {
        interestIds: ["grades-9-12"], timingIds: ["weekends"],
        audienceIds: [], startingFocus: null,
      },
    });
    expect(state.transaction).not.toHaveBeenCalled();
    expect(state.update).not.toHaveBeenCalled();
  });

  it("commits exactly one Site planning update with retained delivery, audit and event", async () => {
    const saved = await saveSiteProgramsAudiencesV61({ data: saveInput() });
    expect(saved).toMatchObject({ siteId, updated: true });
    expect(new Date(saved.revision).getTime()).toBeGreaterThan(new Date(initialTime).getTime());
    expect(state.lock).toHaveBeenCalledWith("update");
    expect(state.update).toHaveBeenCalledOnce();
    expect(state.saved?.metadata).toMatchObject({
      launchPreferences: {
        delivery: "both", planningVersion: 2,
        interestIds: ["grades-9-12", "senior"],
        timingIds: ["weekdays", "daytime"],
        audienceIds: ["teens", "older_adults"],
        startingFocus: "grades-9-12",
      },
    });
    expect(state.audit).toHaveBeenCalledOnce();
    expect(state.event).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      eventType: "SiteInformationUpdated", siteId, organizationId,
      payload: expect.objectContaining({ section: "programs_audiences", publicApproved: false }),
    }));
  });

  it("restores the same saved plan on return and treats an identical save as a no-op", async () => {
    const first = await saveSiteProgramsAudiencesV61({ data: saveInput() });
    const returned = await readSiteProgramsAudiencesV61({ data: { siteId } });
    expect(returned).toMatchObject({ siteId, saved: true, revision: first.revision, intent: saveInput().intent });
    const repeated = await saveSiteProgramsAudiencesV61({ data: {
      ...saveInput(), expectedRevision: first.revision,
    } });
    expect(repeated).toMatchObject({ siteId, updated: false, revision: first.revision });
    expect(state.update).toHaveBeenCalledOnce();
    expect(state.audit).toHaveBeenCalledOnce();
    expect(state.event).toHaveBeenCalledOnce();
  });

  it("fails closed on a stale revision without touching Site metadata", async () => {
    state.site!.updatedAt = new Date("2026-11-19T10:10:00.000Z");
    await expect(saveSiteProgramsAudiencesV61({ data: saveInput() }))
      .rejects.toThrow(/changed since you opened/);
    expect(state.update).not.toHaveBeenCalled();
    expect(state.audit).not.toHaveBeenCalled();
    expect(state.event).not.toHaveBeenCalled();
  });

  it("requires Site-scoped registrar authority for reads and writes", async () => {
    const cases = [
      () => { state.actor.scope.siteIds = ["00000000-0000-4000-8000-000000000999"]; },
      () => { state.actor.scope.organizationIds = []; },
      () => { state.actor.role = "student"; },
      () => { state.actor.capabilities = new Set(); },
      () => { state.actor.actorPersonId = null; },
    ];
    for (const deny of cases) {
      const original = { ...state.actor, capabilities: new Set(state.actor.capabilities),
        scope: { organizationIds: [organizationId], siteIds: [siteId] } };
      deny();
      await expect(readSiteProgramsAudiencesV61({ data: { siteId } })).rejects.toThrow();
      await expect(saveSiteProgramsAudiencesV61({ data: saveInput() })).rejects.toThrow();
      state.actor = original;
    }
    expect(state.update).not.toHaveBeenCalled();
    expect(state.audit).not.toHaveBeenCalled();
  });

  it("does not emit successful audit or event when audit logging fails", async () => {
    state.audit.mockRejectedValueOnce(new Error("audit unavailable"));
    await expect(saveSiteProgramsAudiencesV61({ data: saveInput() }))
      .rejects.toThrow("audit unavailable");
    expect(state.event).not.toHaveBeenCalled();
  });

  it("rejects manipulated input and never creates a Program or Class", async () => {
    await expect(saveSiteProgramsAudiencesV61({ data: {
      ...saveInput(), intent: { ...saveInput().intent, enrollmentOpen: true },
    } })).rejects.toThrow();
    expect(state.transaction).not.toHaveBeenCalled();
    expect(state.update).not.toHaveBeenCalled();
  });
});
