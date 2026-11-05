import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { interestEventEmailDeliveries, interestEventRegistrations } from "@/db/schema";

const state = vi.hoisted(() => ({
  client: null as unknown as import("@electric-sql/pglite").PGlite,
  emitEvent: vi.fn(async () => {}),
  writeAudit: vi.fn(async () => {}),
}));
vi.mock("@/db/client", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  state.client = new PGlite();
  return { db: drizzle(state.client) };
});
vi.mock("@/platform/mutation", () => ({ emitEvent: state.emitEvent, writeAudit: state.writeAudit }));

import { db } from "@/db/client";
import type { AccessContext } from "@/domain/access-context";
import { recordInterestEventAttendance } from "@/modules/enrollment/interest-events.server";

const ids = {
  person: "20000000-0000-4000-8000-000000000001",
  org: "20000000-0000-4000-8000-000000000002",
  site: "20000000-0000-4000-8000-000000000003",
  program: "20000000-0000-4000-8000-000000000004",
  event: "20000000-0000-4000-8000-000000000005",
  registration: "20000000-0000-4000-8000-000000000006",
};
const actor = {
  actorPersonId: ids.person,
  capabilities: new Set(["program.read", "calendar.event.create"]),
  scope: { organizationIds: [ids.org], siteIds: [ids.site], programIds: [ids.program] },
  role: "site_admin",
} as AccessContext;

async function seed(startOffset = -60 * 60 * 1000, endOffset = -30 * 60 * 1000) {
  await state.client.exec(`
    INSERT INTO people (id) VALUES ('${ids.person}');
    INSERT INTO interest_events (id, organization_id, site_id, program_id, status)
      VALUES ('${ids.event}', '${ids.org}', '${ids.site}', '${ids.program}', 'published');
    INSERT INTO interest_event_registrations (id, request_id, event_id, public_interest_id, status)
      VALUES ('${ids.registration}', gen_random_uuid(), '${ids.event}', gen_random_uuid(), 'registered');
    INSERT INTO calendar_events (source_type, source_id, starts_at, ends_at, timezone)
      VALUES ('interest_event', '${ids.event}', CURRENT_TIMESTAMP + (${startOffset} * interval '1 millisecond'),
        CURRENT_TIMESTAMP + (${endOffset} * interval '1 millisecond'), 'America/Los_Angeles');
  `);
}

beforeAll(async () => {
  await state.client.exec(`
    CREATE TABLE people (id uuid PRIMARY KEY);
    CREATE TABLE interest_event_registrations (
      id uuid PRIMARY KEY, request_id uuid NOT NULL, event_id uuid NOT NULL,
      public_interest_id uuid NOT NULL, status text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE interest_events (
      id uuid PRIMARY KEY, organization_id uuid NOT NULL, site_id uuid NOT NULL,
      program_id uuid NOT NULL, status text NOT NULL
    );
    CREATE TABLE calendar_events (
      source_type text NOT NULL, source_id uuid NOT NULL,
      starts_at timestamptz NOT NULL, ends_at timestamptz,
      timezone text NOT NULL
    );
  `);
  await state.client.exec(await readFile(new URL("../../drizzle/0074_omniscient_hulk.sql", import.meta.url), "utf8"));
});

beforeEach(async () => {
  state.emitEvent.mockClear();
  state.writeAudit.mockClear();
  await state.client.exec(`
    DELETE FROM interest_event_email_deliveries;
    DELETE FROM interest_event_registrations;
    DELETE FROM calendar_events;
    DELETE FROM interest_events;
    DELETE FROM people;
  `);
});

afterAll(async () => { await state.client.close(); });

describe("interest event attendance command", () => {
  it("records a scoped check-in and queues one post-event follow-up", async () => {
    await seed();
    expect(await recordInterestEventAttendance(actor, {
      registrationId: ids.registration, attendanceStatus: "attended",
    })).toEqual({ created: true, attendanceStatus: "attended" });
    expect(await recordInterestEventAttendance(actor, {
      registrationId: ids.registration, attendanceStatus: "attended",
    })).toEqual({ created: false, attendanceStatus: "attended" });
    expect(await db.select().from(interestEventRegistrations)).toEqual([
      expect.objectContaining({ attendanceStatus: "attended", attendanceMarkedByPersonId: ids.person }),
    ]);
    expect(await db.select().from(interestEventEmailDeliveries)).toEqual([
      expect.objectContaining({ kind: "follow_up_attended", status: "pending" }),
    ]);
    expect(state.emitEvent).toHaveBeenCalledTimes(1);
    expect(state.writeAudit).toHaveBeenCalledTimes(1);
  });

  it("rejects no-show before the event ends and rejects changing recorded attendance", async () => {
    await seed(60 * 60 * 1000, 2 * 60 * 60 * 1000);
    await expect(recordInterestEventAttendance(actor, {
      registrationId: ids.registration, attendanceStatus: "no_show",
    })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(await db.select().from(interestEventRegistrations))
      .toEqual([expect.objectContaining({ attendanceStatus: null })]);

    await state.client.exec(`UPDATE calendar_events SET starts_at = CURRENT_TIMESTAMP - interval '1 hour', ends_at = CURRENT_TIMESTAMP - interval '1 minute'`);
    await recordInterestEventAttendance(actor, {
      registrationId: ids.registration, attendanceStatus: "no_show",
    });
    await expect(recordInterestEventAttendance(actor, {
      registrationId: ids.registration, attendanceStatus: "attended",
    })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await db.select().from(interestEventEmailDeliveries))
      .toEqual([expect.objectContaining({ kind: "follow_up_no_show" })]);
  });

  it("rejects out-of-scope attendance before any write", async () => {
    await seed();
    await expect(recordInterestEventAttendance({
      ...actor, scope: { organizationIds: [ids.org], siteIds: ["another-site"], programIds: [ids.program] },
    }, { registrationId: ids.registration, attendanceStatus: "attended" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await db.select().from(interestEventRegistrations))
      .toEqual([expect.objectContaining({ attendanceStatus: null })]);
  });
});