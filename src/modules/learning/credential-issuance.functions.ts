import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { db } from "@/db/client";
import {
  auditEvents, credentialDefinitions, credentialDefinitionVersions,
  credentialIssuances, domainEvents, learnerAchievementDecisions,
  noncreditCompletionCertificates, noncreditCompletionDecisions,
  noncreditRegistrations, noncreditTrainingVersions,
} from "@/db/canonical-v301";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import { evaluateAchievementAward } from "@/domain/credential-awards";
import { getCanonicalCommandContext } from "@/modules/identity/canonical-command-context.server";

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
    assertCapability(actor, "credential.issue");

    return db.transaction(async tx => {
      const [definition] = await tx.select({
        versionId: credentialDefinitionVersions.id,
        lifecycle: credentialDefinitionVersions.lifecycle,
        definitionKind: credentialDefinitions.kind,
        sourceKind: credentialDefinitions.sourceKind,
        issuerOrganizationId: credentialDefinitions.issuerOrganizationId,
      }).from(credentialDefinitionVersions)
        .innerJoin(credentialDefinitions,
          eq(credentialDefinitionVersions.definitionId, credentialDefinitions.id))
        .where(eq(credentialDefinitionVersions.id, data.credentialDefinitionVersionId)).limit(1);

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
      if (!training || training.providerOrganizationId !== definition.issuerOrganizationId ||
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
        issuanceId: credentialIssuances.id,
        reference: credentialIssuances.credentialReference,
      }).from(learnerAchievementDecisions)
        .leftJoin(credentialIssuances,
          eq(credentialIssuances.achievementDecisionId, learnerAchievementDecisions.id))
        .where(and(
          eq(learnerAchievementDecisions.credentialDefinitionVersionId, definition.versionId),
          eq(learnerAchievementDecisions.noncreditCompletionDecisionId, completion.id),
        )).limit(1);

      if (existing?.issuanceId)
        return { issuanceId: existing.issuanceId, credentialReference: existing.reference,
          kind: definition.definitionKind, alreadyIssued: true };
      if (existing) throw new AuthorizationError("incomplete credential issuance");

      const [award] = await tx.insert(learnerAchievementDecisions).values({
        credentialDefinitionVersionId: definition.versionId,
        recipientPersonId: registration.participantPersonId,
        noncreditCompletionDecisionId: completion.id,
        decidedByPersonId: actor.actorPersonId,
      }).returning({ id: learnerAchievementDecisions.id });
      if (!award) throw new Error("Unable to record achievement decision");

      const credentialReference = `CAN-${randomUUID()}`;
      let legacyCertificateId: string | null = null;
      if (definition.definitionKind === "completion_certificate") {
        const [priorCertificate] = await tx.select().from(noncreditCompletionCertificates)
          .where(eq(noncreditCompletionCertificates.decisionId, completion.id)).limit(1);
        if (priorCertificate && (priorCertificate.status !== "issued" ||
          priorCertificate.issuerOrganizationId !== definition.issuerOrganizationId))
          throw new AuthorizationError("existing certificate is invalid");
        if (priorCertificate) {
          legacyCertificateId = priorCertificate.id;
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

      const [issuance] = await tx.insert(credentialIssuances).values({
        achievementDecisionId: award.id,
        issuerOrganizationId: definition.issuerOrganizationId,
        legacyNoncreditCertificateId: legacyCertificateId,
        issuedByPersonId: actor.actorPersonId,
        credentialReference,
      }).returning({ id: credentialIssuances.id });
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
