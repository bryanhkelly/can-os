import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { churchOnboardingRequests, documents, organizations } from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { AuthorizationError } from "@/domain/command-context";
import { assertCANSteward } from "@/domain/network-agreement-policy";
import { writeAudit } from "@/platform/mutation";
import { bootstrapVerifiedChurch } from "./church-onboarding.server";

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
    await tx.execute(
      // Serialize repeated applications from the same contact without trusting a request IP.
      (await import("drizzle-orm")).sql`SELECT pg_advisory_xact_lock(hashtext(${"church-apply:" + email}))`,
    );
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
  return db.select().from(churchOnboardingRequests)
    .orderBy(desc(churchOnboardingRequests.createdAt)).limit(100);
}

/** A CAN verifier records *external* evidence actually examined, not a caller's declaration. */
export async function verifyChurchApplication(actor: AccessContext, input: {
  requestId: string; evidenceReference: string; verificationMethod: string;
}) {
  const canOrganizationId = await requireCANSteward(actor);
  return db.transaction(async tx => {
    const [request] = await tx.select().from(churchOnboardingRequests)
      .where(eq(churchOnboardingRequests.id, input.requestId)).for("update").limit(1);
    if (!request || request.status !== "submitted") throw new Error("Application is no longer awaiting verification");
    const [document] = await tx.insert(documents).values({
      subjectType: "organization", subjectId: canOrganizationId,
      category: "church_onboarding_authority",
      fileName: "Independently reviewed church authority (" + input.verificationMethod + ")",
      storageProvider: "external_verified_reference", storageKey: input.evidenceReference,
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

  const result = await bootstrapVerifiedChurch(actor, {
    churchName: request.churchName, churchSlug: request.churchSlug,
    siteName: request.siteName, siteSlug: request.siteSlug,
    timezone: request.timezone, contactEmail: request.contactEmail,
    firstName: request.firstName, lastName: request.lastName,
    authorityDocumentId: request.authorityDocumentId,
  });
  await db.transaction(async tx => {
    const [saved] = await tx.update(churchOnboardingRequests).set({
      status: "approved", approvedByPersonId: actor.actorPersonId,
      approvedAt: new Date(), updatedAt: new Date(),
      churchId: result.churchId, siteId: result.siteId, invitationGrantId: result.grantId,
    }).where(and(eq(churchOnboardingRequests.id, requestId),
      eq(churchOnboardingRequests.status, "verified"),
      eq(churchOnboardingRequests.verifiedByPersonId, request.verifiedByPersonId!),
    )).returning({ id: churchOnboardingRequests.id });
    if (!saved) throw new Error("Application was already decided; refresh the review desk");
    await writeAudit(tx, actor, {
      action: "church.onboarding.request.approved",
      entityType: "church_onboarding_request", entityId: requestId,
      scope: { organizationId: canOrganizationId, siteId: result.siteId },
      after: { authorityDocumentId: request.authorityDocumentId,
        churchId: result.churchId, siteId: result.siteId, grantId: result.grantId },
    });
  });
  return { ...result, approved: true as const };
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
