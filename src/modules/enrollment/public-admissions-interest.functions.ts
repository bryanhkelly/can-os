import { createServerFn } from "@tanstack/react-start";
import { parseInterestPageCursor, makeInterestPageCursor } from "@/domain/public-admissions-interest";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { and, desc, eq, inArray, lt, or } from "drizzle-orm";
import { db } from "@/db/client";
import { accessAccounts, accountPersonGrants, admissionOffers, applications, enrollments, programs, publicAdmissionsInterests, publicFamilyStartRequests, studentAccessConsents, studentProfiles } from "@/db/schema";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { requestConsentedInterestFamilyStart, resolvePrivateFamilyStartDestination } from "./private-family-start.server";
import { sendAccessLinkViaResend } from "@/modules/identity/resend-access-mail.server";
import { emitEvent, writeAudit } from "@/platform/mutation";

import { EventTypes } from "@/domain/event-types";
async function requireAdmissionsIntakeReader() {
  const actor = await getCommandContext(getRequest());
  const programIds = actor.scope.programIds;
  const organizationIds = actor.scope.organizationIds;
  if (actor.role !== "registrar" || !actor.actorPersonId ||
    !programIds?.length || !organizationIds?.length)
    throw new AuthorizationError("admissions intake registrar");
  assertCapability(actor, "enrollment.decide");
  return { ...actor, scope: { ...actor.scope, programIds, organizationIds } };
}

/**
 * Scoped inbox alongside GF22 admissions intake. An interest is never an
 * Application until staff verifies student/guardian identity and follows
 * the existing createAdmissionsInquiry command.
 */
const interestPageSize = 50;
/** Stable keyset cursor: tie-break equal creation timestamps by immutable ID. */
export const listPublicAdmissionsInterests = createServerFn({ method: "GET" })
  .validator((value: unknown) => z.object({
    cursor:z.string().max(80).optional(),
    interestId:z.string().uuid().optional(),
  }).strict().parse(value ?? {}))
  .handler(async ({data}) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const actor = await requireAdmissionsIntakeReader();
    const rows = await db.select({
      id: publicAdmissionsInterests.id,
      siteId: publicAdmissionsInterests.siteId,
      programId: publicAdmissionsInterests.programId,
      programName: programs.name,
      firstName: publicAdmissionsInterests.contactFirstName,
      lastName: publicAdmissionsInterests.contactLastName,
      email: publicAdmissionsInterests.contactEmail,
      message: publicAdmissionsInterests.message,
      status: publicAdmissionsInterests.status,
      source: publicAdmissionsInterests.source,
      invitationBatchId: publicAdmissionsInterests.invitationBatchId,
      invitationRecipientKey: publicAdmissionsInterests.invitationRecipientKey,
      consentAt: publicAdmissionsInterests.contactConsentAt,
      familyStartRequestId: publicAdmissionsInterests.familyStartRequestId,
      emailVerifiedAt: publicFamilyStartRequests.consumedAt,
      applicationLinkExpiresAt: publicFamilyStartRequests.expiresAt,
      applicationStage: applications.stage,
      studentProfileId: applications.studentProfileId,
      applicationSubmittedAt: applications.submittedAt,
      applicationId: publicAdmissionsInterests.applicationId,
      convertedAt: publicAdmissionsInterests.convertedAt,
      createdAt: publicAdmissionsInterests.createdAt,
      contactedAt: publicAdmissionsInterests.contactedAt,
    }).from(publicAdmissionsInterests)
      .innerJoin(programs, eq(programs.id, publicAdmissionsInterests.programId))
      .leftJoin(publicFamilyStartRequests,
        eq(publicFamilyStartRequests.id, publicAdmissionsInterests.familyStartRequestId))
      .leftJoin(applications, eq(applications.id, publicAdmissionsInterests.applicationId))
      .where(and(
        inArray(publicAdmissionsInterests.programId, actor.scope.programIds),
        inArray(programs.organizationId, actor.scope.organizationIds),
        inArray(publicAdmissionsInterests.siteId, actor.scope.siteIds ?? []),
        eq(publicAdmissionsInterests.siteId, programs.siteId),
        ...(data.interestId ? [eq(publicAdmissionsInterests.id,data.interestId)] : []),
        ...(!data.interestId && data.cursor ? [(() => {
          const cursor = parseInterestPageCursor(data.cursor!);
          return or(
            lt(publicAdmissionsInterests.createdAt,cursor.createdAt),
            and(eq(publicAdmissionsInterests.createdAt,cursor.createdAt),
              lt(publicAdmissionsInterests.id,cursor.id)),
          )!;
        })()] : []),
      )).orderBy(desc(publicAdmissionsInterests.createdAt),
        desc(publicAdmissionsInterests.id))
        .limit(data.interestId ? 1 : interestPageSize+1);
    const hasMore = !data.interestId && rows.length > interestPageSize;
    const pageRows = hasMore ? rows.slice(0,interestPageSize) : rows;
    const last = pageRows.at(-1);
    const nextCursor = hasMore && last
      ? makeInterestPageCursor(last) : null;
    // Link the consented interest to the canonical enrollment and access
    // records, not an assumed outcome from the application or invitation.
    const linkedApplicationIds = [...new Set(pageRows.flatMap(row => row.applicationId ? [row.applicationId] : []))];
    const linkedStudentIds = [...new Set(pageRows.flatMap(row => row.studentProfileId ? [row.studentProfileId] : []))];
    const [activeEnrollments, accessConsents, linkedOffers] = await Promise.all([
      linkedStudentIds.length ? db.select({
        studentProfileId: enrollments.studentProfileId,
        programId: enrollments.programId,
        schoolYearId: enrollments.schoolYearId,
        kind: enrollments.kind,
      }).from(enrollments).where(and(
        inArray(enrollments.studentProfileId, linkedStudentIds),
        eq(enrollments.status, "active"),
        inArray(enrollments.kind, ["program", "section"]),
      )) : Promise.resolve([]),
      linkedApplicationIds.length ? db.select({
        applicationId: studentAccessConsents.applicationId,
        status: studentAccessConsents.status,
      }).from(studentAccessConsents).where(
        inArray(studentAccessConsents.applicationId, linkedApplicationIds),
      ) : Promise.resolve([]),
      linkedApplicationIds.length ? db.select({
        applicationId: admissionOffers.applicationId,
        status: admissionOffers.status,
        issuedAt: admissionOffers.issuedAt,
        respondedAt: admissionOffers.respondedAt,
      }).from(admissionOffers).where(inArray(admissionOffers.applicationId, linkedApplicationIds))
        .orderBy(desc(admissionOffers.createdAt)) : Promise.resolve([]),
    ]);
    const latestOffers = new Map<string, typeof linkedOffers[number]>();
    for (const offer of linkedOffers) {
      if (!latestOffers.has(offer.applicationId) && offer.status !== "draft")
        latestOffers.set(offer.applicationId, offer);
    }
    const accessByApplication = new Map(accessConsents.map(consent => [consent.applicationId, consent.status]));
    const currentGrants = linkedApplicationIds.length ? await db.select({
      applicationId:studentAccessConsents.applicationId,
      programId:studentAccessConsents.programId,
      siteId:studentAccessConsents.siteId,
      studentProfileId:studentAccessConsents.studentProfileId,
    }).from(studentAccessConsents)
      .innerJoin(studentProfiles,eq(studentProfiles.id,studentAccessConsents.studentProfileId))
      .innerJoin(programs,eq(programs.id,studentAccessConsents.programId))
      .innerJoin(accessAccounts,eq(accessAccounts.emailNormalized,studentAccessConsents.studentEmail))
      .innerJoin(accountPersonGrants,eq(accountPersonGrants.accountId,accessAccounts.id))
      .where(and(
        inArray(studentAccessConsents.applicationId,linkedApplicationIds),
        eq(studentAccessConsents.status,"approved"),
        eq(accountPersonGrants.personId,studentProfiles.personId),
        eq(accountPersonGrants.organizationId,programs.organizationId),
        eq(accountPersonGrants.siteId,studentAccessConsents.siteId),
        eq(accountPersonGrants.role,"student"),
        eq(accountPersonGrants.active,true),
        eq(accountPersonGrants.isSynthetic,false),
        eq(accessAccounts.disabled,false),
      )) : [];

    // Admissions authority can change without affecting historical interest.
    // Resolve the canonical operating gate, not just Program status.
    const authorized = new Map<string, boolean>();
    await Promise.all([...new Set(pageRows.map(row => row.programId))].map(async programId => {
      try { await resolvePrivateFamilyStartDestination(db, programId); authorized.set(programId, true); }
      catch { authorized.set(programId, false); }
    }));
    return {items:pageRows.map(row => {
      const programEnrollmentYears = new Set(activeEnrollments.filter(enrollment =>
        enrollment.studentProfileId === row.studentProfileId &&
        enrollment.programId === row.programId && enrollment.kind === "program" &&
        enrollment.schoolYearId,
      ).map(enrollment => enrollment.schoolYearId));
      const activeEnrollment = programEnrollmentYears.size > 0;
      const placedInClass = activeEnrollment && activeEnrollments.some(enrollment =>
        enrollment.studentProfileId === row.studentProfileId &&
        enrollment.programId === row.programId && enrollment.kind === "section" &&
        programEnrollmentYears.has(enrollment.schoolYearId),
      );
      return {
      ...row,
      activeEnrollment,
      placedInClass,
      studentAccessStatus: row.applicationId
        ? accessByApplication.get(row.applicationId)==="approved" &&
          !currentGrants.some(grant=>grant.applicationId===row.applicationId &&
            grant.programId===row.programId && grant.siteId===row.siteId &&
            grant.studentProfileId===row.studentProfileId)
            ? "access_unavailable"
            : accessByApplication.get(row.applicationId)??"not_requested"
        : null,
      latestOfferStatus: row.applicationId ? latestOffers.get(row.applicationId)?.status ?? null : null,
      latestOfferIssuedAt: row.applicationId
        ? latestOffers.get(row.applicationId)?.issuedAt?.toISOString() ?? null : null,
      latestOfferRespondedAt: row.applicationId
        ? latestOffers.get(row.applicationId)?.respondedAt?.toISOString() ?? null : null,
      createdAt: row.createdAt.toISOString(),
      contactedAt: row.contactedAt?.toISOString() ?? null,
      convertedAt: row.convertedAt?.toISOString() ?? null,
      consentAt: row.consentAt?.toISOString() ?? null,
      emailVerifiedAt: row.emailVerifiedAt?.toISOString() ?? null,
      applicationLinkExpiresAt: row.applicationLinkExpiresAt?.toISOString() ?? null,
      canSendApplicationInvitation: authorized.get(row.programId) === true &&
        Boolean(row.consentAt) && !row.applicationId &&
        ["new","contacted"].includes(row.status) &&
        (!row.familyStartRequestId ||
          (!row.emailVerifiedAt && !!row.applicationLinkExpiresAt &&
            row.applicationLinkExpiresAt.getTime() <= Date.now())),
      applicationSubmittedAt: row.applicationSubmittedAt?.toISOString() ?? null,
      admissionsAuthorized: authorized.get(row.programId) === true,
      };
    }),nextCursor};
  });

/** Send the canonical adult-only verified-email application entry. The public
 * inquiry remains unverified contact data and no child or guardian authority
 * is created by this invitation. */
export const invitePublicAdmissionsInterestToApply = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({interestId:z.string().uuid()}).strict().parse(value))
  .handler(async ({data}) => {
    const actor = await requireAdmissionsIntakeReader();
    const [interest] = await db.select({
      id:publicAdmissionsInterests.id,status:publicAdmissionsInterests.status,
      applicationId:publicAdmissionsInterests.applicationId,
      siteId:publicAdmissionsInterests.siteId,programId:publicAdmissionsInterests.programId,
      organizationId:programs.organizationId,
      firstName:publicAdmissionsInterests.contactFirstName,
      lastName:publicAdmissionsInterests.contactLastName,
      email:publicAdmissionsInterests.contactEmail,
      consentAt:publicAdmissionsInterests.contactConsentAt,
      familyStartRequestId:publicAdmissionsInterests.familyStartRequestId,
    }).from(publicAdmissionsInterests)
      .innerJoin(programs,eq(programs.id,publicAdmissionsInterests.programId))
      .where(and(
        eq(publicAdmissionsInterests.id,data.interestId),
        eq(publicAdmissionsInterests.siteId,programs.siteId),
        inArray(publicAdmissionsInterests.programId,actor.scope.programIds),
        inArray(programs.organizationId,actor.scope.organizationIds),
        inArray(publicAdmissionsInterests.siteId,actor.scope.siteIds??[]),
      )).limit(1);
    if (!interest) throw new AuthorizationError("admissions interest scope");
    if (!["new","contacted"].includes(interest.status) || interest.applicationId)
      throw new Error("This inquiry is no longer available for an application invitation");
    if (!interest.consentAt)
      throw new Error("The adult has not requested follow-up; an imported address is not consent.");
    if (interest.familyStartRequestId) {
      const [previous] = await db.select({
        expiresAt: publicFamilyStartRequests.expiresAt,
        consumedAt: publicFamilyStartRequests.consumedAt,
      }).from(publicFamilyStartRequests)
        .where(eq(publicFamilyStartRequests.id, interest.familyStartRequestId)).limit(1);
      if (!previous) throw new Error("The previous family invitation is unavailable");
      // A verified family should proceed to its application; unexpired
      // challenges are never re-issued and an expired one may be replaced.
      if (previous.consumedAt || previous.expiresAt.getTime() > Date.now())
        return { requestId: interest.familyStartRequestId, created: false };
    }
    const destination = await resolvePrivateFamilyStartDestination(db,interest.programId);
    if (destination.siteId!==interest.siteId || destination.organizationId!==interest.organizationId)
      throw new AuthorizationError("private family application destination");
    const outcome = await requestConsentedInterestFamilyStart(interest.id,
      sendAccessLinkViaResend,{idempotencyKey:`consented-interest:${interest.id}:${Math.floor(Date.now() / (10 * 60 * 1000))}`});
    await db.transaction(async tx => {
      const [current] = await tx.select({id:publicAdmissionsInterests.id,
        status:publicAdmissionsInterests.status,contactedAt:publicAdmissionsInterests.contactedAt})
        .from(publicAdmissionsInterests).where(and(
          eq(publicAdmissionsInterests.id,interest.id),
          inArray(publicAdmissionsInterests.status,["new","contacted"]),
        )).for("update").limit(1);
      if (!current) throw new Error("Inquiry changed while the family invitation was sent");
      const now = new Date();
      await tx.update(publicAdmissionsInterests).set({status:"contacted",
        familyStartRequestId:outcome.requestId,
        contactedAt:current.contactedAt??now,updatedAt:now})
        .where(eq(publicAdmissionsInterests.id,interest.id));
      await writeAudit(tx,actor,{action:"admissions.public_interest.family_start_invite",
        entityType:"public_admissions_interest",entityId:interest.id,
        scope:{organizationId:interest.organizationId,siteId:interest.siteId,programId:interest.programId},
        before:{status:current.status},after:{status:"contacted",familyStartRequestId:outcome.requestId}});
      await emitEvent(tx,{eventType:EventTypes.PublicAdmissionsInterestStatusChanged,
        aggregateType:"public_admissions_interest",aggregateId:interest.id,
        actorPersonId:actor.actorPersonId,organizationId:interest.organizationId,
        siteId:interest.siteId,programId:interest.programId,
        payload:{status:"contacted",familyStartRequestId:outcome.requestId}});
    });
    return outcome;
  });

export const setPublicAdmissionsInterestStatus = createServerFn({ method: "POST" })
  .validator((v: unknown) => z.object({
    interestId: z.string().uuid(),
    status: z.enum(["contacted", "closed"]),
  }).strict().parse(v))
  .handler(async ({ data }) => {
    const actor = await requireAdmissionsIntakeReader();
    return db.transaction(async tx => {
      const [current] = await tx.select({
        id: publicAdmissionsInterests.id,
        status: publicAdmissionsInterests.status,
        siteId: publicAdmissionsInterests.siteId,
        programId: publicAdmissionsInterests.programId,
        organizationId: programs.organizationId,
        contactedAt: publicAdmissionsInterests.contactedAt,
      }).from(publicAdmissionsInterests)
        .innerJoin(programs, eq(programs.id, publicAdmissionsInterests.programId))
        .where(and(
          eq(publicAdmissionsInterests.id, data.interestId),
          eq(publicAdmissionsInterests.siteId, programs.siteId),
          inArray(publicAdmissionsInterests.programId, actor.scope.programIds ?? []),
          inArray(programs.organizationId, actor.scope.organizationIds ?? []),
          inArray(publicAdmissionsInterests.siteId, actor.scope.siteIds ?? []),
        )).for("update", { of: publicAdmissionsInterests }).limit(1);
      if (!current) throw new AuthorizationError("admissions interest scope");
      if (current.status === data.status) return { changed: false };
      if (current.status === "closed" || current.status === "converted")
        throw new Error("Closed or converted interest requests cannot be modified");
      const now = new Date();
      await tx.update(publicAdmissionsInterests).set({
        status: data.status,
        contactedAt: current.contactedAt ?? (data.status === "contacted" ? now : null),
        updatedAt: now,
      }).where(eq(publicAdmissionsInterests.id, current.id));
      await writeAudit(tx, actor, {
        action: "admissions.public_interest.status_change",
        entityType: "public_admissions_interest", entityId: current.id,
        scope: { organizationId: current.organizationId,
          siteId: current.siteId, programId: current.programId },
        before: { status: current.status },
        after: { status: data.status },
      });
      await emitEvent(tx, {
        eventType: EventTypes.PublicAdmissionsInterestStatusChanged,
        aggregateType: "public_admissions_interest",
        aggregateId: current.id,
        actorPersonId: actor.actorPersonId,
        organizationId: current.organizationId,
        siteId: current.siteId, programId: current.programId,
        payload: { status: data.status },
      });
      return { changed: true };
    });
  });
