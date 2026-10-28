import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and, asc, eq, gte, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { actorSiteIds, requireActor } from "@/modules/identity/actors.server";
import { AuthorizationError } from "@/domain/command-context";

const teacher = () => requireActor(["teacher"]);
const dateTime = z.string().datetime({ offset: true });

/**
 * Teacher-facing conference workspace: the signed-in teacher's own published
 * series, their slots and upcoming bookings. Reads are scoped to the verified
 * actor's person id and site grant; mutations delegate to the conference
 * service, which remains the sole authorization gate.
 */
export const getTeacherConferences = createServerFn({ method: "GET" }).handler(async () => {
  const actor = await teacher();
  setResponseHeader("Cache-Control", "private, no-store");
  const sites = actorSiteIds(actor);
  if (!process.env.DATABASE_URL) return { connected: false as const, series: [], bookings: [] };
  const [{ db }, schema] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
  const now = new Date();
  const seriesRows = await db.select({
    id: schema.conferenceSeries.id,
    siteId: schema.conferenceSeries.siteId,
    title: schema.conferenceSeries.title,
    startsAt: schema.conferenceSeries.startsAt,
    endsAt: schema.conferenceSeries.endsAt,
    slotMinutes: schema.conferenceSeries.slotMinutes,
    status: schema.conferenceSeries.status,
  }).from(schema.conferenceSeries)
    .where(and(
      eq(schema.conferenceSeries.teacherPersonId, actor.actorPersonId),
      inArray(schema.conferenceSeries.siteId, sites),
      gte(schema.conferenceSeries.endsAt, now),
    ))
    .orderBy(asc(schema.conferenceSeries.startsAt)).limit(10);
  const seriesIds = seriesRows.map(row => row.id);
  const [slotRows, bookingRows] = seriesIds.length === 0 ? [[], []] : await Promise.all([
    db.select({
      seriesId: schema.conferenceSlots.conferenceSeriesId,
      status: schema.conferenceSlots.status,
    }).from(schema.conferenceSlots)
      .where(inArray(schema.conferenceSlots.conferenceSeriesId, seriesIds)),
    db.select({
      id: schema.conferenceBookings.id,
      status: schema.conferenceBookings.status,
      startsAt: schema.conferenceSlots.startsAt,
      endsAt: schema.conferenceSlots.endsAt,
      seriesTitle: schema.conferenceSeries.title,
      studentFirstName: schema.people.legalFirstName,
      studentLastName: schema.people.legalLastName,
    }).from(schema.conferenceBookings)
      .innerJoin(schema.conferenceSlots, eq(schema.conferenceSlots.id, schema.conferenceBookings.conferenceSlotId))
      .innerJoin(schema.conferenceSeries, eq(schema.conferenceSeries.id, schema.conferenceSlots.conferenceSeriesId))
      .innerJoin(schema.studentProfiles, eq(schema.studentProfiles.id, schema.conferenceBookings.studentProfileId))
      .innerJoin(schema.people, eq(schema.people.id, schema.studentProfiles.personId))
      .where(and(
        eq(schema.conferenceSeries.teacherPersonId, actor.actorPersonId),
        inArray(schema.conferenceSeries.siteId, sites),
        ne(schema.conferenceBookings.status, "cancelled"),
        gte(schema.conferenceSlots.endsAt, now),
      ))
      .orderBy(asc(schema.conferenceSlots.startsAt)).limit(50),
  ]);
  return {
    connected: true as const,
    series: seriesRows.map(row => ({
      id: row.id,
      title: row.title,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      slotMinutes: row.slotMinutes,
      status: row.status,
      slotCount: slotRows.filter(slot => slot.seriesId === row.id).length,
      availableCount: slotRows.filter(slot => slot.seriesId === row.id && slot.status === "available").length,
    })),
    bookings: bookingRows.map(row => ({
      id: row.id,
      status: row.status,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      seriesTitle: row.seriesTitle,
      studentName: `${row.studentFirstName} ${row.studentLastName}`,
    })),
  };
});

/** Open a bookable office-hour window. The series always belongs to the signed-in teacher. */
export const createTeacherConferenceSeries = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    title: z.string().trim().min(3).max(120),
    startsAt: dateTime,
    endsAt: dateTime,
    slotMinutes: z.number().int().min(5).max(120).optional(),
  }).parse(value))
  .handler(async ({ data }) => {
    const actor = await teacher();
    const [siteId] = actorSiteIds(actor);
    if (!siteId) throw new AuthorizationError("site membership");
    const { createConferenceSeries } = await import("@/modules/conferences/conference-service");
    const seriesId = await createConferenceSeries(actor, {
      siteId,
      teacherPersonId: actor.actorPersonId,
      title: data.title,
      startsAt: new Date(data.startsAt),
      endsAt: new Date(data.endsAt),
      slotMinutes: data.slotMinutes,
    });
    return { seriesId };
  });

/** Record the outcome of one of the signed-in teacher's own bookings. */
export const completeTeacherConference = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    bookingId: z.string().uuid(),
    outcome: z.enum(["held", "no_show"]),
    note: z.string().trim().max(2000).optional(),
  }).parse(value))
  .handler(async ({ data }) => {
    const actor = await teacher();
    const { completeConference } = await import("@/modules/conferences/conference-service");
    return completeConference(actor, {
      bookingId: data.bookingId,
      outcome: data.outcome,
      note: data.note,
    });
  });

/** Queue the guardian reminder for one of the signed-in teacher's own bookings. */
export const queueTeacherConferenceReminder = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({ bookingId: z.string().uuid() }).parse(value))
  .handler(async ({ data }) => {
    const actor = await teacher();
    const { queueConferenceReminder } = await import("@/modules/conferences/conference-service");
    await queueConferenceReminder(actor, data.bookingId);
    return { queued: true };
  });

/** Cancel one of the signed-in teacher's own bookings, freeing the slot. */
export const cancelTeacherConferenceBooking = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    bookingId: z.string().uuid(),
    reason: z.string().trim().max(500).optional(),
  }).parse(value))
  .handler(async ({ data }) => {
    const actor = await teacher();
    const { cancelConferenceBooking } = await import("@/modules/conferences/conference-service");
    await cancelConferenceBooking(actor, { bookingId: data.bookingId, reason: data.reason });
    return { cancelled: true };
  });
