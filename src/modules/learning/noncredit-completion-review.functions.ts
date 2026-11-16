import { desc, eq } from "drizzle-orm";
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
      return {
        registrationId:registration.id,
        registrationStatus:registration.status,
        trainingTitle:training.title,
        pinnedPolicyId:registration.completionPolicyId,
        current,
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
