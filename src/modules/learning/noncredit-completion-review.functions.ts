import { desc, eq, sql } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { db } from "@/db/client";
import {
  noncreditCompletionDecisions, noncreditRegistrations,
  noncreditTrainingVersions,
} from "@/db/canonical-v301";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import { projectCurrentNoncreditCompletion } from "@/domain/verified-completion-projection";
import { getCanonicalCommandContext } from "@/modules/identity/canonical-command-context.server";
import { assertNoncreditCompletionSiteScope } from "@/modules/learning/verified-completion-site.server";

const input = z.object({ registrationId: z.string().uuid() }).strict();

/** Operator-only review of ORIGINAL canonical noncredit completion decisions.
 * No grade, attendance or assessment details are copied into another ledger.
 * A provider staff grant to another Site is not a read authorization.
 */
export const getNoncreditCompletionReview = createServerFn({ method: "GET" })
  .validator((raw: unknown) => input.parse(raw))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control","private, no-store");
    if (process.env.CAN_WS3_OPERATOR_REVIEW_ENABLED !== "true")
      throw new AuthorizationError("WS3 operator review not activated");
    const actor=await getCanonicalCommandContext(getRequest());
    if (!actor.actorPersonId || !["registrar","site_admin"].includes(actor.role??""))
      throw new AuthorizationError("authorized completion operator");
    assertCapability(actor,"noncredit.completion.decide");
    return db.transaction(async tx => {
      const [registration]=await tx.select().from(noncreditRegistrations)
        .where(eq(noncreditRegistrations.id,data.registrationId)).limit(1);
      if (!registration) throw new AuthorizationError("authorized registration");
      const [training]=await tx.select().from(noncreditTrainingVersions)
        .where(eq(noncreditTrainingVersions.id,registration.trainingVersionId)).limit(1);
      if (!training || training.providerOrganizationId !==
          actor.scope.organizationIds?.[0] ||
          actor.scope.organizationIds?.length !== 1 ||
          training.offeringVersionId !== registration.offeringVersionId)
        throw new AuthorizationError("provider-owned training release");
      await assertNoncreditCompletionSiteScope(tx,actor,registration);
      const rows=await tx.select().from(noncreditCompletionDecisions)
        .where(eq(noncreditCompletionDecisions.registrationId,registration.id))
        .orderBy(desc(noncreditCompletionDecisions.decidedAt)).limit(501);
      if (rows.length > 500)
        throw new AuthorizationError("completion history pagination required");
      const current=projectCurrentNoncreditCompletion(registration.id,rows);
      // Canonical function combines source supersession, issuer revocation,
      // expiration and legacy-certificate state. Never infer validity from
      // noncredit_completion_certificates.status='issued' alone.
      const awardResult=await tx.execute(sql`
        SELECT issuance.id AS "issuanceId",
               issuance.issued_at AS "issuedAt",
               education_v30.v301_credential_is_current(issuance.id)
                 AS "currentlyValid"
        FROM education_v30.noncredit_completion_decisions source
        JOIN education_v30.learner_achievement_decisions achievement
          ON achievement.noncredit_completion_decision_id=source.id
        JOIN education_v30.learning_award_issuances issuance
          ON issuance.achievement_decision_id=achievement.id
        WHERE source.registration_id=${registration.id}::uuid
          AND issuance.issuer_organization_id=${training.providerOrganizationId}::uuid
        ORDER BY issuance.issued_at DESC,issuance.id DESC LIMIT 101
      `);
      if(awardResult.rows.length>100)
        throw new AuthorizationError("credential history pagination required");
      const awards=awardResult.rows.map(raw=>({
        issuanceId:String(raw.issuanceId),
        issuedAt:new Date(String(raw.issuedAt)).toISOString(),
        currentlyValid:raw.currentlyValid===true,
      }));
      return {
        registrationId:registration.id,
        registrationStatus:registration.status,
        trainingTitle:training.title,
        pinnedPolicyId:registration.completionPolicyId,
        current,awards,
        history:rows.map(row=>({
          id:row.id,outcome:row.outcome,
          supersedesId:row.supersedesId,
          decidedAt:row.decidedAt.toISOString(),
          decidedByPersonId:row.decidedByPersonId,
          evidenceVersionId:row.evidenceVersionId,
        })),
        note:"Completion is a separately authorized provider decision. Revoking a credential requires independent issuer approval and verified evidence. Lesson clicks, surveys and provisional scores do not issue credentials.",
      };
    });
  });
