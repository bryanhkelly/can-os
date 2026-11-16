import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { db } from "@/db/client";
import {
  auditEvents, learningAwardDefinitions, learningAwardDefinitionVersions,
  learningAwardIssuanceEvents, learningAwardIssuances, domainEvents, learnerAchievementDecisions,
  noncreditCompletionCertificates, noncreditCompletionDecisions,
  noncreditRegistrations, noncreditTrainingVersions,
} from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import { credentialIsCurrent, evaluateAchievementAward } from "@/domain/credential-awards";
import { getCanonicalCommandContext } from "@/modules/identity/canonical-command-context.server";
import { assertCurrentCredentialIssuer } from "@/modules/identity/canonical-sensitive-authorization.server";

const inputSchema = z.object({
  credentialDefinitionVersionId: z.string().uuid(),
  completionDecisionId: z.string().uuid(),
}).strict();

/**
 * Source command for an issuer-owned noncredit certificate or digital badge.
 * Deliberately not linked from any route while scoped DB issuance grants, RLS
 * and cross-organization acceptance are incomplete.
 */
export const issueNoncreditAchievement = createServerFn({ method: "POST" })
  .validator((value: unknown) => inputSchema.parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    if (process.env.CAN_CREDENTIAL_ISSUANCE_ENABLED !== "true")
      throw new AuthorizationError("credential issuance is not enabled");
    const actor = await getCanonicalCommandContext(getRequest());
    if (!actor.actorPersonId || !["registrar", "site_admin"].includes(actor.role ?? ""))
      throw new AuthorizationError("authorized credential issuer");
    // Credential issuance is NOT a role capability. A current, independently\n    // reviewed, expiring issuer approval is required inside the write transaction.

    return db.transaction(async tx => {
      const [definition] = await tx.select({
        versionId: learningAwardDefinitionVersions.id,
        lifecycle: learningAwardDefinitionVersions.lifecycle,
        definitionKind: learningAwardDefinitions.kind,
        sourceKind: learningAwardDefinitions.sourceKind,
        issuerOrganizationId: learningAwardDefinitions.issuerOrganizationId,
      }).from(learningAwardDefinitionVersions)
        .innerJoin(learningAwardDefinitions,
          eq(learningAwardDefinitionVersions.definitionId, learningAwardDefinitions.id))
        .where(eq(learningAwardDefinitionVersions.id, data.credentialDefinitionVersionId)).limit(1);

      if (!definition || definition.lifecycle !== "published" ||
        definition.sourceKind !== "noncredit_completion" ||
        !actor.scope.organizationIds?.includes(definition.issuerOrganizationId))
        throw new AuthorizationError("published issuer credential");

      const [completion] = await tx.select().from(noncreditCompletionDecisions)
        .where(eq(noncreditCompletionDecisions.id, data.completionDecisionId)).limit(1);
      if (!completion) throw new AuthorizationError("existing noncredit completion");

      // Serializes retries and issuance with completion correction commands.
      const [registration] = await tx.select().from(noncreditRegistrations)
        .where(eq(noncreditRegistrations.id, completion.registrationId))
        .for("update").limit(1);
      if (!registration) throw new AuthorizationError("owned registration");

      const [training] = await tx.select().from(noncreditTrainingVersions)
        .where(eq(noncreditTrainingVersions.id, registration.trainingVersionId)).limit(1);
      if (!training || training.state !== "published" ||
        training.providerOrganizationId !== definition.issuerOrganizationId ||
        !["registered", "active", "completed"].includes(registration.status))
        throw new AuthorizationError("provider-owned completed training");

      const [superseding] = await tx.select({ id: noncreditCompletionDecisions.id })
        .from(noncreditCompletionDecisions)
        .where(eq(noncreditCompletionDecisions.supersedesId, completion.id)).limit(1);

      const eligibility = evaluateAchievementAward({
        definitionPublished: definition.lifecycle === "published",
        issuerOrganizationId: definition.issuerOrganizationId,
        recipientPersonId: registration.participantPersonId,
        source: {
          kind: "noncredit_completion",
          participantPersonId: registration.participantPersonId,
          providerOrganizationId: training.providerOrganizationId,
          decisionId: completion.id,
          latestOutcome: completion.outcome,
          isCurrentDecision: !superseding,
        },
      });
      if (!eligibility.eligible) throw new AuthorizationError("valid current completion evidence");

      const [existing] = await tx.select({
        awardId: learnerAchievementDecisions.id,
        issuanceId: learningAwardIssuances.id,
        reference: learningAwardIssuances.credentialReference,
        legacyCertificateId: learningAwardIssuances.legacyNoncreditCertificateId,
        expiresAt: learningAwardIssuances.expiresAt,
      }).from(learnerAchievementDecisions)
        .leftJoin(learningAwardIssuances,
          eq(learningAwardIssuances.achievementDecisionId, learnerAchievementDecisions.id))
        .where(and(
          eq(learnerAchievementDecisions.credentialDefinitionVersionId, definition.versionId),
          eq(learnerAchievementDecisions.noncreditCompletionDecisionId, completion.id),
        )).limit(1);

      if (existing?.issuanceId) {
        const [revocation] = await tx.select({ id: learningAwardIssuanceEvents.id })
          .from(learningAwardIssuanceEvents).where(and(
            eq(learningAwardIssuanceEvents.issuanceId, existing.issuanceId),
            eq(learningAwardIssuanceEvents.eventKind, "revoked"),
          )).limit(1);
        const [legacy] = existing.legacyCertificateId
          ? await tx.select({ status: noncreditCompletionCertificates.status, certificateReference: noncreditCompletionCertificates.certificateReference })
            .from(noncreditCompletionCertificates)
            .where(eq(noncreditCompletionCertificates.id, existing.legacyCertificateId)).limit(1)
          : [];
        if (!credentialIsCurrent({
          issued: true, revoked: Boolean(revocation), sourceStillValid: true,
          legacyCertificateRevoked: !!existing.legacyCertificateId &&
            (legacy?.status !== "issued" || legacy?.certificateReference !== existing.reference),
          expiresAt: existing.expiresAt,
          now: new Date(),
        })) throw new AuthorizationError("issued credential is no longer current");
        return { issuanceId: existing.issuanceId, credentialReference: existing.reference,
          kind: definition.definitionKind, alreadyIssued: true };
      }
      if (existing) throw new AuthorizationError("incomplete credential issuance");

      await assertCurrentCredentialIssuer(tx,getRequest(),actor);
      const [award] = await tx.insert(learnerAchievementDecisions).values({
        credentialDefinitionVersionId: definition.versionId,
        recipientPersonId: registration.participantPersonId,
        noncreditCompletionDecisionId: completion.id,
        decidedByPersonId: actor.actorPersonId,
      }).returning({ id: learnerAchievementDecisions.id });
      if (!award) throw new Error("Unable to record achievement decision");

      let credentialReference = `CAN-${randomUUID()}`;
      let legacyCertificateId: string | null = null;
      if (definition.definitionKind === "completion_certificate") {
        const [priorCertificate] = await tx.select().from(noncreditCompletionCertificates)
          .where(eq(noncreditCompletionCertificates.decisionId, completion.id)).limit(1);
        if (priorCertificate && (priorCertificate.status !== "issued" ||
          priorCertificate.issuerOrganizationId !== definition.issuerOrganizationId))
          throw new AuthorizationError("existing certificate is invalid");
        if (priorCertificate) {
          legacyCertificateId = priorCertificate.id;
          // A reused canonical certificate is a single award with one reference.
          credentialReference = priorCertificate.certificateReference;
        } else {
          const [certificate] = await tx.insert(noncreditCompletionCertificates).values({
            decisionId: completion.id,
            issuerOrganizationId: definition.issuerOrganizationId,
            issuedByPersonId: actor.actorPersonId,
            certificateReference: credentialReference,
            status: "issued",
          }).returning({ id: noncreditCompletionCertificates.id });
          if (!certificate) throw new Error("Unable to record canonical noncredit certificate");
          legacyCertificateId = certificate.id;
        }
      }

      const [issuance] = await tx.insert(learningAwardIssuances).values({
        achievementDecisionId: award.id,
        issuerOrganizationId: definition.issuerOrganizationId,
        legacyNoncreditCertificateId: legacyCertificateId,
        issuedByPersonId: actor.actorPersonId,
        credentialReference,
      }).returning({ id: learningAwardIssuances.id });
      if (!issuance) throw new Error("Unable to record credential issuance");

      const payload = {
        definitionVersionId: definition.versionId,
        completionDecisionId: completion.id,
        kind: definition.definitionKind,
      };
      await tx.insert(auditEvents).values({
        actorPersonId: actor.actorPersonId, owningOrganizationId: definition.issuerOrganizationId,
        eventCode: "learning.credential.issued", entityKind: "credential_issuance",
        entityId: issuance.id, payload,
      });
      await tx.insert(domainEvents).values({
        actorPersonId: actor.actorPersonId,
        eventType: "CredentialIssued", aggregateType: "credential_issuance",
        aggregateId: issuance.id, payload,
      });
      return { issuanceId: issuance.id, credentialReference,
        kind: definition.definitionKind, alreadyIssued: false };
    });
  });
