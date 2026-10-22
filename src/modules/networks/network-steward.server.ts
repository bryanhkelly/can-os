import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
  accessAccounts, accountPersonGrants, documents, networkAgreements, organizations, people,
} from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { AuthorizationError } from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";
import {
  assertCANSteward, assertVerifiedAgreementDocument, assertVerifiedHQAuthorityDocument,
} from "@/domain/network-agreement-policy";
import { emitEvent, writeAudit } from "@/platform/mutation";
import { requireCurrentNetworkAgreement } from "./network-agreement.server";

async function verifySteward(actor: AccessContext,
  capability: "network.agreements.verify" | "network.admins.provision") {
  const ids = actor.scope.organizationIds ?? [];
  if (ids.length !== 1 || actor.demoFacilitator) throw new AuthorizationError("verified CAN steward");
  const [organization] = await db.select({ id: organizations.id, type: organizations.type })
    .from(organizations).where(eq(organizations.id, ids[0]!)).limit(1);
  if (!organization) throw new AuthorizationError("CAN organization");
  assertCANSteward(actor, organization, capability);
}

export async function listAgreementDesk(actor: AccessContext) {
  await verifySteward(actor, "network.agreements.verify");
  const [networks, contracts] = await Promise.all([
    db.select({ id: organizations.id, name: organizations.name, slug: organizations.slug })
      .from(organizations).where(eq(organizations.type, "denomination")).orderBy(asc(organizations.name)),
    db.select({
      id: networkAgreements.id, denominationOrganizationId: networkAgreements.denominationOrganizationId,
      agreementReference: networkAgreements.agreementReference,
      evidenceDocumentId: networkAgreements.evidenceDocumentId,
      validFrom: networkAgreements.validFrom, validThrough: networkAgreements.validThrough,
      revokedAt: networkAgreements.revokedAt,
    }).from(networkAgreements),
  ]);
  return { networks, agreements: contracts };
}

export async function verifyAgreement(actor: AccessContext, input: {
  denominationOrganizationId: string;
  agreementReference: string;
  evidenceDocumentId: string;
  validFrom: Date;
  validThrough: Date;
}) {
  await verifySteward(actor, "network.agreements.verify");
  if (input.validFrom >= input.validThrough)
    throw new Error("Agreement expiration must be after its effective start");
  const [denomination] = await db.select({ id: organizations.id, type: organizations.type })
    .from(organizations).where(eq(organizations.id, input.denominationOrganizationId)).limit(1);
  if (denomination?.type !== "denomination") throw new AuthorizationError("denomination contract party");
  return db.transaction(async tx => {
    const [document] = await tx.select({
      subjectType: documents.subjectType, subjectId: documents.subjectId,
      category: documents.category, verifiedAt: documents.verifiedAt,
      verifiedByPersonId: documents.verifiedByPersonId, expiresAt: documents.expiresAt,
      metadata: documents.metadata,
    }).from(documents).where(eq(documents.id, input.evidenceDocumentId)).limit(1);
    assertVerifiedAgreementDocument(document, denomination.id);
    if (document!.verifiedByPersonId === actor.actorPersonId)
      throw new AuthorizationError("independent agreement evidence verifier");
    const [newAgreement] = await tx.insert(networkAgreements).values({
      denominationOrganizationId: denomination.id,
      agreementReference: input.agreementReference,
      evidenceDocumentId: input.evidenceDocumentId,
      validFrom: input.validFrom, validThrough: input.validThrough,
      verifiedByPersonId: actor.actorPersonId!,
    }).onConflictDoNothing().returning({ id: networkAgreements.id });
    if (!newAgreement) {
      const [existing] = await tx.select({
        id: networkAgreements.id, evidenceDocumentId: networkAgreements.evidenceDocumentId,
        validFrom: networkAgreements.validFrom, validThrough: networkAgreements.validThrough,
        revokedAt: networkAgreements.revokedAt,
      }).from(networkAgreements).where(and(
        eq(networkAgreements.denominationOrganizationId, denomination.id),
        eq(networkAgreements.agreementReference, input.agreementReference),
      )).limit(1);
      if (!existing || existing.revokedAt ||
          existing.evidenceDocumentId !== input.evidenceDocumentId ||
          existing.validFrom.getTime() !== input.validFrom.getTime() ||
          existing.validThrough.getTime() !== input.validThrough.getTime())
        throw new Error("Existing contract reference has different or revoked details");
      return { agreementId: existing.id, created: false as const };
    }
    await emitEvent(tx, {
      eventType: EventTypes.NetworkAgreementVerified,
      aggregateType: "network_agreement", aggregateId: newAgreement.id,
      actorPersonId: actor.actorPersonId, organizationId: denomination.id,
      payload: { evidenceDocumentId: input.evidenceDocumentId, agreementReference: input.agreementReference },
    });
    await writeAudit(tx, actor, {
      action: "network.agreement.verify", entityType: "network_agreement",
      entityId: newAgreement.id,
      scope: { organizationId: denomination.id },
      after: { evidenceDocumentId: input.evidenceDocumentId,
        agreementReference: input.agreementReference,
        validFrom: input.validFrom.toISOString(), validThrough: input.validThrough.toISOString() },
    });
    return { agreementId: newAgreement.id, created: true as const };
  });
}

export async function provisionHQOfficer(actor: AccessContext, input: {
  denominationOrganizationId: string;
  authorityDocumentId: string;
  email: string;
  firstName: string;
  lastName: string;
}) {
  await verifySteward(actor, "network.admins.provision");
  const [denomination] = await db.select({ id: organizations.id, type: organizations.type })
    .from(organizations).where(eq(organizations.id, input.denominationOrganizationId)).limit(1);
  if (denomination?.type !== "denomination") throw new AuthorizationError("denomination organization");
  return db.transaction(async tx => {
    // This contract check is repeated inside the same write transaction: possession
    // of an HQ grant alone is never the source of authority.
    const agreementId = await requireCurrentNetworkAgreement(tx, denomination.id);
    const [document] = await tx.select({
      subjectType: documents.subjectType, subjectId: documents.subjectId,
      category: documents.category, verifiedAt: documents.verifiedAt,
      verifiedByPersonId: documents.verifiedByPersonId, expiresAt: documents.expiresAt,
      metadata: documents.metadata,
    }).from(documents).where(eq(documents.id, input.authorityDocumentId)).limit(1);
    assertVerifiedHQAuthorityDocument(document, denomination.id, input.email);
    if (document!.verifiedByPersonId === actor.actorPersonId)
      throw new AuthorizationError("independent officer authorization verifier");

    let [account] = await tx.select({
      id: accessAccounts.id, disabled: accessAccounts.disabled,
    }).from(accessAccounts).where(eq(accessAccounts.emailNormalized, input.email)).limit(1);
    if (account?.disabled) throw new AuthorizationError("disabled HQ account");
    if (!account) {
      [account] = await tx.insert(accessAccounts).values({ emailNormalized: input.email })
        .returning({ id: accessAccounts.id, disabled: accessAccounts.disabled });
      await writeAudit(tx, actor, {
        action: "network.officer.account.create", entityType: "access_account",
        entityId: account!.id, scope: { organizationId: denomination.id },
        after: { accountId: account!.id },
      });
    }

    const priorPeople = await tx.select({ personId: accountPersonGrants.personId })
      .from(accountPersonGrants).where(eq(accountPersonGrants.accountId, account!.id));
    const uniquePeople = [...new Set(priorPeople.map(row => row.personId))];
    if (uniquePeople.length > 1)
      throw new AuthorizationError("ambiguous person identity for HQ account");
    let personId = uniquePeople[0];
    if (!personId) {
      const [person] = await tx.insert(people).values({
        legalFirstName: input.firstName, legalLastName: input.lastName, email: input.email,
      }).returning({ id: people.id });
      personId = person!.id;
      await writeAudit(tx, actor, {
        action: "network.officer.person.create", entityType: "person",
        entityId: personId, scope: { organizationId: denomination.id },
        after: { personId },
      });
    }
    const [existing] = await tx.select({ id: accountPersonGrants.id, active: accountPersonGrants.active })
      .from(accountPersonGrants).where(and(
        eq(accountPersonGrants.accountId, account!.id),
        eq(accountPersonGrants.personId, personId),
        eq(accountPersonGrants.organizationId, denomination.id),
        eq(accountPersonGrants.role, "network_admin"),
        isNull(accountPersonGrants.siteId),
      )).limit(1);
    if (existing?.active) return { grantId: existing.id, created: false as const };
    if (existing) throw new AuthorizationError("inactive HQ grants require separate reactivation review");

    const [grant] = await tx.insert(accountPersonGrants).values({
      accountId: account!.id, personId, organizationId: denomination.id,
      siteId: null, role: "network_admin", active: true,
    }).returning({ id: accountPersonGrants.id });
    await emitEvent(tx, {
      eventType: EventTypes.NetworkAdministratorProvisioned,
      aggregateType: "account_person_grant", aggregateId: grant!.id,
      actorPersonId: actor.actorPersonId,
      organizationId: denomination.id,
      payload: { accountId: account!.id, authorityDocumentId: input.authorityDocumentId, agreementId },
    });
    await writeAudit(tx, actor, {
      action: "network.officer.provision", entityType: "account_person_grant",
      entityId: grant!.id, scope: { organizationId: denomination.id },
      after: { accountId: account!.id, personId, role: "network_admin",
        authorityDocumentId: input.authorityDocumentId, agreementId },
    });
    return { grantId: grant!.id, created: true as const };
  });
}
