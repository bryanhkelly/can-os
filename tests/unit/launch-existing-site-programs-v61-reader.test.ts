import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { ExistingSiteProgramV61 } from "@/domain/site-existing-programs-v61";

const siteId = "00000000-0000-4000-8000-000000000121";
const orgId = "00000000-0000-4000-8000-000000000122";
const programId = "00000000-0000-4000-8000-000000000123";

const state = vi.hoisted(() => ({
  actor: null as null | {
    actorPersonId: string;
    role: string;
    grantSiteId: string | null;
    capabilities: Set<string>;
    scope: { organizationIds: string[]; siteIds: string[]; programIds?: string[] };
  },
  site: { id: "00000000-0000-4000-8000-000000000121",
    organizationId: "00000000-0000-4000-8000-000000000122" },
  programs: [] as ExistingSiteProgramV61[],
  where: [] as unknown[],
  programQueries: 0,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (data: unknown) => data;
    const fn = {
      validator(next: typeof validate) { validate = next; return fn; },
      handler(next: (args: { data: unknown }) => Promise<unknown>) {
        return ({ data }: { data: unknown }) => next({ data: validate(data) });
      },
    };
    return fn;
  },
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => new Request("https://example.test/launch/site"),
  setResponseHeader: vi.fn(),
}));
vi.mock("@/modules/identity/command-context.server", () => ({
  getCommandContext: async () => state.actor,
}));
vi.mock("@/db/client", () => ({
  db: {
    select: () => {
      const query = {
        from() { return query; },
        where(condition: unknown) { state.where.push(condition); return query; },
        limit: async () => [state.site],
        orderBy: async () => {
          state.programQueries++;
          return state.programs;
        },
      };
      return query;
    },
  },
}));

import { readExistingSiteProgramsV61 } from "@/modules/programs/site-programs-audiences-v61.functions";

const sample = (id: string, status: ExistingSiteProgramV61["status"]): ExistingSiteProgramV61 => ({
  id, name: "Site Program " + id.slice(-4), type: "high_school_extension",
  status, gradeRange: { min: "9", max: "12" },
  deliveryModel: { onsite: true, asynchronous: true },
});

beforeEach(() => {
  state.where = [];
  state.programQueries = 0;
  state.programs = [
    sample(programId, "active"),
    sample("00000000-0000-4000-8000-000000000124", "launching"),
    sample("00000000-0000-4000-8000-000000000125", "closed"),
  ];
  state.actor = {
    actorPersonId: "00000000-0000-4000-8000-000000000126",
    role: "site_admin", grantSiteId: siteId,
    capabilities: new Set(["program.read"]),
    scope: { organizationIds: [orgId], siteIds: [siteId] },
  };
});

describe("Launch Studio existing Program reader", () => {
  it("reads every canonical status for an authorized Site Admin without planning data", async () => {
    const result = await readExistingSiteProgramsV61({ data: { siteId } });
    expect(result.siteId).toBe(siteId);
    expect(result.visibility).toBe("whole_site");
    expect(result.programs.map(program => program.status))
      .toEqual(["active", "launching", "closed"]);
    expect(state.programQueries).toBe(1);
    const query = new PgDialect().sqlToQuery(state.where.at(-1) as SQL);
    expect(query.params).toContain(siteId);
    expect(query.params).not.toContain(orgId);
  });

  it("limits registrar reads to explicitly assigned Program IDs", async () => {
    state.actor!.role = "registrar";
    state.actor!.scope.programIds = [programId];
    const result = await readExistingSiteProgramsV61({ data: { siteId } });
    expect(result.visibility).toBe("assigned");
    const query = new PgDialect().sqlToQuery(state.where.at(-1) as SQL);
    expect(query.params).toEqual([siteId, programId]);
  });

  it("does not query sibling Programs when a registrar has no Program grants", async () => {
    state.actor!.role = "registrar";
    state.actor!.scope.programIds = [];
    const result = await readExistingSiteProgramsV61({ data: { siteId } });
    expect(result.programs).toEqual([]);
    expect(result.visibility).toBe("assigned");
    expect(state.programQueries).toBe(0);
  });

  it("rejects a Site outside the active registrar grant", async () => {
    state.actor!.scope.siteIds = ["00000000-0000-4000-8000-000000000199"];
    await expect(readExistingSiteProgramsV61({ data: { siteId } })).rejects.toThrow();
    expect(state.programQueries).toBe(0);
  });
});
