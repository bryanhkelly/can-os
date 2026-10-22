import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { accountPersonGrants, organizations, siteAffiliations, sites } from "@/db/schema";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { emitEvent, writeAudit } from "@/platform/mutation";
import { assertNetworkSiteAccess } from "@/domain/network-site-policy";

const uuid = z.string().uuid();
const siteQuery = z.object({ siteId: uuid }).strict();
async function requireAffiliationHQ(capability: "network.affiliations.read" | "network.affiliations.review") {
  const actor = await getCommandContext(getRequest());
  if (actor.role !== "network_admin" || actor.grantSiteId !== null)
    throw new AuthorizationError("denomination HQ administrator");
  const ids = actor.scope.organizationIds ?? [];
  if (ids.length !== 1) throw new AuthorizationError("denomination HQ scope");
  const [organization] = await db.select({
    id: organizations.id, name: organizations.name, type: organizations.type,
  }).from(organizations).where(eq(organizations.id, ids[0]!)).limit(1);
  if (!organization) throw new AuthorizationError("denomination organization");
  assertNetworkSiteAccess(actor, organization, capability);
  const { requireCurrentNetworkAgreement } = await import("./network-agreement.server");
  await requireCurrentNetworkAgreement(db, organization.id);
  return { actor, organization };
}

const requestInput = z.object({
  siteId: uuid,
  denominationOrganizationId: uuid,
  note: z.string().trim().min(10).max(1000),
}).strict();

async function requireLocalSite(siteId: string, capability: "network.affiliations.request" | "network.affiliations.read") {
  const actor = await getCommandContext(getRequest());
  if (actor.role !== "registrar" || !actor.actorPersonId) throw new AuthorizationError("local school administrator");
  assertCapability(actor, capability);
  const [site] = await db.select({
    id: sites.id, name: sites.name, organizationId: sites.organizationId,
    organizationType: organizations.type,
  }).from(sites).innerJoin(organizations, eq(organizations.id, sites.organizationId))
    .where(eq(sites.id, siteId)).limit(1);
  if (!site || !actor.scope.organizationIds?.includes(site.organizationId) ||
      !actor.scope.siteIds?.includes(site.id) || site.organizationType === "denomination")
    throw new AuthorizationError("verified independent site membership");
  return { actor, site };
}

/** Requestable networks have a real verified active HQ grant; no school records are exposed. */
export const listAffiliationNetworks = createServerFn({ method: "GET" }).handler(async () => {
  const actor = await getCommandContext(getRequest());
  if (actor.role !== "registrar" || !actor.actorPersonId) throw new AuthorizationError("local school administrator");
  assertCapability(actor, "network.affiliations.read");
  const networks = await db.selectDistinct({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .innerJoin(accountPersonGrants, and(
      eq(accountPersonGrants.organizationId, organizations.id),
      eq(accountPersonGrants.role, "network_admin"),
      eq(accountPersonGrants.active, true),
      isNull(accountPersonGrants.siteId),
    ))
    .where(eq(organizations.type, "denomination"))
    .orderBy(asc(organizations.name));
  const { requireCurrentNetworkAgreement } = await import("./network-agreement.server");
  const allowed = await Promise.all(networks.map(async network => {
    try { await requireCurrentNetworkAgreement(db, network.id); return network; }
    catch (error) {
      if (error instanceof AuthorizationError) return null;
      throw error;
    }
  }));
  return { networks: allowed.filter((n): n is typeof networks[number] => n !== null) };
});

export const listSiteAffiliations = createServerFn({ method: "GET" })
  .validator((v: unknown) => siteQuery.parse(v))
  .handler(async ({ data }) => {
    await requireLocalSite(data.siteId, "network.affiliations.read");
    const entries = await db.select({
      id: siteAffiliations.id,
      denominationOrganizationId: siteAffiliations.denominationOrganizationId,
      denominationName: organizations.name,
      status: siteAffiliations.status,
      requestNote: siteAffiliations.requestNote,
      decisionReason: siteAffiliations.decisionReason,
      requestedAt: siteAffiliations.requestedAt,
      reviewedAt: siteAffiliations.reviewedAt,
    }).from(siteAffiliations)
      .innerJoin(organizations, eq(organizations.id, siteAffiliations.denominationOrganizationId))
      .where(eq(siteAffiliations.siteId, data.siteId))
      .orderBy(asc(organizations.name));
    return { entries };
  });

export const requestSiteAffiliation = createServerFn({ method: "POST" })
  .validator((v: unknown) => requestInput.parse(v))
  .handler(async ({ data }) => {
    const { actor, site } = await requireLocalSite(data.siteId, "network.affiliations.request");
    const [denomination] = await db.select({ id: organizations.id })
      .from(organizations).innerJoin(accountPersonGrants, and(
        eq(accountPersonGrants.organizationId, organizations.id),
        eq(accountPersonGrants.role, "network_admin"),
        eq(accountPersonGrants.active, true),
        isNull(accountPersonGrants.siteId),
      )).where(and(eq(organizations.id, data.denominationOrganizationId),
        eq(organizations.type, "denomination"))).limit(1);
    if (!denomination) throw new AuthorizationError("registered denomination network");
    const { requireCurrentNetworkAgreement } = await import("./network-agreement.server");
    await requireCurrentNetworkAgreement(db, denomination.id);

    return db.transaction(async tx => {
      const [created] = await tx.insert(siteAffiliations).values({
        siteId: site.id, denominationOrganizationId: denomination.id,
        requestNote: data.note, requestedByPersonId: actor.actorPersonId!,
      }).onConflictDoNothing().returning({ id: siteAffiliations.id });
      const [existing] = created ? [] : await tx.select({
        id: siteAffiliations.id, status: siteAffiliations.status,
        requestNote: siteAffiliations.requestNote,
      }).from(siteAffiliations).where(and(eq(siteAffiliations.siteId, site.id),
        eq(siteAffiliations.denominationOrganizationId, denomination.id))).for("update").limit(1);

      if (!created && !existing) throw new Error("Unable to resolve concurrent affiliation request");
      if (existing?.status === "pending") {
        if (existing.requestNote !== data.note) throw new Error("Pending request already exists with different details");
        return { affiliationId: existing.id, status: "pending" as const, created: false };
      }
      if (existing?.status === "approved") {
        return { affiliationId: existing.id, status: "approved" as const, created: false };
      }
      if (existing && !["rejected", "revoked"].includes(existing.status))
        throw new Error("Affiliation has an unsupported state");

      const affiliationId = created?.id ?? existing!.id;
      if (existing) {
        await tx.update(siteAffiliations).set({
          status: "pending", requestNote: data.note,
          requestedByPersonId: actor.actorPersonId!, requestedAt: new Date(),
          reviewedByPersonId: null, reviewedAt: null, decisionReason: null,
          updatedAt: new Date(),
        }).where(eq(siteAffiliations.id, affiliationId));
      }
      await emitEvent(tx, {
        eventType: EventTypes.SiteAffiliationRequested,
        aggregateType: "site_affiliation", aggregateId: affiliationId,
        actorPersonId: actor.actorPersonId,
        organizationId: site.organizationId, siteId: site.id,
        payload: { denominationOrganizationId: denomination.id },
      });
      await writeAudit(tx, actor, {
        action: "network.affiliation.request", entityType: "site_affiliation",
        entityId: affiliationId,
        scope: { organizationId: site.organizationId, siteId: site.id },
        before: existing ? { status: existing.status } : null,
        after: { status: "pending", denominationOrganizationId: denomination.id, note: data.note },
      });
      return { affiliationId, status: "pending" as const, created: true };
    });
  });

/** HQ sees only member-site identity and affiliation lifecycle, never students. */
export const listNetworkAffiliations = createServerFn({ method: "GET" }).handler(async () => {
  const { organization } = await requireAffiliationHQ("network.affiliations.read");
  const entries = await db.select({
    id: siteAffiliations.id, status: siteAffiliations.status,
    siteId: siteAffiliations.siteId, siteName: sites.name,
    siteOrganizationId: sites.organizationId, siteOrganizationName: organizations.name,
    requestNote: siteAffiliations.requestNote,
    decisionReason: siteAffiliations.decisionReason,
    requestedAt: siteAffiliations.requestedAt, reviewedAt: siteAffiliations.reviewedAt,
  }).from(siteAffiliations)
    .innerJoin(sites, eq(sites.id, siteAffiliations.siteId))
    .innerJoin(organizations, eq(organizations.id, sites.organizationId))
    .where(eq(siteAffiliations.denominationOrganizationId, organization.id))
    .orderBy(asc(sites.name));
  return { entries };
});

const reviewInput = z.object({
  affiliationId: uuid,
  decision: z.enum(["approve", "reject", "revoke"]),
  reason: z.string().trim().min(4).max(1000),
}).strict();

export const reviewNetworkAffiliation = createServerFn({ method: "POST" })
  .validator((v: unknown) => reviewInput.parse(v))
  .handler(async ({ data }) => {
    const { actor, organization } = await requireAffiliationHQ("network.affiliations.review");
    return db.transaction(async tx => {
      const [entry] = await tx.select({
        id: siteAffiliations.id, siteId: siteAffiliations.siteId,
        status: siteAffiliations.status,
        denominationOrganizationId: siteAffiliations.denominationOrganizationId,
      }).from(siteAffiliations).where(eq(siteAffiliations.id, data.affiliationId)).for("update").limit(1);
      if (!entry || entry.denominationOrganizationId !== organization.id)
        throw new AuthorizationError("denomination affiliation scope");
      const next = data.decision === "approve" ? "approved" :
        data.decision === "reject" ? "rejected" : "revoked";
      if ((entry.status !== "pending" || data.decision === "revoke") &&
          (entry.status !== "approved" || data.decision !== "revoke"))
        throw new Error("Affiliation decision is not valid for its current status");
      await tx.update(siteAffiliations).set({
        status: next, reviewedByPersonId: actor.actorPersonId, reviewedAt: new Date(),
        decisionReason: data.reason, updatedAt: new Date(),
      }).where(eq(siteAffiliations.id, entry.id));
      const eventType = data.decision === "approve" ? EventTypes.SiteAffiliationApproved :
        data.decision === "reject" ? EventTypes.SiteAffiliationRejected :
          EventTypes.SiteAffiliationRevoked;
      await emitEvent(tx, {
        eventType, aggregateType: "site_affiliation", aggregateId: entry.id,
        actorPersonId: actor.actorPersonId, organizationId: organization.id,
        siteId: entry.siteId, payload: { decision: next },
      });
      await writeAudit(tx, actor, {
        action: "network.affiliation." + data.decision, entityType: "site_affiliation", entityId: entry.id,
        scope: { organizationId: organization.id, siteId: entry.siteId },
        before: { status: entry.status },
        after: { status: next, reason: data.reason },
      });
      return { affiliationId: entry.id, status: next };
    });
  });

/** The school's owner may withdraw a pending application or revoke its own live affiliation. */
export const withdrawSiteAffiliation = createServerFn({ method: "POST" })
  .validator((v: unknown) => z.object({ siteId: uuid, affiliationId: uuid }).strict().parse(v))
  .handler(async ({ data }) => {
    const { actor, site } = await requireLocalSite(data.siteId, "network.affiliations.request");
    return db.transaction(async tx => {
      const [entry] = await tx.select({
        id: siteAffiliations.id, status: siteAffiliations.status,
        siteId: siteAffiliations.siteId,
      }).from(siteAffiliations).where(eq(siteAffiliations.id, data.affiliationId)).for("update").limit(1);
      if (!entry || entry.siteId !== site.id) throw new AuthorizationError("site affiliation scope");
      if (!["pending", "approved"].includes(entry.status))
        throw new Error("This affiliation cannot be withdrawn");
      await tx.update(siteAffiliations).set({
        status: "revoked", reviewedByPersonId: actor.actorPersonId!,
        reviewedAt: new Date(), decisionReason: "Withdrawn by site owner",
        updatedAt: new Date(),
      }).where(eq(siteAffiliations.id, entry.id));
      await emitEvent(tx, {
        eventType: EventTypes.SiteAffiliationRevoked, aggregateType: "site_affiliation",
        aggregateId: entry.id, actorPersonId: actor.actorPersonId,
        organizationId: site.organizationId, siteId: site.id,
        payload: { source: "site_owner" },
      });
      await writeAudit(tx, actor, {
        action: "network.affiliation.withdraw", entityType: "site_affiliation", entityId: entry.id,
        scope: { organizationId: site.organizationId, siteId: site.id },
        before: { status: entry.status }, after: { status: "revoked" },
      });
      return { affiliationId: entry.id, status: "revoked" as const };
    });
  });
