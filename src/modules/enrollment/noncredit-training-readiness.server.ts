import {and,eq,inArray} from "drizzle-orm";
import {db} from "@/db/client";
import {
  assessmentFormAdministrations,assessmentFormItems,assessmentFormVersions,
  assessmentVersions,courseLessons,evidenceDocumentVersions,
  surveyCampaigns,surveyQuestions,surveyVersions,
} from "@/db/canonical-v301";

/** Server-only read model. The selected candidate has already passed the
 * operator's capability, Site, Deployment and publishing authorization.
 * This never publishes content, invitations or learner records.
 */
export type NoncreditTrainingReadinessCandidate={
  deploymentId:string;
  courseVersionId:string;
  offeringId:string;
  assessmentVersionId:string|null;
  providerOrganizationId:string;
};
export type NoncreditTrainingReadiness={
  lessonCount:number;
  knowledgeQuestionCount:number;
  publishedKnowledgeCheck:boolean;
  knowledgeCheckOpen:boolean;
  feedbackQuestionCount:number;
  activeFeedbackCampaign:boolean;
};

export async function readNoncreditTrainingReadiness(
  candidate:NoncreditTrainingReadinessCandidate,
  operatingOrganizationId:string,
  now=new Date(),
):Promise<NoncreditTrainingReadiness>{
  const assessmentId=candidate.assessmentVersionId;
  const [lessons,assessments,forms,administrations,campaigns]=await Promise.all([
    db.select({id:courseLessons.id}).from(courseLessons)
      .where(eq(courseLessons.courseVersionId,candidate.courseVersionId)).limit(1001),
    assessmentId?db.select({
      id:assessmentVersions.id,lifecycle:assessmentVersions.lifecycle,
    }).from(assessmentVersions).where(eq(assessmentVersions.id,assessmentId)).limit(2):[],
    assessmentId?db.select({
      id:assessmentFormVersions.id,lifecycle:assessmentFormVersions.lifecycle,
    }).from(assessmentFormVersions)
      .where(eq(assessmentFormVersions.assessmentVersionId,assessmentId)).limit(101):[],
    assessmentId?db.select({
      id:assessmentFormAdministrations.id,
      administeringOrganizationId:assessmentFormAdministrations.administeringOrganizationId,
      formVersionId:assessmentFormAdministrations.formVersionId,
      courseVersionId:assessmentFormAdministrations.courseVersionId,
      deploymentId:assessmentFormAdministrations.deploymentId,
      status:assessmentFormAdministrations.status,
      opensAt:assessmentFormAdministrations.opensAt,
      closesAt:assessmentFormAdministrations.closesAt,
    }).from(assessmentFormAdministrations)
      .where(eq(assessmentFormAdministrations.assessmentVersionId,assessmentId)).limit(101):[],
    db.select({
      id:surveyCampaigns.id,
      surveyVersionId:surveyCampaigns.surveyVersionId,
      permissionId:surveyCampaigns.surveyPermissionEvidenceId,
      responseMode:surveyCampaigns.responseMode,
      status:surveyCampaigns.status,
      startsAt:surveyCampaigns.startsAt,
      endsAt:surveyCampaigns.endsAt,
    }).from(surveyCampaigns)
      .where(and(
        eq(surveyCampaigns.operatingOrganizationId,operatingOrganizationId),
        eq(surveyCampaigns.deploymentId,candidate.deploymentId),
        eq(surveyCampaigns.offeringId,candidate.offeringId),
      )).limit(101),
  ]);
  if(lessons.length>1000||forms.length>100||administrations.length>100||
     campaigns.length>100)
    throw new Error("Training readiness inventory exceeds interactive bounds");
  const publishedForms=assessments.some(row=>row.lifecycle==="published")?
    forms.filter(row=>row.lifecycle==="published"):[];
  const formIds=publishedForms.map(row=>row.id);
  const surveyVersionIds=[...new Set(campaigns.map(row=>row.surveyVersionId))];
  const permissionIds=[...new Set(campaigns.flatMap(row=>row.permissionId?[row.permissionId]:[]))];
  const [formItems,versions,permissions,questions]=await Promise.all([
    formIds.length?db.select({
      id:assessmentFormItems.id,formVersionId:assessmentFormItems.formVersionId,
    }).from(assessmentFormItems)
      .where(inArray(assessmentFormItems.formVersionId,formIds)).limit(1001):[],
    surveyVersionIds.length?db.select({
      id:surveyVersions.id,lifecycle:surveyVersions.lifecycle,
    }).from(surveyVersions).where(inArray(surveyVersions.id,surveyVersionIds)).limit(101):[],
    permissionIds.length?db.select({
      id:evidenceDocumentVersions.id,
      verifiedAt:evidenceDocumentVersions.verifiedAt,
      verifiedByPersonId:evidenceDocumentVersions.verifiedByPersonId,
      validFrom:evidenceDocumentVersions.validFrom,
      validThrough:evidenceDocumentVersions.validThrough,
    }).from(evidenceDocumentVersions)
      .where(inArray(evidenceDocumentVersions.id,permissionIds)).limit(101):[],
    surveyVersionIds.length?db.select({
      id:surveyQuestions.id,surveyVersionId:surveyQuestions.surveyVersionId,
    }).from(surveyQuestions)
      .where(inArray(surveyQuestions.surveyVersionId,surveyVersionIds)).limit(1001):[],
  ]);
  if(formItems.length>1000||questions.length>1000)
    throw new Error("Training question inventory exceeds interactive bounds");
  const formItemCounts=new Map<string,number>();
  for(const row of formItems)
    formItemCounts.set(row.formVersionId,(formItemCounts.get(row.formVersionId)??0)+1);
  const knowledgeQuestionCount=Math.max(0,...publishedForms.map(
    row=>formItemCounts.get(row.id)??0));
  const activeFormIds=new Set(publishedForms.filter(
    row=>(formItemCounts.get(row.id)??0)>0).map(row=>row.id));
  const knowledgeCheckOpen=administrations.some(row=>
    activeFormIds.has(row.formVersionId)&&
    row.administeringOrganizationId===candidate.providerOrganizationId&&
    row.courseVersionId===candidate.courseVersionId&&
    row.deploymentId===candidate.deploymentId&&
    row.status==="open"&&
    (!row.opensAt||row.opensAt<=now)&&
    (!row.closesAt||row.closesAt>now));
  const today=now.toISOString().slice(0,10);
  const versionSet=new Set(versions.filter(row=>row.lifecycle==="published").map(row=>row.id));
  const permissionSet=new Set(permissions.filter(row=>
    row.verifiedAt!==null&&row.verifiedAt<=now&&row.verifiedByPersonId!==null&&
    (row.validFrom===null||row.validFrom<=today)&&
    (row.validThrough===null||row.validThrough>=today)).map(row=>row.id));
  const questionCounts=new Map<string,number>();
  for(const row of questions)
    questionCounts.set(row.surveyVersionId,(questionCounts.get(row.surveyVersionId)??0)+1);
  const validCampaigns=campaigns.filter(row=>
    row.status==="active"&&row.responseMode==="identified"&&
    row.startsAt<=now&&(!row.endsAt||row.endsAt>now)&&
    versionSet.has(row.surveyVersionId)&&
    !!row.permissionId&&permissionSet.has(row.permissionId)&&
    (questionCounts.get(row.surveyVersionId)??0)>0);
  return {
    lessonCount:lessons.length,
    knowledgeQuestionCount,
    publishedKnowledgeCheck:knowledgeQuestionCount>0,
    knowledgeCheckOpen,
    feedbackQuestionCount:Math.max(0,...validCampaigns.map(
      row=>questionCounts.get(row.surveyVersionId)??0)),
    activeFeedbackCampaign:validCampaigns.length>0,
  };
}
