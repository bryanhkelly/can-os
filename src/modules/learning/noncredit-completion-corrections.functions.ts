import { and, desc, eq } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { db } from "@/db/client";
import {
  auditEvents, domainEvents, evidenceDocuments, evidenceDocumentVersions,
  noncreditCompletionDecisions, noncreditRegistrations,
  noncreditTrainingVersions,
} from "@/db/canonical-v301";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import { getCanonicalCommandContext } from "@/modules/identity/canonical-command-context.server";
import { assertCurrentCanonicalStaffForMutation } from "@/modules/identity/canonical-transaction-authorization.server";

const schema = z.object({
  registrationId: z.string().uuid(),
  expectedCurrentDecisionId: z.string().uuid(),
  outcome: z.enum(["not_yet_completed", "voided"]),
  evidenceVersionId: z.string().uuid(),
  reason: z.string().trim().min(10).max(1000),
}).strict();

/**
 * Corrections append to the EXISTING noncredit_completion_decisions chain.
 * They never delete a completion or manufacture a replacement certificate.
 * An issued award sourced from a superseded decision stops being current
 * under v301_credential_is_current; issuer revocation is separately governed.
 */
export const correctNoncreditCompletion = createServerFn({ method: "POST" })
  .validator((raw: unknown) => schema.parse(raw))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    if (process.env.CAN_NONCREDIT_COMPLETION_CORRECTIONS_ENABLED !== "true")
      throw new AuthorizationError("noncredit completion corrections not activated");
    const request = getRequest();
    const actor = await getCanonicalCommandContext(request);
    if (!actor.actorPersonId || !["registrar", "site_admin"].includes(actor.role ?? ""))
      throw new AuthorizationError("provider completion reviewer");
    assertCapability(actor, "noncredit.completion.decide");

    return db.transaction(async tx => {
      // Lock the registration, serializing corrections with decisions and
      // preventing two reviewers from each superseding the same latest row.
      const [registration] = await tx.select().from(noncreditRegistrations)
        .where(eq(noncreditRegistrations.id, data.registrationId))
        .for("update").limit(1);
      if (!registration || registration.participantPersonId === actor.actorPersonId ||
          !registration.completionPolicyId)
        throw new AuthorizationError("other Person's governed registration");

      const [training] = await tx.select().from(noncreditTrainingVersions)
        .where(eq(noncreditTrainingVersions.id, registration.trainingVersionId)).limit(1);
      if (!training || training.providerOrganizationId !==
          actor.scope.organizationIds?.[0] ||
          actor.scope.organizationIds?.length !== 1 ||
          training.offeringVersionId !== registration.offeringVersionId)
        throw new AuthorizationError("exact noncredit provider organization");

      const [evidence] = await tx.select({
        id: evidenceDocumentVersions.id,
        verifiedAt: evidenceDocumentVersions.verifiedAt,
        verifiedByPersonId: evidenceDocumentVersions.verifiedByPersonId,
        validFrom: evidenceDocumentVersions.validFrom,
        validThrough: evidenceDocumentVersions.validThrough,
        owningOrganizationId: evidenceDocuments.owningOrganizationId,
      }).from(evidenceDocumentVersions)
        .innerJoin(evidenceDocuments, eq(evidenceDocuments.id,
          evidenceDocumentVersions.documentId))
        .where(eq(evidenceDocumentVersions.id, data.evidenceVersionId)).limit(1);
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      if (!evidence || evidence.owningOrganizationId !== training.providerOrganizationId ||
          !evidence.verifiedAt || evidence.verifiedAt > now ||
          !evidence.verifiedByPersonId ||
          evidence.verifiedByPersonId === actor.actorPersonId ||
          evidence.verifiedByPersonId === registration.participantPersonId ||
          (evidence.validFrom && evidence.validFrom > today) ||
          (evidence.validThrough && evidence.validThrough < today))
        throw new AuthorizationError("current independently verified provider evidence");

      const decisions = await tx.select().from(noncreditCompletionDecisions)
        .where(eq(noncreditCompletionDecisions.registrationId, registration.id))
        .orderBy(desc(noncreditCompletionDecisions.decidedAt)).limit(501);
      if (decisions.length > 500)
        throw new AuthorizationError("completion history needs pagination");
      const replaced = new Set(decisions.flatMap(d => d.supersedesId ? [d.supersedesId] : []));
      const current = decisions.find(d => !replaced.has(d.id));
      if (!current) throw new AuthorizationError("existing completion decision");
      if (current.id !== data.expectedCurrentDecisionId) {
        // Safe retry only for this exact same corrective decision.
        if (current.supersedesId === data.expectedCurrentDecisionId &&
            current.outcome === data.outcome &&
            current.evidenceVersionId === data.evidenceVersionId &&
            current.decidedByPersonId === actor.actorPersonId) {
          await assertCurrentCanonicalStaffForMutation(tx, request, actor);
          return { decisionId: current.id, alreadyRecorded: true };
        }
        throw new AuthorizationError("completion was revised; reload history");
      }
      if (current.policyId !== registration.completionPolicyId)
        throw new AuthorizationError("participant's pinned completion policy");

      await assertCurrentCanonicalStaffForMutation(tx, request, actor);
      const [created] = await tx.insert(noncreditCompletionDecisions).values({
        registrationId: registration.id,
        policyId: registration.completionPolicyId,
        assessmentResultId: null,
        outcome: data.outcome,
        decisionSource: "provider",
        decidedByPersonId: actor.actorPersonId,
        evidenceVersionId: data.evidenceVersionId,
        supersedesId: current.id,
      }).returning({ id: noncreditCompletionDecisions.id });
      if (!created) throw new Error("Completion correction not persisted");
      const payload = { registrationId: registration.id,
        previousDecisionId: current.id, evidenceVersionId: data.evidenceVersionId,
        reason: data.reason, outcome: data.outcome };
      await tx.insert(auditEvents).values({
        actorPersonId: actor.actorPersonId,
        owningOrganizationId: training.providerOrganizationId,
        eventCode: "learning.noncredit.completion_corrected",
        entityKind: "noncredit_completion_decision",
        entityId: created.id, payload,
      });
      await tx.insert(domainEvents).values({
        actorPersonId: actor.actorPersonId,
        eventType: "NoncreditCompletionCorrected",
        aggregateType: "noncredit_completion_decision",
        aggregateId: created.id, payload,
      });
      return { decisionId: created.id, alreadyRecorded: false };
    });
  });
