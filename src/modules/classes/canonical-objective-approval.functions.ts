import { sql } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { db } from "@/db/client";
import { AuthorizationError } from "@/domain/command-context";
import {
  canonicalAssessmentApprovalRole,recordObjectiveReviewInput,
  publishObjectiveAssessmentInput,
} from "@/domain/canonical-objective-review";
import { openNoncreditAnswerKey } from "@/domain/noncredit-knowledge-check";
import { getCanonicalCommandContext } from
  "@/modules/identity/canonical-command-context.server";

type Purpose="assessment_reviewer"|"assessment_publisher";
const uuid=z.string().uuid();
const snapshotInput=z.object({assessmentVersionId:uuid}).strict();
const storedOption=z.object({id:uuid,text:z.string()}).strict();
const storedItem=z.object({
  id:uuid,prompt:z.string(),lifecycle:z.string(),
  authorPersonId:uuid,
  options:z.array(storedOption).min(2).max(6),
  sealedKey:z.string().nullable(),
}).strict();
const review=z.object({
  kind:z.string(),decision:z.string(),reviewerPersonId:uuid,
  order:z.coerce.number().int(),
}).strict();
const itemReview=review.extend({itemVersionId:uuid});
const storedSnapshot=z.object({
  assessmentVersionId:uuid,formVersionId:uuid,
  title:z.string(),assessmentKey:z.string(),
  lifecycle:z.string(),formLifecycle:z.string(),
  passingFraction:z.coerce.number(),
  items:z.array(storedItem).min(1).max(10),
  reviews:z.object({
    assessment:z.array(review),
    form:z.array(review),items:z.array(itemReview),
  }).strict(),
}).strict();

async function approvalAuthority(purpose:Purpose){
  const flag=purpose==="assessment_reviewer"
    ?process.env.CAN_CANONICAL_ASSESSMENT_REVIEW_ENABLED
    :process.env.CAN_CANONICAL_ASSESSMENT_PUBLICATION_ENABLED;
  if(flag!=="true")throw new AuthorizationError("canonical assessment approval release disabled");
  setResponseHeader("Cache-Control","private, no-store");
  const actor=await getCanonicalCommandContext(getRequest());
  if(!actor.actorPersonId||
     !["site_admin","registrar"].includes(actor.role??""))
    throw new AuthorizationError("current authorized publisher organization staff");
  // Separately provisioned Organization-specific NOLOGIN SQL roles are
  // indispensable. A staff capability alone cannot read/review/publish.
  const role=canonicalAssessmentApprovalRole(actor,purpose);
  return {role,actorPersonId:actor.actorPersonId,
    organizationId:actor.scope.organizationIds![0]!};
}

async function withApprovalRole<T>(purpose:Purpose,
  fn:(ctx:Awaited<ReturnType<typeof approvalAuthority>>,
    tx:Parameters<Parameters<typeof db.transaction>[0]>[0])=>Promise<T>){
  const ctx=await approvalAuthority(purpose);
  return db.transaction(async tx=>{
    await tx.execute(sql.raw(`SET LOCAL ROLE ${ctx.role}`));
    const bound=await tx.execute(sql`
      SELECT education_v30.v28_role_can_access_org(
        ${ctx.organizationId}::uuid,${purpose}::text
      ) AS authorized
    `);
    if(bound.rows[0]?.authorized!==true)
      throw new AuthorizationError("exact independent assessment database role");
    return fn(ctx,tx);
  });
}

/** Reviewer preview shows decoded correct answer to the independent
 * authorized reviewer only, without returning raw encrypted key material.
 * The publisher view hides all correct-answer identifiers and values.
 */
export const readCanonicalObjectiveApproval=createServerFn({method:"GET"})
  .validator((raw:unknown)=>snapshotInput.extend({
    mode:z.enum(["review","publish"]),
  }).parse(raw))
  .handler(async({data})=>{
    const purpose:Purpose=data.mode==="review"
      ?"assessment_reviewer":"assessment_publisher";
    const payload=await withApprovalRole(purpose,async(ctx,tx)=>{
      const raw=await tx.execute(sql`
        SELECT education_v30.v301_objective_assessment_snapshot(
          ${ctx.organizationId}::uuid,${ctx.actorPersonId}::uuid,
          ${data.assessmentVersionId}::uuid,${purpose}::text
        ) AS snapshot
      `);
      return storedSnapshot.parse(raw.rows[0]?.snapshot);
    });
    const hex=process.env.CAN_NONCREDIT_ASSESSMENT_KEY_HEX;
    if(purpose==="assessment_reviewer"&&(!hex||!/^[a-f0-9]{64}$/i.test(hex)))
      throw new AuthorizationError("server-only assessment review decryption configuration");
    return {
      assessmentVersionId:payload.assessmentVersionId,
      formVersionId:payload.formVersionId,title:payload.title,
      assessmentKey:payload.assessmentKey,lifecycle:payload.lifecycle,
      formLifecycle:payload.formLifecycle,passingFraction:payload.passingFraction,
      items:payload.items.map(item=>{
        const approved=purpose==="assessment_reviewer"&&item.sealedKey
          ?openNoncreditAnswerKey(hex!,item.id,Buffer.from(item.sealedKey,"base64"))
          :[];
        if(purpose==="assessment_reviewer"&&approved.length!==1)
          throw new AuthorizationError("reviewer-only private answer key must identify one option");
        if(approved.some(key=>!item.options.some(o=>o.id===key)))
          throw new AuthorizationError("answer references missing objective option");
        return {
          id:item.id,prompt:item.prompt,lifecycle:item.lifecycle,
          authorPersonId:item.authorPersonId,
          options:item.options.map(option=>({
            id:option.id,text:option.text,
            // Only independently authorized reviewer gets the correct label.
            correct:purpose==="assessment_reviewer"?approved.includes(option.id):null,
          })),
        };
      }),
      reviews:payload.reviews,
      currentRole:purpose==="assessment_reviewer"?"reviewer" as const:"publisher" as const,
    };
  });

export const recordCanonicalObjectiveReview=createServerFn({method:"POST"})
  .validator((raw:unknown)=>recordObjectiveReviewInput.parse(raw))
  .handler(async({data})=>withApprovalRole("assessment_reviewer",async(ctx,tx)=>{
    const rows=await tx.execute(sql`
      SELECT education_v30.v301_record_objective_assessment_review(
        ${ctx.organizationId}::uuid,${ctx.actorPersonId}::uuid,
        ${data.assessmentVersionId}::uuid,${data.target}::text,
        ${data.itemVersionId??null}::uuid,${data.kind}::text,
        ${data.decision}::text,${data.rationale}::text
      ) AS review_id
    `);
    return {reviewId:uuid.parse(rows.rows[0]?.review_id),
      target:data.target,kind:data.kind,decision:data.decision};
  }));

export const publishCanonicalObjectiveAssessment=createServerFn({method:"POST"})
  .validator((raw:unknown)=>publishObjectiveAssessmentInput.parse(raw))
  .handler(async({data})=>withApprovalRole("assessment_publisher",async(ctx,tx)=>{
    const rows=await tx.execute(sql`
      SELECT education_v30.v301_publish_objective_assessment(
        ${ctx.organizationId}::uuid,${ctx.actorPersonId}::uuid,
        ${data.assessmentVersionId}::uuid
      ) AS assessment_version_id
    `);
    return {assessmentVersionId:uuid.parse(rows.rows[0]?.assessment_version_id),
      lifecycle:"published" as const};
  }));
