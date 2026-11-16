import { and, eq } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { db } from "@/db/client";
import {
  auditEvents, domainEvents, evidenceDocuments, evidenceDocumentVersions,
  learnerAchievementDecisions, learningAwardIssuanceEvents, learningAwardIssuances,
  noncreditCompletionCertificates,
} from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import { getCanonicalCommandContext } from "@/modules/identity/canonical-command-context.server";
import { assertCurrentCredentialIssuer } from "@/modules/identity/canonical-sensitive-authorization.server";

const input = z.object({
  issuanceId: z.string().uuid(),
  evidenceVersionId: z.string().uuid(),
  reason: z.string().trim().min(10).max(1000),
}).strict();

/** An issuer-authorized, audited revocation in the EXISTING credential ledger.
 * Historical issuance/artifacts are preserved. This does not create a
 * Class-issued certificate or grant academic credit.
 */
export const revokeLearningAwardIssuance = createServerFn({ method: "POST" })
  .validator((raw: unknown) => input.parse(raw))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    if (process.env.CAN_CREDENTIAL_ISSUANCE_ENABLED !== "true" ||
        process.env.CAN_WS3_AWARD_REVOCATION_ENABLED !== "true")
      throw new AuthorizationError("learning award revocation not activated");
    const request = getRequest();
    const actor = await getCanonicalCommandContext(request);
    if (!actor.actorPersonId || !["registrar", "site_admin"].includes(actor.role ?? "") ||
        actor.scope.organizationIds?.length !== 1)
      throw new AuthorizationError("current authorized issuer");

    return db.transaction(async tx => {
      const [issuance] = await tx.select().from(learningAwardIssuances)
        .where(eq(learningAwardIssuances.id, data.issuanceId))
        .for("update").limit(1);
      if (!issuance ||
          issuance.issuerOrganizationId !== actor.scope.organizationIds?.[0])
        throw new AuthorizationError("exact issuer-owned award");
      const [decision] = await tx.select({
        recipientPersonId: learnerAchievementDecisions.recipientPersonId,
      }).from(learnerAchievementDecisions)
        .where(eq(learnerAchievementDecisions.id, issuance.achievementDecisionId))
        .limit(1);
      if (!decision || decision.recipientPersonId === actor.actorPersonId)
        throw new AuthorizationError("independent issuer and learner");

      const [evidence] = await tx.select({
        verifiedAt: evidenceDocumentVersions.verifiedAt,
        verifiedByPersonId: evidenceDocumentVersions.verifiedByPersonId,
        validFrom: evidenceDocumentVersions.validFrom,
        validThrough: evidenceDocumentVersions.validThrough,
        owningOrganizationId: evidenceDocuments.owningOrganizationId,
      }).from(evidenceDocumentVersions)
        .innerJoin(evidenceDocuments,eq(evidenceDocuments.id,evidenceDocumentVersions.documentId))
        .where(eq(evidenceDocumentVersions.id,data.evidenceVersionId)).limit(1);
      const now = new Date();
      const today = now.toISOString().slice(0,10);
      if (!evidence || evidence.owningOrganizationId !== issuance.issuerOrganizationId ||
          !evidence.verifiedAt || evidence.verifiedAt > now ||
          !evidence.verifiedByPersonId ||
          evidence.verifiedByPersonId === actor.actorPersonId ||
          evidence.verifiedByPersonId === decision.recipientPersonId ||
          (evidence.validFrom && evidence.validFrom > today) ||
          (evidence.validThrough && evidence.validThrough < today))
        throw new AuthorizationError("independent current issuer-owned revocation evidence");

      // Issuer approval is revalidated and locked inside the same transaction.
      // A Site Admin role alone cannot revoke.
      await assertCurrentCredentialIssuer(tx,request,actor);
      const [existing] = await tx.select().from(learningAwardIssuanceEvents)
        .where(and(eq(learningAwardIssuanceEvents.issuanceId,issuance.id),
          eq(learningAwardIssuanceEvents.eventKind,"revoked"))).limit(1);
      if (existing) {
        if (existing.evidenceVersionId === data.evidenceVersionId &&
            existing.decidedByPersonId === actor.actorPersonId &&
            existing.reason === data.reason)
          return { eventId: existing.id, alreadyRevoked: true };
        throw new AuthorizationError("award already revoked; history cannot be rewritten");
      }

      if (issuance.legacyNoncreditCertificateId) {
        const [certificate] = await tx.select().from(noncreditCompletionCertificates)
          .where(eq(noncreditCompletionCertificates.id,issuance.legacyNoncreditCertificateId))
          .for("update").limit(1);
        if (!certificate || certificate.issuerOrganizationId !== issuance.issuerOrganizationId ||
            certificate.status !== "issued")
          throw new AuthorizationError("consistent current canonical certificate");
        const [updated] = await tx.update(noncreditCompletionCertificates).set({
          status:"revoked",revocationEvidenceId:data.evidenceVersionId,
        }).where(and(
          eq(noncreditCompletionCertificates.id,certificate.id),
          eq(noncreditCompletionCertificates.status,"issued"),
        )).returning({id:noncreditCompletionCertificates.id});
        if (!updated) throw new Error("Canonical certificate revocation failed");
      }

      const [event] = await tx.insert(learningAwardIssuanceEvents).values({
        issuanceId: issuance.id, eventKind:"revoked", reason:data.reason,
        evidenceVersionId:data.evidenceVersionId,
        decidedByPersonId:actor.actorPersonId,
      }).returning({id:learningAwardIssuanceEvents.id});
      if (!event) throw new Error("Award revocation event not persisted");
      const payload={issuanceId:issuance.id,evidenceVersionId:data.evidenceVersionId,
        reason:data.reason};
      await tx.insert(auditEvents).values({
        actorPersonId:actor.actorPersonId,
        owningOrganizationId:issuance.issuerOrganizationId,
        eventCode:"learning.credential.revoked",entityKind:"credential_issuance",
        entityId:issuance.id,payload,
      });
      await tx.insert(domainEvents).values({
        actorPersonId:actor.actorPersonId,eventType:"CredentialRevoked",
        aggregateType:"credential_issuance",aggregateId:issuance.id,payload,
      });
      return {eventId:event.id,alreadyRevoked:false};
    });
  });
