import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { interestEventEmailDeliveries } from "@/db/schema";

const state = vi.hoisted(() => ({ client: null as unknown as import("@electric-sql/pglite").PGlite }));
vi.mock("@/db/client", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  state.client = new PGlite();
  return { db: drizzle(state.client) };
});
vi.mock("@/modules/communication/notification-email.server", () => ({
  sendNotificationEmail: vi.fn(async () => true),
}));
vi.mock("@/modules/identity/demo-school-tenants.server", () => ({
  isDemoTenantOrganization: vi.fn(async () => false),
}));

import { db } from "@/db/client";
import { sendNotificationEmail } from "@/modules/communication/notification-email.server";
import { processInterestEventEmailDeliveries } from "@/workers/interest-event-email-worker";

const ids = {
  org: "10000000-0000-4000-8000-000000000001",
  site: "10000000-0000-4000-8000-000000000002",
  program: "10000000-0000-4000-8000-000000000003",
  event: "10000000-0000-4000-8000-000000000004",
  registration: "10000000-0000-4000-8000-000000000005",
  interest: "10000000-0000-4000-8000-000000000006",
  person: "10000000-0000-4000-8000-000000000007",
};

async function seedEvent(startsAt: Date) {
  const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
  await state.client.exec(`
    INSERT INTO people (id) VALUES ('${ids.person}');
    INSERT INTO sites (id, name) VALUES ('${ids.site}', 'Test School');
    INSERT INTO programs (id, name) VALUES ('${ids.program}', 'Test Program');
    INSERT INTO interest_events (id, organization_id, site_id, program_id, title, description, location, status)
      VALUES ('${ids.event}', '${ids.org}', '${ids.site}', '${ids.program}', 'Family Open House', 'Meet the team', 'Main hall', 'published');
    INSERT INTO calendar_events (source_type, source_id, starts_at, ends_at, timezone)
      VALUES ('interest_event', '${ids.event}', '${startsAt.toISOString()}', '${endsAt.toISOString()}', 'America/Los_Angeles');
    INSERT INTO public_admissions_interests (id, contact_consent_at, contact_email, contact_first_name)
      VALUES ('${ids.interest}', CURRENT_TIMESTAMP, 'family@example.test', 'Alex');
    INSERT INTO interest_event_registrations (id, request_id, event_id, public_interest_id, status)
      VALUES ('${ids.registration}', gen_random_uuid(), '${ids.event}', '${ids.interest}', 'registered');
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
      program_id uuid NOT NULL, title text NOT NULL, description text NOT NULL,
      location text NOT NULL, status text NOT NULL
    );
    CREATE TABLE public_admissions_interests (
      id uuid PRIMARY KEY, contact_consent_at timestamptz,
      contact_email text NOT NULL, contact_first_name text NOT NULL
    );
    CREATE TABLE programs (id uuid PRIMARY KEY, name text NOT NULL);
    CREATE TABLE sites (id uuid PRIMARY KEY, name text NOT NULL);
    CREATE TABLE calendar_events (
      source_type text NOT NULL, source_id uuid NOT NULL,
      starts_at timestamptz NOT NULL, ends_at timestamptz,
      timezone text NOT NULL
    );
  `);
  await state.client.exec(await readFile(new URL("../../drizzle/0074_omniscient_hulk.sql", import.meta.url), "utf8"));
});

beforeEach(async () => {
  vi.mocked(sendNotificationEmail).mockReset().mockResolvedValue(true);
  await state.client.exec(`
    DELETE FROM interest_event_email_deliveries;
    DELETE FROM interest_event_registrations;
    DELETE FROM public_admissions_interests;
    DELETE FROM calendar_events;
    DELETE FROM interest_events;
    DELETE FROM programs;
    DELETE FROM sites;
    DELETE FROM people;
  `);
});

afterAll(async () => { await state.client.close(); });

describe("interest event email delivery", () => {
  it("sends confirmation once with a calendar attachment", async () => {
    await seedEvent(new Date(Date.now() + 26 * 60 * 60 * 1000));
    await db.insert(interestEventEmailDeliveries).values({
      registrationId: ids.registration, kind: "confirmation", deliverAt: new Date(Date.now() - 1000),
    });
    expect(await processInterestEventEmailDeliveries()).toEqual({ accepted: 1, failed: 0, cancelled: 0 });
    expect(await processInterestEventEmailDeliveries()).toEqual({ accepted: 0, failed: 0, cancelled: 0 });
    expect(sendNotificationEmail).toHaveBeenCalledTimes(1);
    const message = vi.mocked(sendNotificationEmail).mock.calls[0]![0];
    expect(message.attachments?.[0]?.filename).toBe("school-interest-event.ics");
    expect(Buffer.from(message.attachments![0]!.content, "base64").toString("utf8"))
      .toContain("SUMMARY:Family Open House");
    expect(await db.select().from(interestEventEmailDeliveries))
      .toEqual([expect.objectContaining({ status: "delivered", providerAcceptedAt: expect.any(Date) })]);
  });

  it("does not send a future reminder early", async () => {
    await seedEvent(new Date(Date.now() + 26 * 60 * 60 * 1000));
    await db.insert(interestEventEmailDeliveries).values({
      registrationId: ids.registration, kind: "reminder_24h", deliverAt: new Date(Date.now() + 60_000),
    });
    expect(await processInterestEventEmailDeliveries()).toEqual({ accepted: 0, failed: 0, cancelled: 0 });
    expect(sendNotificationEmail).not.toHaveBeenCalled();
  });

  it("retries failed provider acceptance and cancels reminders after event start", async () => {
    await seedEvent(new Date(Date.now() + 26 * 60 * 60 * 1000));
    await db.insert(interestEventEmailDeliveries).values({
      registrationId: ids.registration, kind: "confirmation", deliverAt: new Date(Date.now() - 1000),
    });
    vi.mocked(sendNotificationEmail).mockResolvedValueOnce(false);
    expect(await processInterestEventEmailDeliveries()).toEqual({ accepted: 0, failed: 1, cancelled: 0 });
    await db.update(interestEventEmailDeliveries).set({ nextAttemptAt: new Date(Date.now() - 1000) });
    expect(await processInterestEventEmailDeliveries()).toEqual({ accepted: 1, failed: 0, cancelled: 0 });

    await db.insert(interestEventEmailDeliveries).values({
      registrationId: ids.registration, kind: "reminder_24h", deliverAt: new Date(Date.now() - 1000),
    });
    await state.client.exec(`UPDATE calendar_events SET starts_at = CURRENT_TIMESTAMP - interval '1 minute'`);
    expect(await processInterestEventEmailDeliveries()).toEqual({ accepted: 0, failed: 0, cancelled: 1 });
    expect(await db.select().from(interestEventEmailDeliveries)
      .where(eq(interestEventEmailDeliveries.kind, "reminder_24h")))
      .toEqual([expect.objectContaining({ status: "cancelled" })]);
  });
});