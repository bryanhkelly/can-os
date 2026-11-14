import { and, asc, desc, eq, inArray, lte, or, gt, isNull } from "drizzle-orm";
import { randomInt } from "node:crypto";
import { db } from "@/db/client";
import {
  assessmentAccess, assessmentAccommodations, assessmentDefinitions,
  assessmentFormAdministrations, assessmentFormItems, assessmentFormSections,
  assessmentFormVersions, assessmentItemOptions, assessmentItemVersions,
  assessmentVersions, assessmentExecutionAttempts, assessmentExecutionItems,
  assessmentExecutionResponses, assessmentExecutionChoices, assessmentItemSecureKeys,
  assessmentAutoScores, assessmentExecutionResults, noncreditRegistrations,
  noncreditTrainingVersions,
} from "@/db/canonical-v301";
import { AuthorizationError, assertCapability, type CommandContext } from "@/domain/command-context";
import {
  evaluateKnowledgeCheckResult, NONCREDIT_KEY_REF, NONCREDIT_SCORING_ENGINE,
  openNoncreditAnswerKey, scoreNoncreditChoices,
} from "@/domain/noncredit-knowledge-check";
import { authorizeCanonicalCourseAttempt } from "./canonical-course-participation.server";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Question = {
  id:string; prompt:string; type:"single_choice"|"multiple_choice";
  required:true; min:null; max:null;
  options:{id:string;label:string}[];
};
const objectiveKinds=["single_select","multi_select","true_false"] as const;

function requireLearner(context:CommandContext): asserts context is CommandContext & {actorPersonId:string} {
  if(context.role!=="learner"||!context.actorPersonId)
    throw new AuthorizationError("authenticated noncredit learner");
  assertCapability(context,"learning.participate");
}
function publicText(raw:Record<string,unknown>,field:string):string {
  const value=raw.text ?? raw.prompt ?? raw.label;
  if(typeof value!=="string"||!value.trim()||value.length>2000)
    throw new Error("Published assessment "+field+" is invalid");
  return value;
}

async function loadNoncreditAssessment(tx:Tx,context:CommandContext,courseAttemptId:string) {
  requireLearner(context);
  const access=await authorizeCanonicalCourseAttempt(tx,context,courseAttemptId);
  if(access.source!=="noncredit"||!access.noncreditRegistrationId)
    throw new AuthorizationError("active noncredit course attempt");
  const [registration]=await tx.select().from(noncreditRegistrations)
    .where(eq(noncreditRegistrations.id,access.noncreditRegistrationId)).limit(1);
  if(!registration||!registration.learnerId||registration.participantPersonId!==context.actorPersonId)
    throw new AuthorizationError("assessment learner profile linked to registration");
  const [training]=await tx.select().from(noncreditTrainingVersions)
    .where(eq(noncreditTrainingVersions.id,registration.trainingVersionId)).limit(1);
  if(!training||training.state!=="published"||!training.assessmentVersionId)
    throw new AuthorizationError("published noncredit knowledge check");
  const [version]=await tx.select().from(assessmentVersions)
    .where(and(eq(assessmentVersions.id,training.assessmentVersionId),
      eq(assessmentVersions.lifecycle,"published"))).limit(1);
  if(!version||version.courseVersionId!==access.courseVersionId)
    throw new AuthorizationError("matching published assessment version");
  const [definition]=await tx.select().from(assessmentDefinitions)
    .where(eq(assessmentDefinitions.id,version.assessmentId)).limit(1);
  if(!definition||!["formative","practice","readiness","mastery"].includes(definition.purpose))
    throw new AuthorizationError("noncredit objective knowledge assessment");
  const rows=await tx.select().from(assessmentFormAdministrations)
    .where(and(
      eq(assessmentFormAdministrations.assessmentVersionId,version.id),
      eq(assessmentFormAdministrations.deploymentId,access.deploymentId),
      eq(assessmentFormAdministrations.courseVersionId,access.courseVersionId),
      eq(assessmentFormAdministrations.status,"open"),
    ));
  // The pilot uses one pinned open administration per course offering.
  if(rows.length!==1)throw new AuthorizationError("unique active knowledge check administration");
  const administration=rows[0];
  if(administration.proctorPolicy!=="none"||
      administration.administeringOrganizationId!==training.providerOrganizationId)
    throw new AuthorizationError("nonproctored provider training assessment");
  const now=new Date();
  if((administration.opensAt&&administration.opensAt>now)||
     (administration.closesAt&&administration.closesAt<=now))
    throw new AuthorizationError("current knowledge check window");
  const [form]=await tx.select().from(assessmentFormVersions)
    .where(and(eq(assessmentFormVersions.id,administration.formVersionId),
      eq(assessmentFormVersions.assessmentVersionId,version.id),
      eq(assessmentFormVersions.lifecycle,"published"))).limit(1);
  if(!form||form.shuffleQuestions)throw new AuthorizationError("approved fixed assessment form");
  const [grant]=await tx.select().from(assessmentAccess)
    .where(and(
      eq(assessmentAccess.administrationId,administration.id),
      eq(assessmentAccess.courseAttemptId,access.courseAttemptId),
      eq(assessmentAccess.learnerId,registration.learnerId),
      eq(assessmentAccess.accessStatus,"approved"),
      lte(assessmentAccess.validFrom,now),
      or(isNull(assessmentAccess.validThrough),gt(assessmentAccess.validThrough,now)),
    )).limit(1);
  if(!grant)throw new AuthorizationError("preapproved course assessment access grant");
  return {access,registration,training,administration,form,grant};
}

async function loadFormQuestions(tx:Tx,formVersionId:string) {
  const sections=await tx.select().from(assessmentFormSections)
    .where(eq(assessmentFormSections.formVersionId,formVersionId))
    .orderBy(asc(assessmentFormSections.ordinal));
  if(!sections.length||sections.some(section=>section.selectionMode!=="fixed"||
    section.shuffleWithinSection))throw new Error("Unsupported noncredit assessment form selection");
  const forms=await tx.select().from(assessmentFormItems)
    .where(eq(assessmentFormItems.formVersionId,formVersionId));
  const position=new Map(sections.map(s=>[s.id,s.ordinal]));
  forms.sort((a,b)=>(position.get(a.formSectionId)??0)-(position.get(b.formSectionId)??0)||
    a.position-b.position);
  if(!forms.length||forms.length>100)throw new Error("Invalid noncredit assessment form");
  const versions=await tx.select().from(assessmentItemVersions)
    .where(inArray(assessmentItemVersions.id,forms.map(f=>f.itemVersionId)));
  const versionById=new Map(versions.map(v=>[v.id,v]));
  const options=await tx.select().from(assessmentItemOptions)
    .where(inArray(assessmentItemOptions.itemVersionId,forms.map(f=>f.itemVersionId)))
    .orderBy(asc(assessmentItemOptions.ordinal));
  const items=forms.map(f=>{
    const version=versionById.get(f.itemVersionId);
    if(!version||version.lifecycle!=="published"||
      !objectiveKinds.some(x=>x===version.responseKind))
      throw new Error("Only published objective questions are supported");
    const kind=version.responseKind as typeof objectiveKinds[number];
    const choices=options.filter(o=>o.itemVersionId===version.id);
    if(choices.length<2)throw new Error("Objective questions require at least two options");
    const maxPoints=Number(f.pointsOverride??version.maximumPoints);
    if(!Number.isFinite(maxPoints)||maxPoints<=0)throw new Error("Invalid question points");
    return {formItemId:f.id,itemVersionId:version.id,responseKind:kind,
      prompt:publicText(version.itemPrompt,"prompt"),maxPoints,
      options:choices.map(o=>({id:o.id,label:publicText(o.displayContent,"option")}))};
  });
  return items;
}

async function latestAttempt(tx:Tx,grantId:string) {
  const [attempt]=await tx.select().from(assessmentExecutionAttempts)
    .where(eq(assessmentExecutionAttempts.accessGrantId,grantId))
    .orderBy(desc(assessmentExecutionAttempts.attemptNo)).limit(1);
  return attempt??null;
}
async function describeAttempt(tx:Tx,attempt:typeof assessmentExecutionAttempts.$inferSelect|null) {
  if(!attempt)return {state:"not_started" as const,attemptId:null,
    attemptNo:0,questions:[] as Question[],score:null};
  const [result]=await tx.select().from(assessmentExecutionResults)
    .where(eq(assessmentExecutionResults.attemptId,attempt.id))
    .orderBy(desc(assessmentExecutionResults.resultRevision)).limit(1);
  let questions:Question[]=[];
  if(attempt.state==="in_progress") {
    const snapshot=await tx.select().from(assessmentExecutionItems)
      .where(eq(assessmentExecutionItems.attemptId,attempt.id))
      .orderBy(asc(assessmentExecutionItems.questionNumber));
    const versions=await tx.select().from(assessmentItemVersions)
      .where(inArray(assessmentItemVersions.id,snapshot.map(i=>i.itemVersionId)));
    const options=await tx.select().from(assessmentItemOptions)
      .where(inArray(assessmentItemOptions.itemVersionId,snapshot.map(i=>i.itemVersionId)))
      .orderBy(asc(assessmentItemOptions.ordinal));
    const byId=new Map(versions.map(v=>[v.id,v]));
    questions=snapshot.map(item=>{
      const v=byId.get(item.itemVersionId);
      if(!v||!objectiveKinds.some(kind=>kind===v.responseKind))
        throw new Error("Published question snapshot is unavailable");
      return {id:item.id,prompt:publicText(v.itemPrompt,"prompt"),
        type:v.responseKind==="multi_select"?"multiple_choice" as const:"single_choice" as const,
        required:true as const,min:null,max:null,
        options:options.filter(o=>o.itemVersionId===v.id).map(o=>({
          id:o.id,label:publicText(o.displayContent,"option"),
        }))};
    });
  }
  return {
    state:attempt.state,attemptId:attempt.id,attemptNo:attempt.attemptNo,
    expiresAt:attempt.expiresAt?.toISOString()??null,
    questions,score:result?{
      resultId:result.id,status:result.resultStatus,
      pointsEarned:Number(result.pointsEarned),pointsPossible:Number(result.pointsPossible),
      outcome:result.outcome,
    }:null,
  };
}

export async function readNoncreditKnowledgeCheck(context:CommandContext,courseAttemptId:string) {
  return db.transaction(async tx=>{
    const scope=await loadNoncreditAssessment(tx,context,courseAttemptId);
    const attempt=await latestAttempt(tx,scope.grant.id);
    return {courseAttemptId,assessmentVersionId:scope.training.assessmentVersionId,
      ...await describeAttempt(tx,attempt)};
  });
}

/** An authorized grant is required before a learner can start a noncredit check. */
export async function beginNoncreditKnowledgeCheck(context:CommandContext,input:{
  courseAttemptId:string;requestId:string;
}) {
  return db.transaction(async tx=>{
    const scope=await loadNoncreditAssessment(tx,context,input.courseAttemptId);
    const [lockedGrant]=await tx.select().from(assessmentAccess)
      .where(eq(assessmentAccess.id,scope.grant.id)).for("update").limit(1);
    if(!lockedGrant||lockedGrant.accessStatus!=="approved")
      throw new AuthorizationError("current knowledge check grant");
    const existing=await latestAttempt(tx,scope.grant.id);
    if(existing?.requestKey===input.requestId||existing?.state==="in_progress")
      return describeAttempt(tx,existing);
    if(existing && ["prepared","submitted","scored"].includes(existing.state))
      return describeAttempt(tx,existing);
    const formItems=await loadFormQuestions(tx,scope.form.id);
    const [accommodation]=await tx.select().from(assessmentAccommodations)
      .where(and(eq(assessmentAccommodations.accessGrantId,scope.grant.id),
        eq(assessmentAccommodations.approvalStatus,"approved")))
      .orderBy(desc(assessmentAccommodations.revisionNo)).limit(1);
    const [attempt]=await tx.insert(assessmentExecutionAttempts).values({
      accessGrantId:scope.grant.id,administrationId:scope.administration.id,
      learnerId:scope.registration.learnerId!,formVersionId:scope.form.id,
      attemptNo:(existing?.attemptNo??0)+1,
      selectionSeed:BigInt(randomInt(1,2147483647)),
      accommodationDecisionId:accommodation?.id??null,
      requestKey:input.requestId,
    }).returning();
    for(const [i,item] of formItems.entries()) {
      await tx.insert(assessmentExecutionItems).values({
        attemptId:attempt.id,formVersionId:scope.form.id,
        formItemId:item.formItemId,itemVersionId:item.itemVersionId,
        questionNumber:i+1,pointsAvailable:item.maxPoints.toFixed(4),
      });
    }
    await tx.update(assessmentExecutionAttempts).set({state:"in_progress"})
      .where(eq(assessmentExecutionAttempts.id,attempt.id));
    const [started]=await tx.select().from(assessmentExecutionAttempts)
      .where(eq(assessmentExecutionAttempts.id,attempt.id)).limit(1);
    return describeAttempt(tx,started!);
  });
}

export async function submitNoncreditKnowledgeCheck(context:CommandContext,input:{
  courseAttemptId:string;attemptId:string;requestId:string;
  answers:{questionId:string;optionIds:string[]}[];
}) {
  return db.transaction(async tx=>{
    const scope=await loadNoncreditAssessment(tx,context,input.courseAttemptId);
    const [attempt]=await tx.select().from(assessmentExecutionAttempts)
      .where(and(eq(assessmentExecutionAttempts.id,input.attemptId),
        eq(assessmentExecutionAttempts.accessGrantId,scope.grant.id),
        eq(assessmentExecutionAttempts.learnerId,scope.registration.learnerId!)))
      .for("update").limit(1);
    if(!attempt)throw new AuthorizationError("personal knowledge check attempt");
    if(attempt.state!=="in_progress")return describeAttempt(tx,attempt);
    if(attempt.expiresAt&&attempt.expiresAt<new Date())
      throw new Error("This timed knowledge check has expired");
    const items=await tx.select().from(assessmentExecutionItems)
      .where(eq(assessmentExecutionItems.attemptId,attempt.id))
      .orderBy(asc(assessmentExecutionItems.questionNumber));
    if(!items.length||items.length!==input.answers.length||
      new Set(input.answers.map(a=>a.questionId)).size!==items.length)
      throw new Error("Please answer every question once");
    const answers=new Map(input.answers.map(a=>[a.questionId,a.optionIds]));
    const options=await tx.select().from(assessmentItemOptions)
      .where(inArray(assessmentItemOptions.itemVersionId,items.map(i=>i.itemVersionId)));
    const versions=await tx.select().from(assessmentItemVersions)
      .where(inArray(assessmentItemVersions.id,items.map(i=>i.itemVersionId)));
    const keyRows=await tx.select().from(assessmentItemSecureKeys)
      .where(inArray(assessmentItemSecureKeys.itemVersionId,items.map(i=>i.itemVersionId)));
    const keys=new Map(keyRows.map(k=>[k.itemVersionId,k]));
    const versionsById=new Map(versions.map(v=>[v.id,v]));
    const secret=process.env.CAN_NONCREDIT_ASSESSMENT_KEY_HEX??"";
    const scored=items.map(item=>{
      const chosen=answers.get(item.id);
      const version=versionsById.get(item.itemVersionId);
      const key=keys.get(item.itemVersionId);
      if(!chosen||!chosen.length||!version||
        !objectiveKinds.some(k=>k===version.responseKind)||
        !key||key.encryptionKeyRef!==NONCREDIT_KEY_REF)
        throw new Error("Knowledge check question cannot be scored");
      const validOptions=options.filter(o=>o.itemVersionId===item.itemVersionId).map(o=>o.id);
      const correct=openNoncreditAnswerKey(secret,item.itemVersionId,key.encryptedKey);
      const score=scoreNoncreditChoices({
        responseKind:version.responseKind as typeof objectiveKinds[number],
        chosenOptionIds:chosen,correctOptionIds:correct,
        availableOptionIds:validOptions,maxPoints:Number(item.pointsAvailable),
      });
      return {item,chosen,score};
    });
    // Write answers while the attempt is in_progress, then atomically
    // transition to submitted, score, and record a provisional result.
    for(const {item,chosen} of scored) {
      const [response]=await tx.insert(assessmentExecutionResponses).values({
        attemptItemId:item.id,revisionNo:1,responseState:"submitted",
        clientRequestId:input.requestId+":"+item.id,
      }).returning({id:assessmentExecutionResponses.id});
      for(const [position,optionId] of chosen.entries()) {
        await tx.insert(assessmentExecutionChoices).values({
          responseVersionId:response.id,attemptItemId:item.id,
          itemVersionId:item.itemVersionId,optionId,answerPosition:position+1,
        });
      }
    }
    await tx.update(assessmentExecutionAttempts).set({state:"submitted"})
      .where(eq(assessmentExecutionAttempts.id,attempt.id));
    for(const {item,score} of scored) {
      const [response]=await tx.select().from(assessmentExecutionResponses)
        .where(and(eq(assessmentExecutionResponses.attemptItemId,item.id),
          eq(assessmentExecutionResponses.revisionNo,1))).limit(1);
      await tx.insert(assessmentAutoScores).values({
        attemptItemId:item.id,responseVersionId:response.id,scoringKind:"automated",
        scoringEngineVersion:NONCREDIT_SCORING_ENGINE,score:score.toFixed(4),
        rubricEvidence:{method:"exact_option_match",engine:NONCREDIT_SCORING_ENGINE},
      });
    }
    await tx.update(assessmentExecutionAttempts).set({state:"scored"})
      .where(eq(assessmentExecutionAttempts.id,attempt.id));
    const total=scored.reduce((sum,x)=>sum+Number(x.item.pointsAvailable),0);
    const earned=scored.reduce((sum,x)=>sum+x.score,0);
    const evaluated=evaluateKnowledgeCheckResult(
      earned,total,scope.form.passingFraction===null?null:Number(scope.form.passingFraction),
    );
    const [result]=await tx.insert(assessmentExecutionResults).values({
      attemptId:attempt.id,resultRevision:1,resultStatus:"provisional",
      pointsEarned:earned.toFixed(4),pointsPossible:total.toFixed(4),
      outcome:evaluated.outcome,
      resultEvidence:{engine:NONCREDIT_SCORING_ENGINE,courseAttemptId:scope.access.courseAttemptId},
    }).returning({id:assessmentExecutionResults.id});
    return {state:"scored" as const,attemptId:attempt.id,
      resultId:result.id,outcome:evaluated.outcome,
      pointsEarned:earned,pointsPossible:total,
      message:"Knowledge check submitted. Result pending provider finalization."};
  });
}
