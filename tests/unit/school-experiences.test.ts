import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSchoolExperiences } from "@/modules/student-experience/school-experiences.functions";

const { select, requireActor, setResponseHeader } = vi.hoisted(() => ({
  select: vi.fn(), requireActor: vi.fn(), setResponseHeader: vi.fn(),
}));
vi.mock("@/db/client", () => ({ db: { select } }));
vi.mock("@/modules/identity/actors.server", () => ({
  requireActor,
  actorSiteIds: (actor: { scope: { siteIds: string[] } }) => actor.scope.siteIds,
}));
vi.mock("@tanstack/react-start/server", () => ({ setResponseHeader }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator() { return this; },
    handler(callback: unknown) { return callback; },
  }),
}));

function rows(data: unknown[]) {
  const result = Promise.resolve(data);
  return {
    from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue(data),
    then: result.then.bind(result),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("DATABASE_URL", "postgresql://test.invalid/unused-mocked-db");
  requireActor.mockResolvedValue({
    actorPersonId: "student", role: "student",
    scope: { siteIds: ["site"], programIds: ["program"] },
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("School Experiences event status", () => {
  it("derives cancellation from canonical metadata while preserving the feed shape", async () => {
    const startsAt = new Date("2030-01-01T12:00:00Z");
    const events = [
      { id: "cancelled", metadata: { cancelled: true, cancelledAt: "2029-12-01T12:00:00Z" } },
      { id: "scheduled", metadata: {} },
      { id: "not-cancelled", metadata: { cancelled: false } },
      { id: "non-boolean", metadata: { cancelled: "true" } },
    ].map(event => ({ ...event, title: event.id, startsAt, timezone: "America/Los_Angeles" }));
    select.mockReturnValueOnce(rows(events))
      .mockReturnValueOnce(rows([]))
      .mockReturnValueOnce(rows([]));
    const result = await getSchoolExperiences();
    expect(result.events).toEqual(events.map(event => ({
      id: event.id, title: event.title, startsAt: startsAt.toISOString(), timezone: event.timezone,
      status: event.metadata.cancelled === true ? "cancelled" : "scheduled",
    })));
    expect(result.events[0]?.status).toBe("cancelled");
    expect(result.events.slice(1).every(event => event.status === "scheduled")).toBe(true);
    expect(result.connected).toBe(true);
    expect(setResponseHeader).toHaveBeenCalledWith("Cache-Control", "private, no-store");
  });
});
