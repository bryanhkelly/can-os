import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { accountPersonGrants, churchOnboardingRequests, documents, domainEvents, organizations } from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { AuthorizationError } from "@/domain/command-context";
import { assertCANSteward } from "@/domain/network-agreement-policy";
import { writeAudit } from "@/platform/mutation";
import { bootstrapVerifiedChurch } from "./church-onboarding.server";
import { EventTypes } from "@/domain/event-types";
import { STAFF_INVITATION_AGGREGATE } from "@/modules/identity/staff-invitations.server";
import { requestOneTimeAccessWithDeliveryStatus } from "@/modules/identity/passwordless-access.server";

export type ChurchApplication = {
  churchName: string;
  siteName: string;
  timezone: string;
  churchWebsite?: string;
  leaderTitle: string;
  contactEmail: string;
  firstName: string;
  lastName: string;
};

const slugPart = (name: string) => name.toLowerCase().normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "").slice(0, 52).replace(/-$/g, "") || "church";

/** Public submission never creates an identity, Site, invitation, or active membership. */
export async function submitChurchApplication(data: ChurchApplication) {
  const now = new Date();
  const email = data.contactEmail.trim().toLowerCase();
  try { new Intl.DateTimeFormat("en-US", { timeZone: data.timezone }); }
  catch { throw new Error("Choose a valid timezone"); }
  // The URL is optional; it is information for the human reviewer, not evidence of authority.
  if (data.churchWebsite) {
    const url = new URL(data.churchWebsite);
    if (url.protocol !== "https:" || !url.hostname.includes(".")) throw new Error("Use an HTTPS website URL");
  }
  await db.transaction(async tx => {
    // Serialize repeated applications from the same contact without trusting a request IP.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"church-apply:" + email}))`);
    const duplicate = await tx.select({ id: churchOnboardingRequests.id })
      .from(churchOnboardingRequests).where(and(
        eq(churchOnboardingRequests.contactEmail, email),
        eq(churchOnboardingRequests.churchName, data.churchName),
        inArray(churchOnboardingRequests.status, ["submitted", "verified", "approved"]),
      )).limit(1);
    if (duplicate.length) return;
    const recent = await tx.select({ id: churchOnboardingRequests.id })
      .from(churchOnboardingRequests).where(and(
        eq(churchOnboardingRequests.contactEmail, email),
        gt(churchOnboardingRequests.createdAt, new Date(now.getTime() - 24 * 3600 * 1000)),
      )).limit(1);
    if (recent.length) return;
    const [request] = await tx.insert(churchOnboardingRequests).values({
      churchName: data.churchName, churchSlug: "pending", siteName: data.siteName, siteSlug: "pending",
      timezone: data.timezone, churchWebsite: data.churchWebsite || null,
      leaderTitle: data.leaderTitle, contactEmail: email,
      firstName: data.firstName, lastName: data.lastName,
    }).returning({ id: churchOnboardingRequests.id });
    if (!request) throw new Error("Unable to submit church application");
    const suffix = request.id.slice(0, 12);
    await tx.update(churchOnboardingRequests).set({
      churchSlug: slugPart(data.churchName) + "-" + suffix,
      siteSlug: slugPart(data.siteName) + "-" + suffix,
    }).where(eq(churchOnboardingRequests.id, request.id));
  });
  return { accepted: true as const };
}

async function requireCANSteward(actor: AccessContext) {
  const ids = actor.scope.organizationIds ?? [];
  if (actor.demoFacilitator || ids.length !== 1 || actor.grantSiteId !== null || !actor.actorPersonId)
    throw new AuthorizationError("verified CAN organization-wide steward");
  const [can] = await db.select({ id: organizations.id, type: organizations.type })
    .from(organizations).where(eq(organizations.id, ids[0]!)).limit(1);
  if (!can) throw new AuthorizationError("CAN institution");
  assertCANSteward(actor, can, "network.admins.provision");
  return can.id;
}

export async function listChurchApplications(actor: AccessContext) {
  await requireCANSteward(actor);
  const requests = await db.select().from(churchOnboardingRequests)
    .orderBy(desc(churchOnboardingRequests.createdAt)).limit(100);
  const evidenceIds = requests.flatMap(request =>
    request.authorityDocumentId ? [request.authorityDocumentId] : []);
  const evidence = evidenceIds.length ? await db.select({
    id: documents.id, storageKey: documents.storageKey, metadata: documents.metadata,
    verifiedAt: documents.verifiedAt, verifiedByPersonId: documents.verifiedByPersonId,
  }).from(documents).where(inArray(documents.id, evidenceIds)) : [];
  const evidenceById = new Map(evidence.map(document => [document.id, document]));
  const withEvidence = requests.map(request => {
    const document = request.authorityDocumentId
      ? evidenceById.get(request.authorityDocumentId) : undefined;
    return {
      ...request,
      authorityEvidence: document ? {
        reference: document.storageKey,
        method: typeof document.metadata.verificationMethod === "string"
          ? document.metadata.verificationMethod : "unspecified",
        verifiedAt: document.verifiedAt,
        verifiedByPersonId: document.verifiedByPersonId,
      } : null,
    };
  });
  const grantIds = requests.flatMap(request =>
    request.status === "approved" && request.invitationGrantId ? [request.invitationGrantId] : []);
  if (!grantIds.length) return withEvidence.map(request => ({ ...request, invitationAcceptedAt: null as Date | null }));

  // Derive acceptance from the real access grant AND immutable invitation
  // acceptance event. Application approval alone is never proof of sign-in.
  const [grants, events] = await Promise.all([
    db.select({ id: accountPersonGrants.id, active: accountPersonGrants.active })
      .from(accountPersonGrants).where(inArray(accountPersonGrants.id, grantIds)),
    db.select({ grantId: domainEvents.aggregateId, occurredAt: domainEvents.occurredAt })
      .from(domainEvents).where(and(
        eq(domainEvents.aggregateType, STAFF_INVITATION_AGGREGATE),
        eq(domainEvents.eventType, EventTypes.StaffInvitationAccepted),
        inArray(domainEvents.aggregateId, grantIds),
      )),
  ]);
  const active = new Set(grants.filter(grant => grant.active).map(grant => grant.id));
  const acceptedAt = new Map(events.map(event => [event.grantId, event.occurredAt]));
  return withEvidence.map(request => ({
    ...request,
    invitationAcceptedAt: request.status === "approved" &&
      request.invitationGrantId && active.has(request.invitationGrantId)
      ? acceptedAt.get(request.invitationGrantId) ?? null : null,
  }));
}

/** A CAN verifier records *external* evidence actually examined, not a caller's declaration. */
export async function verifyChurchApplication(actor: AccessContext, input: {
  requestId: string; evidenceReference: string; verificationMethod: string;
}) {
  const canOrganizationId = await requireCANSteward(actor);
  const reference = input.evidenceReference.trim();
  const allowedMethods = ["signed_authority", "denominational_confirmation", "independent_church_confirmation"];
  if (!allowedMethods.includes(input.verificationMethod) || reference.length < 8 || reference.length > 500 || /[\u0000-\u001f\u007f]/.test(reference) || /^(?:javascript|data|file):/i.test(reference))
    throw new Error("A valid independent authority evidence reference and method are required");
  return db.transaction(async tx => {
    const [request] = await tx.select().from(churchOnboardingRequests)
      .where(eq(churchOnboardingRequests.id, input.requestId)).for("update").limit(1);
    if (!request || request.status !== "submitted") throw new Error("Application is no longer awaiting verification");
    const reused = await tx.select({ id: documents.id }).from(documents).where(and(
      eq(documents.category, "church_onboarding_authority"), eq(documents.storageKey, reference),
    )).limit(1);
    if (reused.length) throw new Error("Evidence reference is already registered; obtain an application-specific independent record");
    const [document] = await tx.insert(documents).values({
      subjectType: "organization", subjectId: canOrganizationId,
      category: "church_onboarding_authority",
      fileName: "Independently reviewed church authority (" + input.verificationMethod + ")",
      storageProvider: "external_verified_reference", storageKey: reference,
      sensitivityTier: "restricted",
      uploadedByPersonId: actor.actorPersonId!, verifiedByPersonId: actor.actorPersonId!,
      verifiedAt: new Date(),
      metadata: {
        churchSlug: request.churchSlug, authorizedEmailNormalized: request.contactEmail,
        churchRequestId: request.id, verificationMethod: input.verificationMethod,
      },
    }).returning({ id: documents.id });
    if (!document) throw new Error("Unable to record verified authority evidence");
    await tx.update(churchOnboardingRequests).set({
      status: "verified", authorityDocumentId: document.id,
      verifiedByPersonId: actor.actorPersonId, verifiedAt: new Date(), updatedAt: new Date(),
    }).where(eq(churchOnboardingRequests.id, request.id));
    await writeAudit(tx, actor, {
      action: "church.onboarding.authority.verified",
      entityType: "church_onboarding_request", entityId: request.id,
      scope: { organizationId: canOrganizationId },
      after: { authorityDocumentId: document.id, verificationMethod: input.verificationMethod },
    });
    return { verified: true as const };
  });
}

/** The approving steward must be distinct from the independent evidence verifier. */
export async function approveChurchApplication(actor: AccessContext, requestId: string) {
  const canOrganizationId = await requireCANSteward(actor);
  const [request] = await db.select().from(churchOnboardingRequests)
    .where(eq(churchOnboardingRequests.id, requestId)).limit(1);
  if (!request || request.status !== "verified" || !request.authorityDocumentId ||
      !request.verifiedByPersonId || request.verifiedByPersonId === actor.actorPersonId)
    throw new AuthorizationError("separately verified church application and independent approver");

  const [evidence] = await db.select({ id: documents.id, expiresAt: documents.expiresAt,
    verifiedAt: documents.verifiedAt, verifiedByPersonId: documents.verifiedByPersonId,
    metadata: documents.metadata, category: documents.category,
  }).from(documents).where(eq(documents.id, request.authorityDocumentId)).limit(1);
  if (!evidence || evidence.category !== "church_onboarding_authority" ||
      !evidence.verifiedAt || evidence.verifiedByPersonId !== request.verifiedByPersonId ||
      (evidence.expiresAt && evidence.expiresAt <= new Date()) ||
      evidence.metadata.churchRequestId !== request.id ||
      evidence.metadata.authorizedEmailNormalized !== request.contactEmail)
    throw new AuthorizationError("current, application-bound independent authority evidence");

  // The callback updates the approved request INSIDE the canonical bootstrap
  // transaction, so a failed/declined approval rolls back all new grants/Sites.
  const result = await bootstrapVerifiedChurch(actor, {
    churchName: request.churchName, churchSlug: request.churchSlug,
    siteName: request.siteName, siteSlug: request.siteSlug,
    timezone: request.timezone, contactEmail: request.contactEmail,
    firstName: request.firstName, lastName: request.lastName,
    authorityDocumentId: request.authorityDocumentId,
  }, {
    deferEmail: true,
    onProvisioned: async (tx, provision) => {
      const [locked] = await tx.select({
        status: churchOnboardingRequests.status,
        verifiedByPersonId: churchOnboardingRequests.verifiedByPersonId,
        authorityDocumentId: churchOnboardingRequests.authorityDocumentId,
      }).from(churchOnboardingRequests)
        .where(eq(churchOnboardingRequests.id, requestId)).for("update").limit(1);
      if (locked?.status !== "verified" ||
          locked.verifiedByPersonId !== request.verifiedByPersonId ||
          locked.authorityDocumentId !== request.authorityDocumentId)
        throw new Error("Application changed during approval; no invitation was issued");
      const [saved] = await tx.update(churchOnboardingRequests).set({
        status: "approved", approvedByPersonId: actor.actorPersonId,
        approvedAt: new Date(), updatedAt: new Date(),
        churchId: provision.churchId, siteId: provision.siteId,
        invitationGrantId: provision.grantId,
      }).where(and(eq(churchOnboardingRequests.id, requestId),
        eq(churchOnboardingRequests.status, "verified"),
        eq(churchOnboardingRequests.verifiedByPersonId, request.verifiedByPersonId!),
      )).returning({ id: churchOnboardingRequests.id });
      if (!saved) throw new Error("Application was already decided; refresh the review desk");
      await writeAudit(tx, actor, {
        action: "church.onboarding.request.approved",
        entityType: "church_onboarding_request", entityId: requestId,
        scope: { organizationId: canOrganizationId, siteId: provision.siteId },
        after: { authorityDocumentId: request.authorityDocumentId,
          churchId: provision.churchId, siteId: provision.siteId, grantId: provision.grantId },
      });
    },
  });
  // Delivery happens after the approved record, organization and invitation
  // commit. A mail outage cannot change approval or activate the grant.
  if (!result.invitationPending)
    return { ...result, approved: true as const, emailSent: false, invitationDeliveryStatus: "not_required" as const };
  try {
    const status = await requestOneTimeAccessWithDeliveryStatus(request.contactEmail);
    return { ...result, approved: true as const, emailSent: status === "dispatched",
      invitationDeliveryStatus: status };
  } catch {
    return { ...result, approved: true as const, emailSent: false,
      invitationDeliveryStatus: "failed" as const };
  }
}

export async function declineChurchApplication(actor: AccessContext, requestId: string, note: string) {
  const canOrganizationId = await requireCANSteward(actor);
  await db.transaction(async tx => {
    const [request] = await tx.select().from(churchOnboardingRequests)
      .where(eq(churchOnboardingRequests.id, requestId)).for("update").limit(1);
    if (!request || !["submitted", "verified"].includes(request.status))
      throw new Error("Application is already decided");
    if (request.authorityDocumentId) {
      // Evidence tied to a declined application cannot later authorize a manual bootstrap.
      await tx.update(documents).set({ expiresAt: new Date(), updatedAt: new Date() })
        .where(eq(documents.id, request.authorityDocumentId));
    }
    await tx.update(churchOnboardingRequests).set({
      status: "declined", decisionNote: note, updatedAt: new Date(),
    }).where(eq(churchOnboardingRequests.id, requestId));
    await writeAudit(tx, actor, {
      action: "church.onboarding.request.declined",
      entityType: "church_onboarding_request", entityId: requestId,
      scope: { organizationId: canOrganizationId },
      after: { note, authorityDocumentId: request.authorityDocumentId },
    });
  });
  return { declined: true as const };
}

/** Recovery path when the original approved invitation email was not delivered. */
export async function resendChurchInvitation(actor: AccessContext, requestId: string) {
  await requireCANSteward(actor);
  const [request] = await db.select({
    status: churchOnboardingRequests.status,
    contactEmail: churchOnboardingRequests.contactEmail,
    invitationGrantId: churchOnboardingRequests.invitationGrantId,
  }).from(churchOnboardingRequests).where(eq(churchOnboardingRequests.id, requestId)).limit(1);
  if (request?.status !== "approved" || !request.invitationGrantId)
    throw new AuthorizationError("approved church invitation");
  // Resend is an invitation-recovery action, not a generic login-link
  // generator. Once the canonical invitation is accepted, stop retrying it.
  const [grant] = await db.select({ active: accountPersonGrants.active })
    .from(accountPersonGrants)
    .where(eq(accountPersonGrants.id, request.invitationGrantId)).limit(1);
  if (grant?.active) {
    const accepted = await db.select({ id: domainEvents.id }).from(domainEvents)
      .where(and(
        eq(domainEvents.aggregateType, STAFF_INVITATION_AGGREGATE),
        eq(domainEvents.aggregateId, request.invitationGrantId),
        eq(domainEvents.eventType, EventTypes.StaffInvitationAccepted),
      )).limit(1);
    if (accepted.length) return { accepted: true as const, deliveryStatus: "already_accepted" as const };
  }
  const deliveryStatus = await requestOneTimeAccessWithDeliveryStatus(request.contactEmail);
  return { accepted: true as const, deliveryStatus };
}
