import { and, asc, eq, gt, inArray, isNotNull, isNull, lte, notInArray, or } from "drizzle-orm";
import { db } from "@/db/client";
import {
  classParticipantDeliveries, domainEvents, accessAccounts, accountPersonGrants,
} from "@/db/schema";
import {
  canonicalClasses, canonicalClassEnrollments, canonicalClassEnrollmentInvitations,
  canonicalClassSessions, canonicalDeliverySessions, facilitatedClassroomPlans,
  canonicalEnrollmentSites, canonicalAccounts, canonicalAccountGrants,
  canonicalClassOfferingVersions,
  guardianAuthorities, learnerProfiles,
} from "@/db/canonical-v301";
import {
  dispatchOutboundMessages, type OutboundAdapter, type OutboundClaim,
  type OutboundPreparation,
} from "@/modules/communication/outbound-dispatcher.server";
import {
  sendNotificationEmailWithReceipt, type NotificationEmailMessage,
} from "@/modules/communication/notification-email.server";
import { suppressDemoEmailDelivery } from "@/domain/email-delivery-policy";
import { classSessionCalendarUid, renderCalendarInvitation, type CalendarInvitationEvent } from "@/domain/calendar-invitations";

const receipt = classParticipantDeliveries;
type Mail = NotificationEmailMessage;
function owned(claim: OutboundClaim) {
  return and(eq(receipt.id, claim.id), eq(receipt.status, "processing"),
    eq(receipt.leaseUntil, claim.leaseUntil));
}
type Meeting = {
  id: string; classId: string; startsAt: Date; endsAt: Date;
  state: "scheduled" | "started" | "cancelled";
};
async function meeting(sessionId: string): Promise<Meeting | null> {
  const [record] = await db.select({
    id: canonicalClassSessions.id, classId: canonicalClassSessions.classId,
    startsAt: canonicalDeliverySessions.startsAt, endsAt: canonicalDeliverySessions.endsAt,
    state: facilitatedClassroomPlans.state,
  }).from(canonicalClassSessions)
    .innerJoin(canonicalDeliverySessions,
      eq(canonicalDeliverySessions.id, canonicalClassSessions.deliverySessionId))
    .innerJoin(facilitatedClassroomPlans,
      eq(facilitatedClassroomPlans.id, canonicalClassSessions.classroomPlanId))
    .where(eq(canonicalClassSessions.id, sessionId)).limit(1);
  return record ?? null;
}
/** Single canonical query for upcoming calendar invitations and cancellations.
 * Keep the 101-row cap so both paths fail closed above 100 Sessions. */
async function upcomingMeetings(classId: string, now: Date): Promise<Meeting[]> {
  return db.select({
    id: canonicalClassSessions.id, classId: canonicalClassSessions.classId,
    startsAt: canonicalDeliverySessions.startsAt, endsAt: canonicalDeliverySessions.endsAt,
    state: facilitatedClassroomPlans.state,
  }).from(canonicalClassSessions)
    .innerJoin(canonicalDeliverySessions,
      eq(canonicalDeliverySessions.id, canonicalClassSessions.deliverySessionId))
    .innerJoin(facilitatedClassroomPlans,
      eq(facilitatedClassroomPlans.id, canonicalClassSessions.classroomPlanId))
    .where(and(eq(canonicalClassSessions.classId, classId),
      eq(facilitatedClassroomPlans.state, "scheduled"),
      gt(canonicalDeliverySessions.startsAt, now)))
    .orderBy(asc(canonicalDeliverySessions.startsAt)).limit(101);
}
function calendarEvent(row: Meeting, title: string, attendeeEmail: string, organizerEmail?: string): CalendarInvitationEvent {
  return {
    uid: classSessionCalendarUid(row.id), summary: title,
    attendeeEmail, organizerEmail,
    startsAt: row.startsAt, endsAt: row.endsAt,
    description: "Open CAN OS My Classes for the verified meeting location and learning materials.",
  };
}
function attachment(name: string, entries: readonly CalendarInvitationEvent[],
  method: "REQUEST" | "CANCEL"): NonNullable<Mail["attachments"]>[number] {
  return {
    filename: name, contentType: "text/calendar; charset=utf-8; method=" + method,
    content: Buffer.from(renderCalendarInvitation(entries, method), "utf8").toString("base64"),
  };
}
function localTime(value: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "full", timeStyle: "short", timeZone: timezone,
    }).format(value) + " (" + timezone + ")";
  } catch {
    return value.toISOString() + " (UTC)";
  }
}
function actionUrl(classId: string): string | undefined {
  try {
    const base = process.env.CAN_ACCESS_PUBLIC_ORIGIN;
    if (!base) return undefined;
    const url = new URL("/class?classId=" + encodeURIComponent(classId), base);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}
async function verifiedRecipient(
  recipientPersonId: string, enrollment: typeof canonicalClassEnrollments.$inferSelect | null,
  now: Date,
): Promise<string | null> {
  if (enrollment?.enrollmentMethod === "approval") {
    if (enrollment.enrolledByPersonId !== recipientPersonId) return null;
    // A minor's welcome/calendar mail goes only to a currently authorized
    // guardian with a verified CAN email and active guardian account grant.
    const authority = await db.select({ id: guardianAuthorities.id })
      .from(guardianAuthorities)
      .innerJoin(learnerProfiles, eq(learnerProfiles.id, guardianAuthorities.learnerId))
      .where(and(
        eq(guardianAuthorities.guardianPersonId, recipientPersonId),
        eq(learnerProfiles.personId, enrollment.learnerPersonId),
        isNotNull(guardianAuthorities.verifiedAt),
        lte(guardianAuthorities.verifiedAt, now),
        lte(guardianAuthorities.startsAt, now),
        or(isNull(guardianAuthorities.endsAt), gt(guardianAuthorities.endsAt, now)),
        inArray(guardianAuthorities.authorityKind, ["parent", "legal_guardian", "guardian", "enrollment"]),
      )).limit(1);
    if (!authority.length) return null;
    const rows = await db.select({ email: accessAccounts.emailNormalized })
      .from(accessAccounts)
      .innerJoin(accountPersonGrants,
        eq(accountPersonGrants.accountId, accessAccounts.id))
      .where(and(
        eq(accessAccounts.personId, recipientPersonId),
        eq(accountPersonGrants.personId, recipientPersonId),
        eq(accountPersonGrants.role, "guardian"),
        eq(accountPersonGrants.active, true),
        eq(accessAccounts.disabled, false),
        isNotNull(accessAccounts.emailVerifiedAt),
      )).limit(2);
    return rows.length > 0 && rows.every(r => r.email === rows[0]!.email)
      ? rows[0]!.email : null;
  }
  // Native adult learner or invitee. A verified mailbox alone is NOT a Person
  // grant, and canonical identity must never be inferred by email matching.
  if (enrollment && enrollment.learnerPersonId !== recipientPersonId) return null;
  const rows = await db.select({ email: canonicalAccounts.emailNormalized })
    .from(canonicalAccountGrants)
    .innerJoin(canonicalAccounts, eq(canonicalAccounts.id, canonicalAccountGrants.accountId))
    .where(and(
      eq(canonicalAccountGrants.personId, recipientPersonId),
      eq(canonicalAccountGrants.roleCode, "learner"),
      eq(canonicalAccountGrants.active, true),
      isNull(canonicalAccountGrants.revokedAt),
      isNotNull(canonicalAccounts.emailVerifiedAt),
      isNull(canonicalAccounts.disabledAt),
    )).limit(10);
  return rows.length > 0 && rows.every(r => r.email === rows[0]!.email)
    ? rows[0]!.email : null;
}
/** Durable Class participant delivery, using the shared lease/retry worker.
 * No email is sent from registration, Session scheduling or event projection.
 * Every send rechecks enrollment, account and current Session eligibility. */
const adapter = {
  async claim(now: Date, seenIds: readonly string[], leaseMs: number): Promise<OutboundClaim | null> {
    return db.transaction(async tx => {
      const [row] = await tx.select({ id: receipt.id, attempts: receipt.attempts })
        .from(receipt)
        .where(and(
          ...(seenIds.length ? [notInArray(receipt.id, [...seenIds])] : []),
          or(
            and(eq(receipt.status, "pending"),
              or(isNull(receipt.nextAttemptAt), lte(receipt.nextAttemptAt, now))),
            and(eq(receipt.status, "failed"), lte(receipt.nextAttemptAt, now)),
            and(eq(receipt.status, "processing"), lte(receipt.leaseUntil, now)),
          ),
        )).orderBy(asc(receipt.createdAt), asc(receipt.id))
        .limit(1).for("update", { skipLocked: true });
      if (!row) return null;
      const leaseUntil = new Date(now.getTime() + leaseMs);
      await tx.update(receipt).set({
        status: "processing", leaseUntil, updatedAt: now,
      }).where(eq(receipt.id, row.id));
      return { id: row.id, attempts: row.attempts, leaseUntil };
    });
  },
  async prepare(claim: OutboundClaim, now: Date): Promise<OutboundPreparation<Mail>> {
    const [record] = await db.select().from(receipt).where(owned(claim)).limit(1);
    if (!record) return { kind: "suppress", reason: "delivery_receipt_unavailable" };
    const [source] = await db.select().from(domainEvents)
      .where(eq(domainEvents.id, record.eventId)).limit(1);
    if (!source || source.status !== "processed")
      return { kind: "suppress", reason: "source_event_unavailable" };
    const [cls] = await db.select().from(canonicalClasses)
      .where(eq(canonicalClasses.id, record.classId)).limit(1);
    if (!cls || !cls.siteId) return { kind: "suppress", reason: "Class_missing_or_unscoped" };
    const [site] = await db.select({
      name: canonicalEnrollmentSites.name, timezone: canonicalEnrollmentSites.timeZone,
      status: canonicalEnrollmentSites.status,
    }).from(canonicalEnrollmentSites).where(eq(canonicalEnrollmentSites.id, cls.siteId)).limit(1);
    if (!site) return { kind: "suppress", reason: "Site_unavailable" };
    const cancellation=record.kind==="enrollment_cancelled";
    const enrollmentRequired=record.kind!=="invitation_issued"&&!cancellation;
    const [enrollment] = enrollmentRequired ? await db.select()
      .from(canonicalClassEnrollments)
      .where(and(eq(canonicalClassEnrollments.id, record.sourceId),
        eq(canonicalClassEnrollments.classId, cls.id),
        eq(canonicalClassEnrollments.status, "active"))).limit(1) : [];
    if (enrollmentRequired && !enrollment)
      return { kind: "suppress", reason: "Class_enrollment_no_longer_active" };
    const [cancelledEnrollment]=cancellation?await db.select()
      .from(canonicalClassEnrollments)
      .where(and(eq(canonicalClassEnrollments.id,record.sourceId),
        eq(canonicalClassEnrollments.classId,cls.id),
        inArray(canonicalClassEnrollments.status,["withdrawn","cancelled"])))
      .limit(1):[];
    if(cancellation&&!cancelledEnrollment)
      return {kind:"suppress",reason:"Class_enrollment_exit_not_current"};

    let invitation: typeof canonicalClassEnrollmentInvitations.$inferSelect | null = null;
    if (record.kind === "invitation_issued") {
      const [current] = await db.select().from(canonicalClassEnrollmentInvitations)
        .where(and(eq(canonicalClassEnrollmentInvitations.id, record.sourceId),
          eq(canonicalClassEnrollmentInvitations.classId, cls.id))).limit(1);
      invitation = current ?? null;
      if (!invitation || invitation.state !== "pending" ||
          invitation.learnerPersonId !== record.recipientPersonId ||
          invitation.expiresAt <= now)
        return { kind: "suppress", reason: "Class_invitation_expired_or_closed" };
      const [terms] = await db.select({
        state: canonicalClassOfferingVersions.state,
        methods: canonicalClassOfferingVersions.enrollmentMethods,
        opensAt: canonicalClassOfferingVersions.opensAt,
        closesAt: canonicalClassOfferingVersions.closesAt,
      }).from(canonicalClassOfferingVersions)
        .where(and(eq(canonicalClassOfferingVersions.id, invitation.classOfferingVersionId),
          eq(canonicalClassOfferingVersions.classId, cls.id))).limit(1);
      if(!terms||terms.state!=="published"||!terms.methods.includes("invitation")||
         (terms.opensAt&&terms.opensAt>now)||(terms.closesAt&&terms.closesAt<=now))
        return {kind:"suppress",reason:"Class_invitation_offering_no_longer_open"};
    }
    if (record.kind !== "session_changed" && !cancellation &&
        (cls.state !== "active" || site.status !== "active"))
      return { kind: "suppress", reason: "Class_or_Site_no_longer_open" };
    const email = await verifiedRecipient(record.recipientPersonId,
      enrollment??cancelledEnrollment??null,now);
    if (!email) return { kind: "suppress", reason: "verified_recipient_contact_unavailable" };
    if (suppressDemoEmailDelivery(email)) return { kind: "suppress", reason: "demo_email_destination" };
    const sender = process.env.CAN_NOTIFICATIONS_FROM_EMAIL ?? process.env.CAN_ACCESS_FROM_EMAIL;
    const organizerEmail = sender?.includes("<")
      ? sender.split("<").at(-1)?.replace(">", "").trim()
      : sender?.trim();
    const label = cls.title;
    const greeting = "Hello,\n\n";
    const view = "Sign in to CAN OS and open My Classes for the authoritative schedule, lessons and meeting access.";
    const assets: NonNullable<Mail["attachments"]> = [];
    let subject: string, text: string;
    if(cancellation){
      const upcoming=await upcomingMeetings(cls.id,now);
      if(upcoming.length>100)
        return {kind:"fail",reason:"Class_cancellation_schedule_exceeds_limit"};
      if(upcoming.length)assets.push(attachment("cancelled-class-sessions.ics",
        upcoming.map(row=>({...calendarEvent(row,label,email,organizerEmail),sequence:1})),
        "CANCEL"));
      subject="Class enrollment ended: "+label;
      text=greeting+"Your participation in "+label+" at "+site.name+
        " has ended. "+(upcoming.length
          ?"Future scheduled Sessions are cancelled in the attached calendar update."
          :"You have no future scheduled Sessions.")+
        "\n\n"+view;
    } else if (record.kind === "invitation_issued") {
      subject = "Class invitation: " + label;
      text = greeting + "You are invited to join " + label + " at " + site.name +
        ". This invitation expires " + localTime(invitation!.expiresAt, site.timezone) +
        ". Your seat is not reserved until you accept the current published terms.\n\n" + view;
    } else if (record.kind === "enrollment_confirmed") {
      const scheduled = await upcomingMeetings(cls.id, now);
      if (scheduled.length > 100)
        return { kind: "fail", reason: "Class_schedule_exceeds_email_series_limit" };
      if (scheduled.length) assets.push(attachment("class-schedule.ics",
        scheduled.map(row => calendarEvent(row, label, email, organizerEmail)), "REQUEST"));
      subject = "You're enrolled: " + label;
      text = greeting + "Your enrollment in " + label + " at " + site.name +
        " is confirmed. " + (scheduled.length
          ? "Your upcoming Class Sessions are attached as a calendar invitation. The first is " +
            localTime(scheduled[0]!.startsAt, site.timezone) + "."
          : "There are no upcoming scheduled Sessions yet. Check My Classes for updates.") +
        "\n\n" + view;
    } else {
      if (!record.classSessionId)
        return { kind: "suppress", reason: "Class_Session_reference_missing" };
      const original = await meeting(record.classSessionId);
      if (!original || original.classId !== cls.id)
        return { kind: "suppress", reason: "Class_Session_scope_mismatch" };
      if(record.kind==="session_reminder"){
        if(original.state!=="scheduled"||original.startsAt<=now)
          return {kind:"suppress",reason:"Class_Session_no_longer_upcoming"};
        subject="Upcoming Class Session: "+label;
        text=greeting+"Reminder: your Class Session for "+label+" is on "+
          localTime(original.startsAt,site.timezone)+".\n\n"+view;
      } else if (record.kind === "session_scheduled") {
        if (original.state !== "scheduled" || original.startsAt <= now)
          return { kind: "suppress", reason: "Class_Session_no_longer_upcoming" };
        assets.push(attachment("new-class-session.ics", [calendarEvent(original, label, email, organizerEmail)], "REQUEST"));
        subject = "New Class Session: " + label;
        text = greeting + "A Class Session has been scheduled for " + label +
          " on " + localTime(original.startsAt, site.timezone) + ".\n\n" + view;
      } else {
        if (original.state !== "cancelled")
          return { kind: "suppress", reason: "Class_Session_change_not_current" };
        assets.push(attachment("cancelled-class-session.ics",
          [{...calendarEvent(original, label, email, organizerEmail), sequence: 1}], "CANCEL"));
        const replacementId = source.payload?.replacementSessionId;
        const replacement = typeof replacementId === "string" ? await meeting(replacementId) : null;
        if (replacement && replacement.classId === cls.id &&
            replacement.state === "scheduled" && replacement.startsAt > now) {
          assets.push(attachment("replacement-class-session.ics",
            [calendarEvent(replacement, label, email, organizerEmail)], "REQUEST"));
          text = greeting + "The Session previously scheduled for " +
            localTime(original.startsAt, site.timezone) + " was cancelled. A replacement is scheduled for " +
            localTime(replacement.startsAt, site.timezone) + ".\n\n" + view;
          subject = "Class Session rescheduled: " + label;
        } else {
          subject = "Class Session cancelled: " + label;
          text = greeting + "The Session originally scheduled for " +
            localTime(original.startsAt, site.timezone) + " has been cancelled.\n\n" + view;
        }
      }
    }
    return { kind: "ready", message: {
      to: email, siteId: cls.siteId, subject, text, actionUrl: actionUrl(cls.id),
      ...(assets.length ? {attachments: assets} : {}),
    }};
  },
  async renew(claim: OutboundClaim, now: Date, leaseMs: number): Promise<OutboundClaim | null> {
    const leaseUntil = new Date(now.getTime() + leaseMs);
    const [row] = await db.update(receipt)
      .set({ leaseUntil, updatedAt: now })
      .where(owned(claim)).returning({ id: receipt.id });
    return row ? {...claim, leaseUntil} : null;
  },
  async send(message: Mail, key: string) {
    return sendNotificationEmailWithReceipt(message, "class-participant:" + key);
  },
  async settle(claim: OutboundClaim, result: {
    kind: "accepted" | "failed" | "suppressed"; now: Date; attempts: number;
    nextAttemptAt: Date | null; reason: string | null; providerMessageId?: string;
  }): Promise<boolean> {
    const [row] = await db.update(receipt).set({
      status: result.kind, attempts: result.attempts,
      nextAttemptAt: result.nextAttemptAt, leaseUntil: null,
      lastError: result.reason,
      acceptedAt: result.kind === "accepted" ? result.now : null,
      providerMessageId: result.providerMessageId ?? null,
      updatedAt: result.now,
    }).where(owned(claim)).returning({ id: receipt.id });
    return Boolean(row);
  },
  async attemptsAfterError(claim: OutboundClaim): Promise<number | null> {
    const [row] = await db.select({ attempts: receipt.attempts })
      .from(receipt).where(owned(claim)).limit(1);
    return row ? row.attempts + 1 : null;
  },
} satisfies OutboundAdapter<Mail>;

export async function processClassParticipantDeliveries(now = new Date(), limit = 30) {
  return dispatchOutboundMessages(adapter, { now, limit });
}
