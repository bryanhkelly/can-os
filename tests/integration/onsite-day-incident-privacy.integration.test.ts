import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { AccessContext } from "@/domain/access-context";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
const state = vi.hoisted(() => ({
  tx: undefined as Tx | undefined,
  programId: "", studentId: "",
}));
vi.mock("@/db/client", () => ({ get db() {
  if (!state.tx) throw new Error("Privacy fixture requires its rollback transaction");
  return state.tx;
} }));
vi.mock("@tanstack/react-start", () => ({
  createServerOnlyFn: (fn: unknown) => fn,
  createServerFn: () => ({ validator() { return this; }, handler(fn: unknown) { return fn; } }),
}));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: vi.fn(), setResponseHeader: vi.fn() }));
vi.mock("@/modules/attendance/onsite-attendance-workflow.functions", () => ({
  loadExpectedOnsiteRosterForActor: async () => ({
    programs: [{ id: state.programId, name: "Synthetic school", configuration: "configured", expectedDays: 1, missingCalendarDates: 0 }],
    students: [{ programId: state.programId, studentProfileId: state.studentId, studentName: "Synthetic student", status: "unmarked", attendanceEventId: null }],
  }),
}));
vi.mock("@/modules/operations/onsite-supervision.functions", () => ({
  loadOnsiteSupervisionPlanForActor: async () => ({ blocks: [], projectionTruncated: false, plannedAssignments: 0, unassignedOrConflicting: 0 }),
}));
vi.mock("@/modules/operations/onsite-duty-response.functions", () => ({
  loadOnsiteDutyResponsesForActor: async () => ({ statuses: [], truncated: false, unacknowledged: 0, coverageExceptions: 0 }),
}));
vi.mock("@/modules/operations/onsite-physical-presence.functions", () => ({
  loadOnsitePhysicalPresenceForActor: async () => ({ blocks: [], truncated: false }),
}));

const integration = process.env.DATABASE_URL ? describe : describe.skip;
integration("ordinary school-day incident privacy", () => {
  it("excludes safeguarding type or classification from counts and review fingerprints", async () => {
    const { db: realDb } = await vi.importActual<{ db: Database }>("@/db/client");
    const s = await import("@/db/schema");
    const { loadOnsiteDayOperationalSnapshot: snapshot } = await import("@/modules/operations/onsite-day-review.functions");
    const rollback = new Error("rollback-day-privacy");
    let checked = false;
    try { await realDb.transaction(async tx => {
      state.tx = tx;
      const suffix = crypto.randomUUID();
      const [org] = await tx.insert(s.organizations).values({ type: "christian_school", name: "Synthetic privacy school", slug: suffix }).returning();
      const [site] = await tx.insert(s.sites).values({ organizationId: org!.id, name: "Synthetic Site", slug: suffix, timezone: "UTC" }).returning();
      const [jurisdiction] = await tx.insert(s.jurisdictions).values({ code: suffix, name: "Synthetic jurisdiction" }).returning();
      const [program] = await tx.insert(s.programs).values({ organizationId: org!.id, siteId: site!.id,
        jurisdictionId: jurisdiction!.id, type: "full_school", name: "Synthetic school", slug: suffix,
        gradeRange: { min: "1", max: "12" }, academicProviderOrganizationId: org!.id }).returning();
      const [person] = await tx.insert(s.people).values({ legalFirstName: "Synthetic", legalLastName: "Student" }).returning();
      const [student] = await tx.insert(s.studentProfiles).values({ personId: person!.id }).returning();
      state.programId = program!.id; state.studentId = student!.id;
      const actor = { role: "site_leader" } as AccessContext;
      const date = "2026-10-29";
      const initial = await snapshot(actor, site!, date);
      async function incident(type: string, classification: string) {
        const [record] = await tx.insert(s.incidents).values({ incidentNumber: crypto.randomUUID(),
          type, classification, severity: "high", status: "filed", summary: "PROTECTED-NARRATIVE",
          reporterPersonId: person!.id, organizationId: org!.id, siteId: site!.id, programId: program!.id,
          occurredAt: new Date(date + "T12:00:00Z") }).returning();
        await tx.insert(s.incidentPeople).values({ incidentId: record!.id, personId: person!.id, role: "subject" });
        return record!;
      }
      await incident("safeguarding_concern", "safety_restricted");
      const restricted = await incident("other", "safeguarding_restricted");
      const hidden = await snapshot(actor, site!, date);
      expect(hidden).toEqual(initial);
      await tx.update(s.incidents).set({ status: "closed", updatedAt: new Date() }).where(eq(s.incidents.id, restricted.id));
      expect(await snapshot(actor, site!, date)).toEqual(initial);
      await incident("injury", "safety_restricted");
      const ordinary = await snapshot(actor, site!, date);
      expect(ordinary.operational.exceptions).toMatchObject({ incidents: 1, openIncidents: 1 });
      expect(ordinary.operational.students[0]?.incidentCount).toBe(1);
      expect(ordinary.fingerprint).not.toBe(initial.fingerprint);
      expect(JSON.stringify(ordinary)).not.toContain("PROTECTED-NARRATIVE");
      checked = true;
      throw rollback;
    }); } catch (error) { if (error !== rollback) throw error; } finally { state.tx = undefined; }
    expect(checked).toBe(true);
  }, 120_000);
});
