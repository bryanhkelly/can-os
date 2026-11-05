import { and, asc, eq, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db/client";
import {
  calendarEvents,
  interestEventEmailDeliveries,
  interestEventRegistrations,
  interestEvents,
  programs,
  publicAdmissionsInterests,
  sites,
} from "@/db/schema";
import { renderInterestEventCalendar, type InterestEventEmailKind } from "@/domain/interest-event-delivery";
import { sendNotificationEmail } from "@/modules/communication/notification-email.server";
import { isDemoTenantOrganization } from "@/modules/identity/demo-school-tenants.server";

const MAX_ATTEMPTS = 5;
const LEASE_MS = 120_000;
const RETRY_MS = (attempt: number) => Math.min(60_000 * 2 ** Math.max(0, attempt - 1), 3_600_000);

type Delivery = { id: string; leaseUntil: Date; attempts: number };

function formattedEventTime(value: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZone: timezone,
  }).format(value);
}

function emailContent(kind: InterestEventEmailKind, event: {
  title: string;
  description: string;
  location: string;
  siteName: string;
  programName: string;
  startsAt: Date;
  endsAt: Date | null;
  timezone: string;
  attendanceStatus: "attended" | "no_show" | null;
  firstName: string;
}) {
  const timing = formattedEventTime(event.startsAt, event.timezone);
  const end = event.endsAt ? ` to ${formattedEventTime(event.endsAt, event.timezone)}` : "";
  const greeting = event.firstName ? `Hello ${event.firstName},\n\n` : "Hello,\n\n";
  if (kind === "confirmation") {
    return {
      subject: `You're registered: ${event.title}`,
      text: `${greeting}Your RSVP is confirmed for ${event.title} at ${event.siteName}.\n\n${event.programName} · ${timing}${end} (${event.timezone})${event.location ? `\nLocation: ${event.location}` : ""}${event.description ? `\n\n${event.description}` : ""}\n\nThe attached calendar event contains the event details. This RSVP is not an application, admission decision, or confirmation that the school is authorized to operate.`,
    };
  }
  if (kind === "reminder_24h" || kind === "reminder_2h") {
    return {
      subject: `Reminder: ${event.title}`,
      text: `${greeting}This is a reminder about ${event.title} at ${event.siteName}.\n\n${event.programName} · ${timing}${end} (${event.timezone})${event.location ? `\nLocation: ${event.location}` : ""}\n\nYour RSVP is for this event only; it is not an application or admission decision.`,
    };
  }
  const attended = event.attendanceStatus === "attended";
  return {
    subject: attended ? `Thank you for joining us: ${event.title}` : `We missed you: ${event.title}`,
    text: attended
      ? `${greeting}Thank you for joining ${event.title} at ${event.siteName}. Contact the school if you have questions about future steps. This event RSVP did not create an application or admission decision.`
      : `${greeting}We missed you at ${event.title} at ${event.siteName}. Contact the school if you would like to ask about another visit or information session. This message does not create an application or admission decision.`,
  };
}

async function claimDelivery(now: Date): Promise<Delivery | null> {
  return db.transaction(async tx => {
    const [row] = await tx.select({
      id: interestEventEmailDeliveries.id,
      attempts: interestEventEmailDeliveries.attempts,
    }).from(interestEventEmailDeliveries).where(or(
      and(
        eq(interestEventEmailDeliveries.status, "pending"),
        lte(interestEventEmailDeliveries.deliverAt, now),
        or(isNull(interestEventEmailDeliveries.nextAttemptAt),
          lte(interestEventEmailDeliveries.nextAttemptAt, now)),
      ),
      and(eq(interestEventEmailDeliveries.status, "failed"),
        lte(interestEventEmailDeliveries.nextAttemptAt, now)),
      and(eq(interestEventEmailDeliveries.status, "processing"),
        lte(interestEventEmailDeliveries.leaseUntil, now)),
    )).orderBy(asc(interestEventEmailDeliveries.deliverAt), asc(interestEventEmailDeliveries.id))
      .limit(1).for("update", { skipLocked: true });
    if (!row) return null;
    const leaseUntil = new Date(now.getTime() + LEASE_MS);
    const attempts = row.attempts + 1;
    await tx.update(interestEventEmailDeliveries).set({
      status: "processing", attempts, leaseUntil, nextAttemptAt: null, updatedAt: now,
    }).where(eq(interestEventEmailDeliveries.id, row.id));
    return { id: row.id, leaseUntil, attempts };
  });
}

export async function processInterestEventEmailDeliveries(
  limit = 100,
): Promise<{ accepted: number; failed: number; cancelled: number }> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
    throw new Error("Interest-event email batch limit must be between 1 and 1000");
  }
  let accepted = 0;
  let failed = 0;
  let cancelled = 0;
  for (let index = 0; index < limit; index++) {
    const now = new Date();
    const delivery = await claimDelivery(now);
    if (!delivery) break;
    const owned = and(
      eq(interestEventEmailDeliveries.id, delivery.id),
      eq(interestEventEmailDeliveries.status, "processing"),
      eq(interestEventEmailDeliveries.leaseUntil, delivery.leaseUntil),
    );
    try {
      const [record] = await db.select({
        kind: interestEventEmailDeliveries.kind,
        eventStatus: interestEvents.status,
        organizationId: interestEvents.organizationId,
        registrationId: interestEventRegistrations.id,
        attendanceStatus: interestEventRegistrations.attendanceStatus,
        contactConsentAt: publicAdmissionsInterests.contactConsentAt,
        email: publicAdmissionsInterests.contactEmail,
        firstName: publicAdmissionsInterests.contactFirstName,
        title: interestEvents.title,
        description: interestEvents.description,
        location: interestEvents.location,
        siteName: sites.name,
        programName: programs.name,
        startsAt: calendarEvents.startsAt,
        endsAt: calendarEvents.endsAt,
        timezone: calendarEvents.timezone,
      }).from(interestEventEmailDeliveries)
        .innerJoin(interestEventRegistrations,
          eq(interestEventRegistrations.id, interestEventEmailDeliveries.registrationId))
        .innerJoin(interestEvents, eq(interestEvents.id, interestEventRegistrations.eventId))
        .innerJoin(publicAdmissionsInterests,
          eq(publicAdmissionsInterests.id, interestEventRegistrations.publicInterestId))
        .innerJoin(programs, eq(programs.id, interestEvents.programId))
        .innerJoin(sites, eq(sites.id, interestEvents.siteId))
        .innerJoin(calendarEvents, and(
          eq(calendarEvents.sourceType, "interest_event"),
          eq(calendarEvents.sourceId, interestEvents.id),
        )).where(owned).limit(1);
      if (!record || record.eventStatus !== "published" || !record.contactConsentAt ||
        await isDemoTenantOrganization(record.organizationId) ||
        ((record.kind === "follow_up_attended" && record.attendanceStatus !== "attended") ||
          (record.kind === "follow_up_no_show" && record.attendanceStatus !== "no_show")) ||
        ((record.kind === "reminder_24h" || record.kind === "reminder_2h") && record.startsAt <= now)) {
        await db.update(interestEventEmailDeliveries).set({
          status: "cancelled", leaseUntil: null, lastError: "delivery_no_longer_eligible", updatedAt: now,
        }).where(owned);
        cancelled++;
        continue;
      }
      const content = emailContent(record.kind, { ...record, attendanceStatus: record.attendanceStatus });
      const attachments = record.kind === "confirmation" ? [{
        filename: "school-interest-event.ics",
        content: Buffer.from(renderInterestEventCalendar({
          uid: `${record.registrationId}@can-os`,
          title: record.title,
          description: record.description,
          location: record.location,
          startsAt: record.startsAt,
          endsAt: record.endsAt,
          now,
        }), "utf8").toString("base64"),
        contentType: "text/calendar; charset=utf-8; method=REQUEST",
      }] : undefined;
      const providerAccepted = await sendNotificationEmail({
        to: record.email,
        ...content,
        ...(attachments ? { attachments } : {}),
      }, `interest-event:${delivery.id}`);
      if (providerAccepted) {
        await db.update(interestEventEmailDeliveries).set({
          status: "delivered", providerAcceptedAt: new Date(), leaseUntil: null,
          nextAttemptAt: null, lastError: null, updatedAt: new Date(),
        }).where(owned);
        accepted++;
      } else {
        const terminal = delivery.attempts >= MAX_ATTEMPTS;
        await db.update(interestEventEmailDeliveries).set({
          status: "failed", leaseUntil: null,
          nextAttemptAt: terminal ? null : new Date(now.getTime() + RETRY_MS(delivery.attempts)),
          lastError: "provider_not_accepted", updatedAt: new Date(),
        }).where(owned);
        failed++;
      }
    } catch {
      const terminal = delivery.attempts >= MAX_ATTEMPTS;
      await db.update(interestEventEmailDeliveries).set({
        status: "failed", leaseUntil: null,
        nextAttemptAt: terminal ? null : new Date(now.getTime() + RETRY_MS(delivery.attempts)),
        lastError: "delivery_worker_error", updatedAt: new Date(),
      }).where(owned);
      failed++;
    }
  }
  return { accepted, failed, cancelled };
}