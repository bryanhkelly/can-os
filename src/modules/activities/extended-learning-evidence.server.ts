import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  activities, activitySeasons, calendarEvents, documents, organizations, programs, sites,
} from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { isExtendedLearningType } from "@/domain/program-offerings";
import { assertCANSteward } from "@/domain/network-agreement-policy";
import {
  extendedSeasonApprovalCategories, extendedSeasonApprovalLabels,
  type ExtendedSeasonApprovalCategory,
} from "@/domain/extended-learning-approval";
import { readExtendedSeasonApprovals, extendedStaffingSignature } from "./extended-season-approvals.server";
import { extendedRegistrationOpeningReadiness, unavailableExtendedSeasonApprovals } from "./registration-policy";
import { validateDocumentUpload } from "@/modules/enrollment/r2-documents.server";
import { matchesEnrollmentDocumentSignature } from "@/domain/enrollment-document-signature";
import { createPrivateUploadUrl, signPrivateObjectUrl, verifyPrivateObject } from "@/platform/storage/r2";
import { emitEvent, writeAudit } from "@/platform/mutation";
import { EventTypes } from "@/domain/event-types";

const keyPattern = /^extended-learning\/[a-f0-9-]{36}\/[a-f0-9-]{36}$/i;
type Reader = Pick<typeof db, "select">;
type EvidenceInput = {
  seasonId: string; category: ExtendedSeasonApprovalCategory; expiresAt: string;
  fileName: string; mimeType: "application/pdf" | "image/jpeg" | "image/png"; size: number;
};
type ReviewInput = {
  seasonId: string; documentId: string; expectedVersion: number;
  decision: "approve" | "reject"; reason: string;
};

function assertUploadEnabled() {
  if (process.env.CAN_R2_SCHOOL_OPENING_UPLOADS_ENABLED !== "true")
    throw new Error("Private operational-evidence uploads are disabled on this deployment");
}

async function seasonIdentity(reader: Reader, seasonId: string) {
  const [season] = await reader.select({
    seasonId: activitySeasons.id, seasonName: activitySeasons.name,
    seasonStatus: activitySeasons.status, programId: programs.id,
    programStatus: programs.status, programType: programs.type,
    programSiteId: programs.siteId, siteId: activities.siteId,
    organizationId: programs.organizationId,
    academicProviderOrganizationId: programs.academicProviderOrganizationId,
    creditIssuerId: programs.creditIssuingOrganizationId,
    capacity: activitySeasons.capacity, siteOrganizationId: sites.organizationId,
  }).from(activitySeasons)
    .innerJoin(activities, eq(activities.id, activitySeasons.activityId))
    .innerJoin(programs, eq(programs.id, activities.programId))
    .innerJoin(sites, eq(sites.id, activities.siteId))
    .where(eq(activitySeasons.id, seasonId)).limit(1);
  if (!season || !season.programSiteId ||
      season.siteId !== season.programSiteId ||
      season.siteOrganizationId !== season.organizationId ||
      !isExtendedLearningType(season.programType) || season.creditIssuerId !== null)
    throw new AuthorizationError("valid hosted noncredit extended-learning season");
  return season;
}

function verifySubmitter(actor: AccessContext, season: Awaited<ReturnType<typeof seasonIdentity>>) {
  if (actor.demoFacilitator || actor.role !== "registrar" || !actor.actorPersonId ||
      !actor.scope.organizationIds?.includes(season.organizationId) ||
      !actor.scope.siteIds?.includes(season.siteId) ||
      !actor.scope.programIds?.includes(season.programId))
    throw new AuthorizationError("verified registrar for this Program and Site");
  assertCapability(actor, "program.launch.start");
}

async function verifyReviewer(actor: AccessContext, season: Awaited<ReturnType<typeof seasonIdentity>>,
  reader: Reader) {
  if (actor.demoFacilitator || actor.scope.organizationIds?.length !== 1 ||
      !actor.scope.organizationIds?.includes(season.academicProviderOrganizationId))
    throw new AuthorizationError("independent academic provider reviewer");
  const [institution] = await reader.select({ id: organizations.id, type: organizations.type })
    .from(organizations)
    .where(eq(organizations.id, season.academicProviderOrganizationId)).limit(1);
  if (!institution) throw new AuthorizationError("existing academic provider");
  assertCANSteward(actor, institution, "network.agreements.verify");
}

async function assertReader(actor: AccessContext, season: Awaited<ReturnType<typeof seasonIdentity>>,
  reader: Reader) {
  if (actor.role === "registrar") verifySubmitter(actor, season);
  else await verifyReviewer(actor, season, reader);
}

async function staffingSignature(reader: Reader, seasonId: string) {
  const sessions = await reader.select({
    id: calendarEvents.id, seasonId: calendarEvents.sourceId,
    startsAt: calendarEvents.startsAt, endsAt: calendarEvents.endsAt,
    timezone: calendarEvents.timezone, metadata: calendarEvents.metadata,
    siteId: calendarEvents.siteId, programId: calendarEvents.programId,
    organizationId: calendarEvents.organizationId,
  }).from(calendarEvents).where(and(
    eq(calendarEvents.sourceType, "activity_season"),
    eq(calendarEvents.type, "extended_learning_session"),
    eq(calendarEvents.sourceId, seasonId),
  ));
  return extendedStaffingSignature(sessions);
}

export async function beginExtendedEvidenceUpload(actor: AccessContext, input: EvidenceInput) {
  assertUploadEnabled();
  validateDocumentUpload(input.fileName, input.mimeType, input.size);
  const season = await seasonIdentity(db, input.seasonId);
  verifySubmitter(actor, season);
  if (!["draft", "registration"].includes(season.seasonStatus))
    throw new Error("Evidence renewal is only available for a planned or registering season");
  if (new Date(input.expiresAt) <= new Date()) throw new Error("Evidence expiry must be in the future");
  const key = `extended-learning/${season.seasonId}/${randomUUID()}`;
  return { key, uploadHeaders: { "Content-Type": input.mimeType, "If-None-Match": "*" },
    uploadUrl: createPrivateUploadUrl({
      key, keyPattern, contentType: input.mimeType, contentLength: input.size,
      minContentLength: 16, maxContentLength: 10 * 1024 * 1024,
      expiresSeconds: 180, preventOverwrite: true,
    }),
  };
}

export async function finishExtendedEvidenceUpload(actor: AccessContext,
  input: EvidenceInput & { key: string }) {
  assertUploadEnabled();
  validateDocumentUpload(input.fileName, input.mimeType, input.size);
  if (!keyPattern.test(input.key) || !input.key.startsWith(`extended-learning/${input.seasonId}/`))
    throw new AuthorizationError("private evidence key belongs to the selected Season");
  const initial = await seasonIdentity(db, input.seasonId);
  verifySubmitter(actor, initial);
  const expiry = new Date(input.expiresAt);
  if (expiry <= new Date()) throw new Error("Evidence expiry must be in the future");
  await verifyPrivateObject({
    key: input.key, keyPattern, expectedSize: input.size,
    expectedContentType: input.mimeType, verifySignature: matchesEnrollmentDocumentSignature,
  });
  return db.transaction(async tx => {
    await tx.select({ id: activitySeasons.id }).from(activitySeasons)
      .where(eq(activitySeasons.id, input.seasonId)).for("update").limit(1);
    const season = await seasonIdentity(tx, input.seasonId);
    verifySubmitter(actor, season);
    if (!["draft", "registration"].includes(season.seasonStatus))
      throw new Error("Season is no longer open for evidence renewal");
    const [existing] = await tx.select().from(documents).where(and(
      eq(documents.subjectType, "activity_season"), eq(documents.subjectId, season.seasonId),
      eq(documents.storageKey, input.key),
    )).limit(1);
    if (existing) {
      if (existing.uploadedByPersonId !== actor.actorPersonId || existing.category !== input.category ||
          existing.fileName !== input.fileName || existing.mimeType !== input.mimeType ||
          existing.metadata.size !== input.size ||
          existing.expiresAt?.toISOString() !== expiry.toISOString())
        throw new Error("This upload was previously recorded with different details");
      return { documentId: existing.id, version: existing.metadata.version as number, created: false };
    }
    const previous = await tx.select().from(documents).where(and(
      eq(documents.subjectType, "activity_season"),
      eq(documents.subjectId, season.seasonId), eq(documents.category, input.category),
    )).orderBy(desc(documents.createdAt), desc(documents.id));
    const now = new Date();
    const version = previous.reduce((value, doc) => Math.max(value,
      typeof doc.metadata.version === "number" ? doc.metadata.version : 0), 0) + 1;
    for (const doc of previous) if (doc.metadata.isCurrent !== false)
      await tx.update(documents).set({
        metadata: { ...doc.metadata, isCurrent: false, supersededAt: now.toISOString() },
        updatedAt: now,
      }).where(eq(documents.id, doc.id));
    const [created] = await tx.insert(documents).values({
      subjectType: "activity_season", subjectId: season.seasonId, category: input.category,
      fileName: input.fileName, mimeType: input.mimeType, storageProvider: "cloudflare_r2",
      storageKey: input.key, sensitivityTier: "restricted", expiresAt: expiry,
      uploadedByPersonId: actor.actorPersonId!, metadata: {
        version, size: input.size, isCurrent: true, storageVerified: true, reviewStatus: "pending",
        seasonId: season.seasonId, programId: season.programId, siteId: season.siteId,
        organizationId: season.organizationId,
        academicProviderOrganizationId: season.academicProviderOrganizationId,
        staffingSignature: input.category === "extended_learning_staffing"
          ? await staffingSignature(tx, season.seasonId) : null,
        submittedAt: now.toISOString(),
      },
    }).returning({ id: documents.id });
    if (!created) throw new Error("Could not record safety evidence");
    const scope = { organizationId: season.organizationId, siteId: season.siteId, programId: season.programId };
    await writeAudit(tx, actor, {
      action: "activity.season.evidence.submitted", entityType: "document",
      entityId: created.id, scope,
      after: { seasonId: season.seasonId, category: input.category, version,
        expiresAt: expiry.toISOString() },
    });
    await emitEvent(tx, {
      eventType: EventTypes.ExtendedLearningEvidenceSubmitted, aggregateType: "document",
      aggregateId: created.id, actorPersonId: actor.actorPersonId, ...scope,
      payload: { seasonId: season.seasonId, category: input.category, version },
    });
    return { documentId: created.id, version, created: true };
  });
}

export async function reviewExtendedEvidence(actor: AccessContext, input: ReviewInput) {
  const reason = input.reason.trim();
  if (reason.length < 10 || reason.length > 2000)
    throw new Error("Record a review reason of 10–2,000 characters");
  return db.transaction(async tx => {
    await tx.select({ id: activitySeasons.id }).from(activitySeasons)
      .where(eq(activitySeasons.id, input.seasonId)).for("update").limit(1);
    const season = await seasonIdentity(tx, input.seasonId);
    await verifyReviewer(actor, season, tx);
    const [document] = await tx.select().from(documents).where(and(
      eq(documents.id, input.documentId), eq(documents.subjectType, "activity_season"),
      eq(documents.subjectId, season.seasonId),
      inArray(documents.category, [...extendedSeasonApprovalCategories]),
    )).for("update").limit(1);
    if (!document || document.metadata.version !== input.expectedVersion)
      throw new Error("Evidence version changed; reload before review");
    const versions = await tx.select({ id: documents.id, metadata: documents.metadata }).from(documents).where(and(
      eq(documents.subjectType, "activity_season"), eq(documents.subjectId, season.seasonId),
      eq(documents.category, document.category),
    ));
    const latestVersion = Math.max(...versions.map(row => Number(row.metadata.version ?? 0)));
    if (Number(document.metadata.version) !== latestVersion || latestVersion !== input.expectedVersion || document.metadata.isCurrent !== true ||
        document.storageProvider !== "cloudflare_r2" || document.sensitivityTier !== "restricted" ||
        document.metadata.storageVerified !== true ||
        !keyPattern.test(document.storageKey) ||
        !document.storageKey.startsWith(`extended-learning/${season.seasonId}/`) ||
        document.metadata.seasonId !== season.seasonId ||
        document.metadata.programId !== season.programId ||
        document.metadata.siteId !== season.siteId ||
        document.metadata.organizationId !== season.organizationId ||
        document.metadata.academicProviderOrganizationId !== season.academicProviderOrganizationId)
      throw new AuthorizationError("current verified private evidence for this exact Season");
    if (!document.expiresAt || document.expiresAt <= new Date())
      throw new Error("Expired evidence must be renewed");
    if (document.uploadedByPersonId === actor.actorPersonId)
      throw new AuthorizationError("independent reviewer different from the evidence uploader");
    if (document.category === "extended_learning_staffing" &&
        document.metadata.staffingSignature !== await staffingSignature(tx, season.seasonId))
      throw new Error("Sessions or facilitators changed; upload a current staffing review");
    const prior = document.metadata.reviewStatus;
    if (prior === "approved" || prior === "rejected") {
      const decision = prior === "approved" ? "approve" : "reject";
      if (decision === input.decision && document.metadata.reviewReason === reason &&
          document.metadata.reviewedByPersonId === actor.actorPersonId)
        return { documentId: document.id, status: decision, changed: false };
      throw new Error("This version was already reviewed; submit a new version");
    }
    const now = new Date();
    await tx.update(documents).set({
      verifiedAt: input.decision === "approve" ? now : null,
      verifiedByPersonId: input.decision === "approve" ? actor.actorPersonId : null,
      metadata: { ...document.metadata,
        reviewStatus: input.decision === "approve" ? "approved" : "rejected",
        reviewReason: reason, reviewedByPersonId: actor.actorPersonId,
        reviewedAt: now.toISOString(),
      }, updatedAt: now,
    }).where(eq(documents.id, document.id));
    const scope = { organizationId: season.organizationId, siteId: season.siteId, programId: season.programId };
    await writeAudit(tx, actor, {
      action: "activity.season.evidence.reviewed", entityType: "document",
      entityId: document.id, scope,
      after: { category: document.category, version: input.expectedVersion,
        decision: input.decision, reason },
    });
    await emitEvent(tx, {
      eventType: EventTypes.ExtendedLearningEvidenceReviewed, aggregateType: "document",
      aggregateId: document.id, actorPersonId: actor.actorPersonId, ...scope,
      payload: { seasonId: season.seasonId, category: document.category,
        version: input.expectedVersion, decision: input.decision },
    });
    return { documentId: document.id, status: input.decision, changed: true };
  });
}

export async function readExtendedEvidence(actor: AccessContext, seasonId: string) {
  const season = await seasonIdentity(db, seasonId);
  await assertReader(actor, season, db);
  const docs = await db.select().from(documents).where(and(
    eq(documents.subjectType, "activity_season"), eq(documents.subjectId, seasonId),
    inArray(documents.category, [...extendedSeasonApprovalCategories]),
  )).orderBy(desc(documents.createdAt), desc(documents.id));
  const now = new Date();
  const approvals = (await readExtendedSeasonApprovals([{
    seasonId, programId: season.programId, siteId: season.siteId,
    organizationId: season.organizationId,
    academicProviderOrganizationId: season.academicProviderOrganizationId,
    programStatus: season.programStatus, seasonStatus: season.seasonStatus,
    siteMatchesProgram: true, capacity: season.capacity,
  }], db, now)).get(seasonId) ?? unavailableExtendedSeasonApprovals;
  return {
    seasonId, seasonName: season.seasonName, canSubmit: actor.role === "registrar",
    canReview: actor.role === "can_network_steward",
    uploadsEnabled: process.env.CAN_R2_SCHOOL_OPENING_UPLOADS_ENABLED === "true",
    opening: extendedRegistrationOpeningReadiness({
      programStatus: season.programStatus,
      seasonStatus: season.seasonStatus === "registration" ? "draft" : season.seasonStatus,
      siteMatchesProgram: true, capacity: season.capacity, ...approvals,
    }),
    categories: extendedSeasonApprovalCategories.map(category => {
      const latest = docs.filter(doc => doc.category === category)
        .sort((a, b) => Number(b.metadata.version ?? 0) - Number(a.metadata.version ?? 0))[0];
      return {
        category, title: extendedSeasonApprovalLabels[category],
        status: !latest ? "missing" as const :
          latest.expiresAt && latest.expiresAt <= now ? "expired" as const :
          latest.metadata.reviewStatus === "rejected" ? "rejected" as const :
          (category === "extended_learning_safeguarding" ? approvals.approvedSafeguardingCoverage :
           category === "extended_learning_staffing" ? approvals.verifiedOnsiteStaffing :
           category === "extended_learning_emergency" ? approvals.emergencyResponsePlanApproved :
           approvals.pickupAndReleasePolicyApproved) ? "approved" as const : "pending" as const,
        documentId: latest?.id ?? null,
        version: typeof latest?.metadata.version === "number" ? latest.metadata.version : null,
        fileName: latest?.fileName ?? null,
        expiresAt: latest?.expiresAt?.toISOString() ?? null,
        rejectionReason: latest?.metadata.reviewStatus === "rejected" ?
          String(latest.metadata.reviewReason ?? "") : null,
      };
    }),
  };
}

export async function listExtendedEvidenceReviews(actor: AccessContext) {
  if (actor.role !== "can_network_steward" || actor.demoFacilitator || !actor.actorPersonId ||
      actor.grantSiteId !== null || actor.scope.organizationIds?.length !== 1)
    throw new AuthorizationError("verified CAN evidence reviewer");
  const providerId = actor.scope.organizationIds[0]!;
  const [org] = await db.select({ id: organizations.id, type: organizations.type })
    .from(organizations).where(eq(organizations.id, providerId)).limit(1);
  if (!org) throw new AuthorizationError("academic provider");
  assertCANSteward(actor, org, "network.agreements.verify");
  return db.select({
    seasonId: activitySeasons.id, seasonName: activitySeasons.name,
    offeringName: activities.name, status: activitySeasons.status,
  }).from(activitySeasons)
    .innerJoin(activities, eq(activities.id, activitySeasons.activityId))
    .innerJoin(programs, eq(programs.id, activities.programId))
    .where(and(
      eq(programs.academicProviderOrganizationId, providerId),
      inArray(programs.type, ["summer_enrichment", "summer_program", "after_school_enrichment"]),
      inArray(activitySeasons.status, ["draft", "registration"]),
    )).limit(200);
}

export async function getExtendedEvidenceDownload(actor: AccessContext,
  input: { seasonId: string; documentId: string }) {
  const season = await seasonIdentity(db, input.seasonId);
  await assertReader(actor, season, db);
  const [document] = await db.select().from(documents).where(and(
    eq(documents.id, input.documentId),
    eq(documents.subjectType, "activity_season"),
    eq(documents.subjectId, season.seasonId),
    inArray(documents.category, [...extendedSeasonApprovalCategories]),
  )).limit(1);
  if (!document || document.storageProvider !== "cloudflare_r2" ||
      document.sensitivityTier !== "restricted" ||
      !keyPattern.test(document.storageKey) ||
      !document.storageKey.startsWith(`extended-learning/${season.seasonId}/`) ||
      document.metadata.storageVerified !== true ||
      document.metadata.siteId !== season.siteId ||
      document.metadata.organizationId !== season.organizationId ||
      document.metadata.academicProviderOrganizationId !== season.academicProviderOrganizationId)
    throw new AuthorizationError("private season evidence");
  await db.transaction(async tx => writeAudit(tx, actor, {
    action: "activity.season.evidence.read", entityType: "document", entityId: document.id,
    scope: { organizationId: season.organizationId, siteId: season.siteId, programId: season.programId },
    after: { category: document.category },
  }));
  return { downloadUrl: signPrivateObjectUrl({
    method: "GET", key: document.storageKey, keyPattern, expiresSeconds: 60,
  }) };
}
