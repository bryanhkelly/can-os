import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { db } from "@/db/client";
import {
  noncreditCompletionDecisions, noncreditRegistrations,
  participationAttributions,
  noncreditTrainingVersions,
} from "@/db/canonical-v301";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import { projectCurrentNoncreditCompletion } from "@/domain/verified-completion-projection";
import { getCanonicalCommandContext } from "@/modules/identity/canonical-command-context.server";
import { assertNoncreditCompletionSiteScope } from "@/modules/learning/verified-completion-site.server";
import { assertCurrentCanonicalStaffForMutation } from "@/modules/identity/canonical-transaction-authorization.server";

const input = z.object({ registrationId: z.string().uuid() }).strict();

/** Operator-only review of ORIGINAL canonical noncredit completion decisions.
 * No grade, attendance or assessment details are copied into another ledger.
 * A provider staff grant to another Site is not a read authorization.
 */
export const getNoncreditCompletionReview = createServerFn({ method: "GET" })
  .validator((raw: unknown) => input.parse(raw))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control","private, no-store");
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

const queueInput=z.object({
  page:z.number().int().min(0).max(100).default(0),
}).strict();

/** Person-centered, exact provider/Site completion review queue. The
 * original noncredit Registration remains source authority, independent of
 * Class, Program, network affiliation or copied student records.
 * No public learner, network or cross-Site review access is granted.
 */
export const getNoncreditCompletionQueue=createServerFn({method:"GET"})
  .validator((raw:unknown)=>queueInput.parse(raw))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private,no-store");
    const request=getRequest(),actor=await getCanonicalCommandContext(request);
    if(!actor.actorPersonId ||
       !["site_admin","registrar"].includes(actor.role??"") ||
       actor.scope.organizationIds?.length!==1 ||
       actor.scope.siteIds?.length!==1)
      throw new AuthorizationError("current exact provider and Site reviewer");
    assertCapability(actor,"noncredit.completion.decide");
    return db.transaction(async tx=>{
      await assertCurrentCanonicalStaffForMutation(tx,request,actor);
      const rows=await tx.select({
        registrationId:noncreditRegistrations.id,
        status:noncreditRegistrations.status,
        participantPersonId:noncreditRegistrations.participantPersonId,
        completionPolicyId:noncreditRegistrations.completionPolicyId,
        registeredAt:noncreditRegistrations.registeredAt,
        trainingTitle:noncreditTrainingVersions.title,
      }).from(noncreditRegistrations)
        .innerJoin(noncreditTrainingVersions,and(
          eq(noncreditTrainingVersions.id,noncreditRegistrations.trainingVersionId),
          eq(noncreditTrainingVersions.providerOrganizationId,
            actor.scope.organizationIds?.[0]!),
          eq(noncreditTrainingVersions.offeringVersionId,
            noncreditRegistrations.offeringVersionId),
        ))
        .innerJoin(participationAttributions,and(
          eq(participationAttributions.noncreditRegistrationId,
            noncreditRegistrations.id),
          eq(participationAttributions.deliverySiteId,actor.scope.siteIds?.[0]!),
        ))
        .where(inArray(noncreditRegistrations.status,
          ["registered","active","completed"]))
        .orderBy(asc(noncreditRegistrations.registeredAt),
          asc(noncreditRegistrations.id))
        .limit(21).offset(data.page*20);
      const visible=rows.slice(0,20);
      const decisions=visible.length?await tx.select().from(noncreditCompletionDecisions)
        .where(inArray(noncreditCompletionDecisions.registrationId,
          visible.map(row=>row.registrationId)))
        .orderBy(desc(noncreditCompletionDecisions.decidedAt))
        .limit(10001):[];
      if(decisions.length>10000)
        throw new AuthorizationError("noncredit completion decisions pagination required");
      const participants=visible.map(row=>{
        const scoped=decisions.filter(d=>d.registrationId===row.registrationId);
        const current=projectCurrentNoncreditCompletion(row.registrationId,scoped);
        return {
          registrationId:row.registrationId,
          status:row.status,
          trainingTitle:row.trainingTitle,
          participantReference:row.participantPersonId,
          completionPolicyPinned:!!row.completionPolicyId,
          currentState:current.state,
          currentDecisionId:"decisionId" in current?current.decisionId:null,
          verifiedCompletion:current.state==="completed",
        };
      });
      return {page:data.page,hasMore:rows.length>20,
        participants,source:"noncredit_registration" as const};
    });
  });
