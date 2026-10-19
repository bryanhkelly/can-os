import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  auditEvents,
  calendarEventParticipants,
  calendarEvents,
  courseTemplates,
  courseTemplateVersions,
  domainEvents,
  gradeScales,
  jurisdictions,
  notifications,
  organizations,
  people,
  scheduledOccurrences,
  programs,
  sections,
  sectionTeachers,
  sites,
  schoolYears,
  studentProfiles,
  terms,
} from "@/db/schema";
import { reviseCalendarEventForActor } from "@/modules/calendar/calendar-events.server";
import type { Actor } from "@/modules/identity/actors.server";

const integration = process.env.DATABASE_URL ? describe : describe.skip;

async function createOccurrence(input: {
  startsAt: Date;
  endsAt?: Date | null;
  timezone: string;
  organizationId?: string | null;
  siteId?: string | null;
  programId?: string | null;
  sectionId?: string | null;
  createdByPersonId?: string | null;
}) {
  const [occurrence] = await db.insert(scheduledOccurrences).values(input)
    .returning({ id: scheduledOccurrences.id });
  if (!occurrence) throw new Error("Calendar occurrence fixture missing");
  return occurrence.id;
}

/**
 * Canonical calendar event lifecycle: authorized edit/reschedule/cancel with
 * participant notification, audit and domain events; denial for out-of-scope
 * staff, non-owners and source-owned events; cancelled events reject changes.
 * Self-contained fixtures; safe to re-run on the disposable branch.
 */
integration("calendar event lifecycle", () => {
  function staffActor(personId: string, role: "registrar" | "teacher", scope: Actor["scope"]): Actor {
    return {
      accountId: `acct-${personId.slice(0, 8)}`,
      sessionId: `sess-${personId.slice(0, 8)}`,
      grantId: `grant-${personId.slice(0, 8)}`,
      actorPersonId: personId,
      role,
      capabilities: new Set(["calendar.event.create", "calendar.event.manage"]),
      scope,
    };
  }

  it("runs authorized edit/reschedule/cancel with propagation and denies everything else", async () => {
    if (process.env.APP_ENV !== "test" || process.env.CAN_TEST_DB_WRITES_ENABLED !== "true")
      throw new Error("Disposable test branch required");

    const suffix = crypto.randomUUID().slice(0, 8);

    const [jurisdiction] = await db.insert(jurisdictions)
      .values({ code: `cal-${suffix}`, name: `Cal Jurisdiction ${suffix}` }).returning();
    const [hostOrg] = await db.insert(organizations)
      .values({ type: "christian_school", name: `Cal School ${suffix}`, slug: `cal-school-${suffix}` }).returning();
    const [otherOrg] = await db.insert(organizations)
      .values({ type: "christian_school", name: `Other School ${suffix}`, slug: `cal-other-${suffix}` }).returning();
    const [site] = await db.insert(sites)
      .values({ organizationId: hostOrg!.id, name: "Main", slug: `cal-main-${suffix}` }).returning();
    const [otherSite] = await db.insert(sites)
      .values({ organizationId: otherOrg!.id, name: "Other", slug: `cal-oth-${suffix}` }).returning();
    const [program] = await db.insert(programs).values({
      organizationId: hostOrg!.id, siteId: site!.id, jurisdictionId: jurisdiction!.id,
      type: "high_school_extension", status: "active", name: "Cal HS",
      slug: `cal-hs-${suffix}`, gradeRange: { min: "9", max: "12" },
      deliveryModel: { onsite: true }, hostOrganizationId: hostOrg!.id,
      academicProviderOrganizationId: hostOrg!.id, creditIssuingOrganizationId: hostOrg!.id,
    }).returning();

    const [registrar, teacher, otherTeacher, guardian, studentPerson] = await db.insert(people).values([
      { legalFirstName: "Rae", legalLastName: `Registrar-${suffix}` },
      { legalFirstName: "Tess", legalLastName: `Teacher-${suffix}` },
      { legalFirstName: "Omar", legalLastName: `OtherTeacher-${suffix}` },
      { legalFirstName: "Gail", legalLastName: `Guardian-${suffix}` },
      { legalFirstName: "Sam", legalLastName: `Student-${suffix}` },
    ]).returning();

    const [gradeScale] = await db.insert(gradeScales).values({
      owningOrganizationId: hostOrg!.id, name: "Std", version: 1,
      configuration: { entries: [{ label: "A", minPercent: 90, maxPercent: 100, gpaPoints: 4, passing: true }] },
      effectiveFrom: "2027-08-16",
    }).returning();
    const [year] = await db.insert(schoolYears).values({
      organizationId: hostOrg!.id, programId: program!.id, siteId: site!.id,
      key: `2027-${suffix}`, name: "2027–2028", status: "active",
      startsOn: "2027-08-16", endsOn: "2028-06-02",
      gradeScaleId: gradeScale!.id, timezone: "America/Los_Angeles",
    }).returning();
    const [term] = await db.insert(terms).values({
      schoolYearId: year!.id, key: `fall-${suffix}`, name: "Fall",
      sequence: 1, startsOn: "2027-08-16", endsOn: "2027-12-19",
    }).returning();
    const [course] = await db.insert(courseTemplates).values({
      owningOrganizationId: hostOrg!.id, code: `CAL-${suffix}`, title: "Calendar Arts", subject: "General",
    }).returning();
    const [version] = await db.insert(courseTemplateVersions)
      .values({ courseTemplateId: course!.id, version: 1, status: "published" }).returning();
    const [section] = await db.insert(sections).values({
      programId: program!.id, siteId: site!.id, courseTemplateVersionId: version!.id,
      code: "CAL-1", title: "Calendar Arts", termId: term!.id,
    }).returning();
    await db.insert(sectionTeachers).values({ sectionId: section!.id, personId: teacher!.id });

    const registrarActor = staffActor(registrar!.id, "registrar", { siteIds: [site!.id], programIds: [program!.id] });
    const offSiteRegistrar = staffActor(registrar!.id, "registrar", { siteIds: [otherSite!.id], programIds: [program!.id] });
    const teacherActor = staffActor(teacher!.id, "teacher", { siteIds: [site!.id], programIds: [program!.id] });
    const otherTeacherActor = staffActor(otherTeacher!.id, "teacher", { siteIds: [site!.id], programIds: [program!.id] });
    const guardianActor: Actor = {
      accountId: `acct-g-${suffix}`, sessionId: `sess-g-${suffix}`, grantId: `grant-g-${suffix}`,
      actorPersonId: guardian!.id, role: "guardian",
      capabilities: new Set(["calendar.event.create"]), scope: { siteIds: [site!.id] },
    };

    const start = new Date(Date.now() + 7 * 86400000);
    const end = new Date(start.getTime() + 3600000);

    // --- Site event: registrar manages, participants are notified -----------
    const [siteEvent] = await db.insert(calendarEvents).values({
      type: "site_event", title: `Assembly ${suffix}`, description: "All-school assembly",
      startsAt: start, endsAt: end, timezone: "America/Los_Angeles",
      organizationId: hostOrg!.id, siteId: site!.id, programId: program!.id,
      createdByPersonId: registrar!.id,
      scheduledOccurrenceId: await createOccurrence({
        startsAt: start, endsAt: end, timezone: "America/Los_Angeles",
        organizationId: hostOrg!.id, siteId: site!.id, programId: program!.id,
        createdByPersonId: registrar!.id,
      }),
    }).returning();
    await db.insert(calendarEventParticipants).values([
      { calendarEventId: siteEvent!.id, participantType: "person", participantId: studentPerson!.id, role: "attendee" },
      { calendarEventId: siteEvent!.id, participantType: "person", participantId: guardian!.id, role: "attendee" },
    ]);

    const newStart = new Date(start.getTime() + 86400000);
    const newEnd = new Date(end.getTime() + 86400000);
    await reviseCalendarEventForActor(registrarActor, {
      action: "reschedule", eventId: siteEvent!.id,
      startsAt: newStart.toISOString(), endsAt: newEnd.toISOString(),
    });
    const [moved] = await db.select().from(calendarEvents).where(eq(calendarEvents.id, siteEvent!.id));
    expect(moved!.startsAt.toISOString()).toBe(newStart.toISOString());
    expect(moved!.endsAt?.toISOString()).toBe(newEnd.toISOString());
    const [movedOccurrence] = await db.select().from(scheduledOccurrences)
      .where(eq(scheduledOccurrences.id, moved!.scheduledOccurrenceId));
    expect(movedOccurrence!.startsAt.toISOString()).toBe(newStart.toISOString());
    expect(movedOccurrence!.endsAt?.toISOString()).toBe(newEnd.toISOString());

    const participantNotices = await db.select().from(notifications).where(and(
      eq(notifications.resourceType, "calendar_event"),
      eq(notifications.resourceId, siteEvent!.id),
      eq(notifications.type, "calendar_event_update"),
    ));
    // Both attendees notified; the acting registrar is not a participant here.
    expect(participantNotices.map((n) => n.recipientPersonId).sort())
      .toEqual([guardian!.id, studentPerson!.id].sort());
    expect(participantNotices[0]!.title).toContain("rescheduled");

    // Same-time reschedule is a no-op: no duplicate notification.
    await reviseCalendarEventForActor(registrarActor, {
      action: "reschedule", eventId: siteEvent!.id,
      startsAt: newStart.toISOString(), endsAt: newEnd.toISOString(),
    });
    expect(
      (await db.select().from(notifications).where(eq(notifications.resourceId, siteEvent!.id))).length,
    ).toBe(2);

    // Off-site registrar is denied without mutation.
    await expect(
      reviseCalendarEventForActor(offSiteRegistrar, { action: "cancel", eventId: siteEvent!.id }),
    ).rejects.toThrow("calendar site scope");
    // Guardians cannot manage site events at all.
    await expect(
      reviseCalendarEventForActor(guardianActor, { action: "cancel", eventId: siteEvent!.id }),
    ).rejects.toThrow("calendar event management");

    // Registrar cancels: soft cancel, notification, domain event, audit.
    await reviseCalendarEventForActor(registrarActor, { action: "cancel", eventId: siteEvent!.id });
    const [cancelledEvent] = await db.select().from(calendarEvents).where(eq(calendarEvents.id, siteEvent!.id));
    expect(cancelledEvent!.metadata.cancelled).toBe(true);
    const cancelNotices = await db.select().from(notifications).where(and(
      eq(notifications.resourceId, siteEvent!.id), eq(notifications.type, "calendar_event_update")));
    expect(cancelNotices).toHaveLength(4); // 2 reschedule + 2 cancel
    await expect(
      reviseCalendarEventForActor(registrarActor, { action: "cancel", eventId: siteEvent!.id }),
    ).rejects.toThrow("Cancelled event cannot be changed");

    const siteDomainEvents = await db.select().from(domainEvents).where(and(
      eq(domainEvents.aggregateType, "calendar_event"), eq(domainEvents.aggregateId, siteEvent!.id)));
    expect(siteDomainEvents.map((e) => e.eventType).sort())
      .toEqual(["CalendarEventCancelled", "CalendarEventRescheduled"]);
    const rescheduleEvent = siteDomainEvents.find((event) => event.eventType === "CalendarEventRescheduled");
    expect(rescheduleEvent?.payload).toMatchObject({
      action: "reschedule",
      before: { startsAt: start.toISOString() },
      after: { startsAt: newStart.toISOString(), endsAt: newEnd.toISOString() },
    });
    const cancellationEvent = siteDomainEvents.find((event) => event.eventType === "CalendarEventCancelled");
    expect(cancellationEvent?.payload).toMatchObject({
      action: "cancel",
      after: { cancelled: true },
    });

    // --- Section event: assigned teacher edits; other teacher denied ---------
    const [sectionEvent] = await db.insert(calendarEvents).values({
      type: "live_class", title: `Studio block ${suffix}`,
      startsAt: start, endsAt: end, timezone: "America/Los_Angeles",
      organizationId: hostOrg!.id, siteId: site!.id, programId: program!.id, sectionId: section!.id,
      createdByPersonId: teacher!.id,
      scheduledOccurrenceId: await createOccurrence({
        startsAt: start, endsAt: end, timezone: "America/Los_Angeles",
        organizationId: hostOrg!.id, siteId: site!.id, programId: program!.id,
        sectionId: section!.id, createdByPersonId: teacher!.id,
      }),
    }).returning();

    await reviseCalendarEventForActor(teacherActor, {
      action: "edit", eventId: sectionEvent!.id,
      title: "Studio block (updated)", description: "Bring sketchbooks",
    });
    const [edited] = await db.select().from(calendarEvents).where(eq(calendarEvents.id, sectionEvent!.id));
    expect(edited!.title).toBe("Studio block (updated)");
    expect(edited!.description).toBe("Bring sketchbooks");

    await expect(
      reviseCalendarEventForActor(otherTeacherActor, {
        action: "edit", eventId: sectionEvent!.id, title: "Hijacked title",
      }),
    ).rejects.toThrow("section event teaching assignment");
    const [unchanged] = await db.select().from(calendarEvents).where(eq(calendarEvents.id, sectionEvent!.id));
    expect(unchanged!.title).toBe("Studio block (updated)");

    // --- Personal event: owner only ------------------------------------------
    const [personal] = await db.insert(calendarEvents).values({
      type: "personal", title: `Dentist ${suffix}`,
      startsAt: start, timezone: "America/Los_Angeles",
      createdByPersonId: guardian!.id,
      scheduledOccurrenceId: await createOccurrence({
        startsAt: start, timezone: "America/Los_Angeles",
        createdByPersonId: guardian!.id,
      }),
    }).returning();
    await db.insert(calendarEventParticipants).values({
      calendarEventId: personal!.id, participantType: "person",
      participantId: guardian!.id, role: "owner", responseStatus: "accepted",
    });

    await reviseCalendarEventForActor(guardianActor, {
      action: "edit", eventId: personal!.id, title: "Dentist (moved appointment)",
    });
    const [editedPersonal] = await db.select().from(calendarEvents).where(eq(calendarEvents.id, personal!.id));
    expect(editedPersonal!.title).toBe("Dentist (moved appointment)");

    await expect(
      reviseCalendarEventForActor(registrarActor, {
        action: "cancel", eventId: personal!.id,
      }),
    ).rejects.toThrow("personal event owner");

    // --- Source-owned events refuse direct edits ------------------------------
    const [owned] = await db.insert(calendarEvents).values({
      type: "study_group", title: `Group session ${suffix}`,
      startsAt: start, endsAt: end, timezone: "America/Los_Angeles",
      siteId: site!.id, sourceType: "study_group_session", sourceId: crypto.randomUUID(),
      createdByPersonId: teacher!.id,
      scheduledOccurrenceId: await createOccurrence({
        startsAt: start, endsAt: end, timezone: "America/Los_Angeles",
        siteId: site!.id, createdByPersonId: teacher!.id,
      }),
    }).returning();
    await expect(
      reviseCalendarEventForActor(registrarActor, {
        action: "reschedule", eventId: owned!.id, startsAt: newStart.toISOString(),
      }),
    ).rejects.toThrow("can only change through that workflow");

    // --- Audit coverage --------------------------------------------------------
    const audits = await db.select().from(auditEvents)
      .where(eq(auditEvents.resourceType, "calendar_event"));
    const actions = audits.map((row) => row.action);
    expect(actions).toContain("calendar.event.reschedule");
    expect(actions).toContain("calendar.event.cancel");
    expect(actions).toContain("calendar.event.edit");
  });
});
