import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { applications, programs, publicAdmissionsInterests, publicFamilyStartRequests } from "@/db/schema";
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
export const listPublicAdmissionsInterests = createServerFn({ method: "GET" })
  .handler(async () => {
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
      )).orderBy(desc(publicAdmissionsInterests.createdAt)).limit(200);
    // Admissions authority can change without affecting historical interest.
    // Resolve the canonical operating gate, not just Program status.
    const authorized = new Map<string, boolean>();
    await Promise.all([...new Set(rows.map(row => row.programId))].map(async programId => {
      try { await resolvePrivateFamilyStartDestination(db, programId); authorized.set(programId, true); }
      catch { authorized.set(programId, false); }
    }));
    return rows.map(row => ({
      ...row,
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
    }));
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
