import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { db } from "@/db/client";
import {
  surveyDefinitions, surveyVersions, surveyQuestions, surveyQuestionOptions,
  surveyVersionReviews, evidenceDocuments, evidenceDocumentVersions,
  auditEvents, domainEvents,
} from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import {
  recordSurveyReviewInput, publishSurveyInput,
  reviewGate, surveyApprovalDatabaseRole,
} from "@/domain/canonical-survey-approvals";
import { getCanonicalCommandContext } from "@/modules/identity/canonical-command-context.server";

const noStore = () => setResponseHeader("Cache-Control", "private, no-store");
type Purpose = "survey_reviewer" | "survey_publisher";

async function requireSurveyAuthority(purpose: Purpose) {
  const flag=purpose==="survey_reviewer"
    ? process.env.CAN_CANONICAL_SURVEY_REVIEW_ENABLED
    : process.env.CAN_CANONICAL_SURVEY_PUBLICATION_ENABLED;
  if(flag!=="true")throw new AuthorizationError("survey approval capability disabled");
  const actor=await getCanonicalCommandContext(getRequest());
  const staff=actor.role==="site_admin"||actor.role==="registrar";
  if(!actor.actorPersonId || (purpose==="survey_reviewer"
    ? actor.role!=="survey_reviewer"||Boolean(actor.scope.siteIds?.length)
    : !staff||!actor.scope.siteIds?.length))
    throw new AuthorizationError("independent survey approval authority");
  const role=surveyApprovalDatabaseRole(actor,purpose);
  return {
    role, actorPersonId:actor.actorPersonId,
    organizationId:actor.scope.organizationIds![0]!,
  };
}
async function enterRole(
 tx:Parameters<Parameters<typeof db.transaction>[0]>[0],
 authority:Awaited<ReturnType<typeof requireSurveyAuthority>>,
 purpose:Purpose,
) {
  await tx.execute(sql.raw(`SET LOCAL ROLE ${authority.role}`));
  const bound=await tx.execute(sql`
    SELECT education_v30.v28_role_can_access_org(
      ${authority.organizationId}::uuid, ${purpose}::text
    ) AS authorized
  `);
  if(bound.rows[0]?.authorized!==true)
    throw new AuthorizationError("current organization-bound survey database role");
}

/** Decision history is append-only; latest decision by sequence is decisive. */
async function currentReviewRows(
 tx:Parameters<Parameters<typeof db.transaction>[0]>[0],
 versionIds:string[],
) {
  if(!versionIds.length)return [];
  return tx.select({
    surveyVersionId:surveyVersionReviews.surveyVersionId,
    kind:surveyVersionReviews.reviewKind,
    decision:surveyVersionReviews.decision,
    reviewerPersonId:surveyVersionReviews.reviewerPersonId,
    decisionOrder:surveyVersionReviews.decisionOrder,
    evidenceVersionId:surveyVersionReviews.evidenceVersionId,
  }).from(surveyVersionReviews)
    .where(inArray(surveyVersionReviews.surveyVersionId,versionIds))
    .orderBy(desc(surveyVersionReviews.decisionOrder));
}

/** Label-only evidence inventory. Never return a document URL or storage key. */
async function currentEvidenceRows(
 tx:Parameters<Parameters<typeof db.transaction>[0]>[0],
 organizationId:string,
) {
 return tx.select({
   id:evidenceDocumentVersions.id,
   kind:evidenceDocuments.kindCode,
 }).from(evidenceDocuments)
   .innerJoin(evidenceDocumentVersions,eq(evidenceDocumentVersions.documentId,evidenceDocuments.id))
   .where(and(
     eq(evidenceDocuments.owningOrganizationId,organizationId),
     isNotNull(evidenceDocumentVersions.verifiedAt),
     or(isNull(evidenceDocumentVersions.validFrom),
       lte(evidenceDocumentVersions.validFrom,sql`CURRENT_DATE`)),
     or(isNull(evidenceDocumentVersions.validThrough),
       gte(evidenceDocumentVersions.validThrough,sql`CURRENT_DATE`)),
   )).limit(1001);
}

async function listVersions(purpose:Purpose) {
  const authority=await requireSurveyAuthority(purpose);
  return db.transaction(async tx=>{
    await enterRole(tx,authority,purpose);
    const drafts=await tx.select({
      surveyVersionId:surveyVersions.id,
      surveyId:surveyDefinitions.id,
      title:surveyDefinitions.title,
      code:surveyDefinitions.code,
      purposeCode:surveyDefinitions.purposeCode,
      audience:surveyDefinitions.intendedAudience,
      authorPersonId:surveyVersions.authorPersonId,
      versionNo:surveyVersions.versionNo,
    }).from(surveyVersions)
      .innerJoin(surveyDefinitions,eq(surveyVersions.surveyId,surveyDefinitions.id))
      .where(and(
        eq(surveyDefinitions.ownerOrganizationId,authority.organizationId),
        eq(surveyDefinitions.status,"active"),
        eq(surveyVersions.lifecycle,"draft"),
      )).orderBy(asc(surveyDefinitions.title),desc(surveyVersions.versionNo))
      .limit(50);
    const ids=drafts.map(v=>v.surveyVersionId);
    const reviews=await currentReviewRows(tx,ids);
    const evidenceRows=await currentEvidenceRows(tx,authority.organizationId);
    const evidenceComplete=evidenceRows.length<=1000;
    const currentEvidenceIds=new Set(evidenceComplete?evidenceRows.map(e=>e.id):[]);
    const counts=ids.length ? await tx.select({
      versionId:surveyQuestions.surveyVersionId,total:count(),
    }).from(surveyQuestions)
      .where(inArray(surveyQuestions.surveyVersionId,ids))
      .groupBy(surveyQuestions.surveyVersionId):[];
    const questions=purpose==="survey_reviewer" && ids.length
      ? await tx.select({
        id:surveyQuestions.id,
        versionId:surveyQuestions.surveyVersionId,
        ordinal:surveyQuestions.ordinal,
        prompt:surveyQuestions.promptText,
        type:surveyQuestions.questionType,
        required:surveyQuestions.required,
        safetyTriage:surveyQuestions.safetyTriage,
      }).from(surveyQuestions)
        .where(inArray(surveyQuestions.surveyVersionId,ids))
        .orderBy(asc(surveyQuestions.surveyVersionId),asc(surveyQuestions.ordinal))
        .limit(1001)
      :[];
    const loaded=questions.slice(0,1000);
    const options=loaded.length ? await tx.select({
      questionId:surveyQuestionOptions.questionId,
      label:surveyQuestionOptions.label,
      ordinal:surveyQuestionOptions.ordinal,
    }).from(surveyQuestionOptions)
      .where(inArray(surveyQuestionOptions.questionId,loaded.map(q=>q.id)))
      .orderBy(asc(surveyQuestionOptions.ordinal)).limit(2501):[];
    const optionTruncated=options.length>2500;
    return {
      organizationId:authority.organizationId,
      currentRole:purpose==="survey_reviewer"?"reviewer" as const:"publisher" as const,
      limit:50,
      evidence:purpose==="survey_reviewer" && evidenceComplete?evidenceRows:[],
      evidenceInventoryComplete:evidenceComplete,
      versions:drafts.map(row=>{
        const status=reviewGate(row.authorPersonId,reviews.filter(x=>x.surveyVersionId===row.surveyVersionId),currentEvidenceIds);
        const own=row.authorPersonId===authority.actorPersonId;
        const qs=loaded.filter(q=>q.versionId===row.surveyVersionId);
        const questionCount=Number(counts.find(q=>q.versionId===row.surveyVersionId)?.total??0);
        return {
          id:row.surveyVersionId,surveyId:row.surveyId,title:row.title,
          code:row.code,purposeCode:row.purposeCode,audience:row.audience,
          versionNo:row.versionNo,ownDraft:own,questionCount,
          publicationReady:questionCount>0&&status.ready,
          approvals:status.required,
          reviewPreviewComplete:purpose==="survey_publisher" ||
            (qs.length===questionCount && questions.length<=1000 && !optionTruncated),
          questions:purpose==="survey_reviewer" && questions.length<=1000 && !optionTruncated
            ? qs.map(q=>({
                id:q.id,ordinal:q.ordinal,
                prompt:q.safetyTriage?"Protected question":q.prompt,
                type:q.type,required:q.required,safetyTriage:q.safetyTriage,
                options:q.safetyTriage?[]:options.filter(o=>o.questionId===q.id).map(o=>o.label),
              }))
            :[],
        };
      }),
    };
  });
}

/** Reviewer role never gets the provider author's publication privilege. */
export const readCanonicalSurveyReviewQueue=createServerFn({method:"GET"}).handler(async()=>{
  noStore();
  return listVersions("survey_reviewer");
});
/** Publisher role never gets reviewer decision INSERT privilege. */
export const readCanonicalSurveyPublicationQueue=createServerFn({method:"GET"}).handler(async()=>{
  noStore();
  return listVersions("survey_publisher");
});

export const recordCanonicalSurveyReview=createServerFn({method:"POST"})
  .validator((raw:unknown)=>recordSurveyReviewInput.parse(raw))
  .handler(async({data})=>{
    noStore();
    const authority=await requireSurveyAuthority("survey_reviewer");
    return db.transaction(async tx=>{
      await enterRole(tx,authority,"survey_reviewer");
      const [version]=await tx.select({
        surveyId:surveyVersions.surveyId,
        lifecycle:surveyVersions.lifecycle,
        authorPersonId:surveyVersions.authorPersonId,
      }).from(surveyVersions)
        .where(eq(surveyVersions.id,data.surveyVersionId)).for("share").limit(1);
      if(!version||version.lifecycle!=="draft"||
         version.authorPersonId===authority.actorPersonId)
        throw new AuthorizationError("independent draft survey reviewer");
      const [definition]=await tx.select({id:surveyDefinitions.id})
        .from(surveyDefinitions).where(and(
          eq(surveyDefinitions.id,version.surveyId),
          eq(surveyDefinitions.ownerOrganizationId,authority.organizationId),
          eq(surveyDefinitions.status,"active"),
        )).limit(1);
      if(!definition)throw new AuthorizationError("reviewer organization owns survey");
      if(data.evidenceVersionId) {
        const evidence=await currentEvidenceRows(tx,authority.organizationId);
        if(evidence.length>1000 || !evidence.some(e=>e.id===data.evidenceVersionId))
          throw new AuthorizationError("current verified reviewer evidence");
      }
            const [saved]=await tx.insert(surveyVersionReviews).values({
        surveyVersionId:data.surveyVersionId,
        reviewKind:data.kind,
        reviewerPersonId:authority.actorPersonId,
        decision:data.decision,
        evidenceVersionId:data.evidenceVersionId,
      }).returning({id:surveyVersionReviews.id});
      if(!saved)throw new Error("Review decision not saved");
      const payload={
        surveyVersionId:data.surveyVersionId,reviewKind:data.kind,
        decision:data.decision,reviewId:saved.id,
        evidenceVersionId:data.evidenceVersionId,rationale:data.rationale,
      };
      await tx.insert(auditEvents).values({
        actorPersonId:authority.actorPersonId,
        owningOrganizationId:authority.organizationId,
        eventCode:"survey.review.recorded",
        entityKind:"survey_version",entityId:data.surveyVersionId,payload,
      });
      await tx.insert(domainEvents).values({
        eventType:"SurveyReviewRecorded",aggregateType:"survey_version",
        aggregateId:data.surveyVersionId,actorPersonId:authority.actorPersonId,payload,
      });
      return {reviewId:saved.id,kind:data.kind,decision:data.decision};
    });
  });

export const publishCanonicalSurveyVersion=createServerFn({method:"POST"})
  .validator((raw:unknown)=>publishSurveyInput.parse(raw))
  .handler(async({data})=>{
    noStore();
    const authority=await requireSurveyAuthority("survey_publisher");
    return db.transaction(async tx=>{
      await enterRole(tx,authority,"survey_publisher");
      // Version lock is also acquired FOR SHARE by new review inserts. This
      // serializes a fresh rejection against publishing the same draft.
      const [version]=await tx.select({
        surveyId:surveyVersions.surveyId,
        lifecycle:surveyVersions.lifecycle,
        authorPersonId:surveyVersions.authorPersonId,
      }).from(surveyVersions)
        .where(eq(surveyVersions.id,data.surveyVersionId)).for("update").limit(1);
      if(!version||version.lifecycle!=="draft")
        throw new AuthorizationError("existing draft version for publication");
      const [definition]=await tx.select({id:surveyDefinitions.id})
        .from(surveyDefinitions).where(and(
          eq(surveyDefinitions.id,version.surveyId),
          eq(surveyDefinitions.ownerOrganizationId,authority.organizationId),
          eq(surveyDefinitions.status,"active"),
        )).limit(1);
      if(!definition)throw new AuthorizationError("publisher organization owns survey");
      const rows=await currentReviewRows(tx,[data.surveyVersionId]);
      const evidence=await currentEvidenceRows(tx,authority.organizationId);
      const gate=reviewGate(version.authorPersonId,rows,
        new Set(evidence.length<=1000?evidence.map(e=>e.id):[]));
      if(!gate.ready)throw new AuthorizationError("all three independent current survey approvals");
      const [q]=await tx.select({id:surveyQuestions.id}).from(surveyQuestions)
        .where(eq(surveyQuestions.surveyVersionId,data.surveyVersionId)).limit(1);
      if(!q)throw new AuthorizationError("at least one reviewed survey question");
      const [published]=await tx.update(surveyVersions)
        .set({lifecycle:"published",publishedAt:new Date()})
        .where(and(eq(surveyVersions.id,data.surveyVersionId),eq(surveyVersions.lifecycle,"draft")))
        .returning({id:surveyVersions.id});
      if(!published)throw new Error("Survey version was not published");
      const payload={surveyVersionId:data.surveyVersionId,
        requiredApprovals:gate.required.map(x=>x.kind)};
      await tx.insert(auditEvents).values({
        actorPersonId:authority.actorPersonId,
        owningOrganizationId:authority.organizationId,
        eventCode:"survey.version.published",
        entityKind:"survey_version",entityId:data.surveyVersionId,payload,
      });
      await tx.insert(domainEvents).values({
        eventType:"SurveyVersionPublished",aggregateType:"survey_version",
        aggregateId:data.surveyVersionId,actorPersonId:authority.actorPersonId,payload,
      });
      return {surveyVersionId:published.id,lifecycle:"published" as const};
    });
  });
