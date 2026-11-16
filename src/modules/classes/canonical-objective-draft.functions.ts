import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { db } from "@/db/client";
import { AuthorizationError } from "@/domain/command-context";
import {
  canonicalAssessmentDraftDatabaseRole,
  canonicalObjectiveDraftInput,
} from "@/domain/canonical-objective-draft";
import { sealNoncreditAnswerKey, NONCREDIT_KEY_REF } from
  "@/domain/noncredit-knowledge-check";
import { getCanonicalCommandContext } from
  "@/modules/identity/canonical-command-context.server";
import { bindCanonicalAssessmentSession } from "@/modules/identity/canonical-assessment-session.server";

/**
 * Real canonical *draft* persistence. The database writer has only EXECUTE
 * on a purpose-built SECURITY DEFINER transaction. It cannot SELECT answer
 * keys or publish, administer, grade, review or issue any award.
 *
 * No duplicate quiz, response, score, survey or completion table is created.
 * All identifiers, course ownership and Person authorization are rechecked
 * inside PostgreSQL under a single-Organization NOLOGIN role.
 */
export const createCanonicalObjectiveDraft=createServerFn({method:"POST"})
  .validator((raw:unknown)=>canonicalObjectiveDraftInput.parse(raw))
  .handler(async({data})=>{
    if(process.env.CAN_CANONICAL_ASSESSMENT_DRAFT_ENABLED!=="true")
      throw new AuthorizationError("canonical objective assessment draft writer disabled");
    setResponseHeader("Cache-Control","private, no-store");
    const actor=await getCanonicalCommandContext(getRequest());
    if(!actor.actorPersonId||!["registrar","site_admin"].includes(actor.role??""))
      throw new AuthorizationError("current authorized Course publisher");
    const role=canonicalAssessmentDraftDatabaseRole(actor);
    const organizationId=actor.scope.organizationIds![0]!;
    // An unconfigured key MUST fail closed rather than saving plaintext
    // correct answers, unusable ciphertext, or generic insecure JSON.
    const hex=process.env.CAN_NONCREDIT_ASSESSMENT_KEY_HEX;
    if(!hex||!/^[a-f0-9]{64}$/i.test(hex))
      throw new AuthorizationError("canonical answer-key encryption is not configured");
    const sealedQuestions=data.questions.map(question=>{
      const itemVersionId=randomUUID();
      const options=question.choices.map(text=>({id:randomUUID(),text}));
      const correct=options[question.correctIndex];
      if(!correct)throw new AuthorizationError("valid correct option");
      const key=sealNoncreditAnswerKey(hex,itemVersionId,[correct.id]);
      return {
        itemVersionId,prompt:question.prompt,options,
        encryptedKeyBase64:key.toString("base64"),
        keyRef:NONCREDIT_KEY_REF,
      };
    });
    const result=await db.transaction(async tx=>{
      // Explicit, scoped SET ROLE; the role is derived only from verified
      // UUID scope. No client-supplied role or tenant name is interpolated.
      await bindCanonicalAssessmentSession(tx,getRequest());
      await tx.execute(sql.raw(`SET LOCAL ROLE ${role}`));
      const binding=await tx.execute(sql`
        SELECT education_v30.v28_role_can_access_org(
          ${organizationId}::uuid,'assessment_draft_author'
        ) AS authorized
      `);
      if(binding.rows[0]?.authorized!==true)
        throw new AuthorizationError("bound objective assessment draft author role");
      return tx.execute(sql`
        SELECT * FROM education_v30.v301_create_objective_assessment_draft(
          ${organizationId}::uuid,${data.courseVersionId}::uuid,
          ${actor.actorPersonId}::uuid,${data.assessmentKey}::text,
          ${data.title}::text,${data.passingFraction}::numeric,
          ${data.maxAttempts}::integer,
          ${JSON.stringify(sealedQuestions)}::jsonb
        )
      `);
    });
    const row=result.rows[0] as Record<string,unknown>|undefined;
    return {
      assessmentVersionId:z.string().uuid().parse(row?.assessment_version_id),
      formVersionId:z.string().uuid().parse(row?.form_version_id),
      questionCount:z.number().int().min(1).max(10).parse(row?.question_count),
      lifecycle:"draft" as const,
      publisherOrganizationId:organizationId,
      needsIndependentReview:true as const,
    };
  });

/** Real canonical draft inventory for the same one publisher organization.
 * No answer keys, item prompts, correct options, response data, other tenants
 * or unapproved administrations are exposed by this readback.
 */
export const listCanonicalObjectiveDrafts=createServerFn({method:"GET"})
  .validator((raw:unknown)=>z.object({
    courseVersionId:z.string().uuid(),
  }).strict().parse(raw))
  .handler(async({data})=>{
    if(process.env.CAN_CANONICAL_ASSESSMENT_DRAFT_ENABLED!=="true")
      throw new AuthorizationError("canonical objective assessment draft writer disabled");
    setResponseHeader("Cache-Control","private, no-store");
    const actor=await getCanonicalCommandContext(getRequest());
    if(!actor.actorPersonId||!["registrar","site_admin"].includes(actor.role??""))
      throw new AuthorizationError("current Course publisher");
    const role=canonicalAssessmentDraftDatabaseRole(actor);
    const organizationId=actor.scope.organizationIds![0]!;
    const rows=await db.transaction(async tx=>{
      await bindCanonicalAssessmentSession(tx,getRequest());
      await tx.execute(sql.raw(`SET LOCAL ROLE ${role}`));
      return tx.execute(sql`
        SELECT * FROM education_v30.v301_list_objective_assessment_drafts(
          ${organizationId}::uuid,${data.courseVersionId}::uuid,
          ${actor.actorPersonId}::uuid
        )
      `);
    });
    return {drafts:rows.rows.map(row=>({
      assessmentVersionId:z.string().uuid().parse(row.assessment_version_id),
      assessmentKey:z.string().parse(row.assessment_key),
      title:z.string().parse(row.title),
      questionCount:z.coerce.number().int().min(1).max(10).parse(row.question_count),
      passingFraction:z.coerce.number().min(0).max(1).parse(row.passing_fraction),
      maxAttempts:z.coerce.number().int().min(1).max(5).parse(row.max_attempts),
      lifecycle:"draft" as const,
    }))};
  });
