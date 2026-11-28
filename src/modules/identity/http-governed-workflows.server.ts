import * as completionAdmin0 from "@/modules/learning/noncredit-completion-decisions.server";
import * as completionAdmin1 from "@/modules/learning/noncredit-completion-policy.server";
import * as completionAdmin2 from "@/modules/learning/noncredit-completion-review.server";
import * as completionAdmin3 from "@/modules/learning/noncredit-completion-corrections.server";
import * as noncreditPublication from "@/modules/enrollment/noncredit-enrollment-publication.server";
import * as knowledgeCheck from "@/modules/learning/noncredit-assessment-http.server";
import {getNoncreditCompletionReadinessService} from "@/modules/learning/noncredit-completion.server";
import {accessSessionCookie} from "@/domain/access-tokens";
import {readCookie} from "@/domain/session-cookies";
import * as pilotOutcomes from "@/modules/learning/noncredit-pilot-outcomes.server";
import * as operatorNetwork from "@/modules/enrollment/noncredit-network-report.server";
import * as facilitatedImpact from "@/modules/learning/facilitated-impact.server";
import * as classSurvey from "@/modules/classes/native-class-survey-link.server";
import * as roomSurvey from "@/modules/learning/classroom-surveys.server";
import * as surveyDraft from "@/modules/operations/canonical-survey-draft.server";
import * as surveyApproval from "@/modules/operations/canonical-survey-approvals.server";
import * as courseSurvey from "@/modules/learning/course-surveys.server";
import * as artifacts from "@/modules/programs/site-marketing-artifacts.server";
import * as marketing from "@/modules/programs/site-marketing-packages-v61.server";
import * as engagement from "@/modules/engagement/engagement-registry-service.server";
import * as engagementInput from "@/modules/engagement/engagement-registry.inputs";
import * as sender from "@/modules/communication/sender-registry-service.server";
import * as senderInput from "@/modules/communication/sender-registry.inputs";
import {parseCommandInput} from "@/domain/command-input";
import * as campaign from "@/modules/communication/engagement-campaigns-service.server";
import * as campaignInput from "@/modules/communication/engagement-campaigns.inputs";
import {getIdentityContext} from "./command-context.server";
import {getCanonicalCommandContext} from "./canonical-command-context.server";
import {getBlueprintPlanningContext} from "@/modules/blueprints/verified-site-planning.server";
import {AuthorizationError} from "@/domain/command-context";
import {readCanonicalBlueprintConfigurationService,readCanonicalBlueprintReviewService,readCanonicalBlueprintReviewHistoryService,createCanonicalBlueprintConfigurationService,saveCanonicalBlueprintConfigurationService,submitCanonicalBlueprintConfigurationService,decideCanonicalBlueprintReviewService,executeCanonicalBlueprintConfigurationService} from "@/modules/blueprints/blueprint-commands.server";
import {recordNativeDeploymentReadinessService} from "@/modules/programs/native-deployment-readiness.server";
import {placeNativeDeploymentSiteService} from "@/modules/programs/native-deployment-placement.server";
import {approveNativeOfferingAdoptionService} from "@/modules/programs/native-offering-adoption-command.server";
import {enrollMyselfInNoncreditService} from "@/modules/enrollment/noncredit-self-registration.server";
import {enrollInNativeClassService} from "@/modules/classes/native-class-enrollment-command.server";
import {scheduleNativeClassSessionsService} from "@/modules/classes/native-class-sessions.server";
import {changeNativeClassSessionScheduleService} from "@/modules/classes/native-class-sessions.server";
import {openNativeClassSessionService} from "@/modules/classes/native-class-sessions.server";
import {revokeNativeClassSessionService} from "@/modules/classes/native-class-sessions.server";
import {transferNativeClassroomControlService} from "@/modules/classes/native-classroom-control.server";
import {publishNativeClassSessionAgendaService} from "@/modules/classes/native-class-session-agenda.server";
import {pairWithFacilitatedRoomService,leaveFacilitatedRoomService,renewFacilitatedLearningPairingService,endFacilitatedLearningRoomService,recordFacilitatedPlaybackService} from "@/modules/learning/facilitated-learning.server";
import {attestClassroomParticipationService,getClassroomAttendanceRosterService} from "@/modules/learning/classroom-attendance.server";
import {issueClassroomProjectorCommandService,getClassroomProjectorCommandService} from "@/modules/learning/classroom-projector.server";
import {releaseClassroomActivityService,closeClassroomActivityService,submitClassroomResponseService,recordClassroomPresenceService,getClassroomLearnerActivitiesService,getClassroomPresentationStateService} from "@/modules/learning/classroom-evidence.server";
import {getClassroomConnectCourseChoicesService} from "@/modules/learning/classroom-connect.server";
import {getInstructionalLearnerContext} from "./learning-command-context.server";
import {getFacilitatedRoomMediaService,getFacilitatedRoomMediaAccessService,getLearnerFacilitatedRoomService} from "@/modules/learning/facilitated-learning.server";
import {getNativeClassSessionAgendaService} from "@/modules/classes/native-class-session-agenda.server";
import {resumeLinkedNativeClassLearnerService} from "@/modules/classes/native-class-session-recovery.server";
import {activateReviewedNativeClassLearnerService} from "@/modules/classes/native-class-reviewed-onboarding.server";
import {createUnifiedClassDraftService,activateUnifiedClassService,getMyUnifiedClassDraftsService,publishUnifiedClassOfferingService,closeUnifiedClassOfferingService,createNextUnifiedClassOfferingVersionService,getNativeClassOperatorSitesService,getUnifiedClassCourseOptionsService} from "@/modules/classes/unified-class.server";
import {getNativeOfferingAdoptionReviewQueueService} from "@/modules/programs/native-offering-adoption-queue.server";
import {readCanonicalBlueprintHomeService} from "@/modules/blueprints/blueprint-commands.server";
import {getNativeClassReportService} from "@/modules/reporting/native-class-report.server";
import {requestReportingRelationshipService,decideRelationshipRequestService} from "@/modules/reporting/reporting-relationship-commands.server";
import {readRelationshipPortfolio} from "@/modules/reporting/bottom-up-reporting-relationships.server";
import {getMyNativeTeachingClassesService,getNativeTeacherTodayService} from "@/modules/classes/native-class-teacher-home.server";
import {getNativeClassTeacherHomeworkService,getNativeClassTeacherMissingWorkService,getNativeClassTeacherOpenFollowUpsService,createNativeClassMissingWorkFollowUpService,getNativeClassTeacherHomeworkHistoryService,returnNativeClassPracticeFeedbackService,getNativeClassTeacherAssessmentsService,getNativeClassTeacherHistoricalWorkService} from "@/modules/classes/native-class-teacher-homework.server";
import {getMyNativeGuardianLearnersService,requestNativeGuardianClassApprovalService,getMyNativeGuardianClassApprovalsService,acceptNativeGuardianClassApprovalService,withdrawMyGuardianNativeClassEnrollmentService,getMyNativeGuardianClassEnrollmentsService,getGuardianCommunitySummaryService} from "@/modules/classes/native-class-guardian-enrollment.server";
import {createSiteGoLinkService,listSiteGoLinksPageService,listAvailableGoDestinationsService,inspectSavedGoLinkService,setSiteGoLinkPausedService,revokeSiteGoLinkService} from "@/modules/engagement/site-go-link-management.server";
import {exploreCanonicalBlueprintReferencesService,discoverCanonicalBlueprintOfferingsService,readCanonicalBlueprintWorkspaceService,listCanonicalBlueprintReviewsService,listCanonicalBlueprintReviewEvidenceService} from "@/modules/blueprints/blueprint-catalog-read.server";
import {organizationLaunchWorkflows} from "@/modules/sites/organization-launch-http-workflows.server";
export type WorkflowMode="planning"|"canonical"|"can"|"learner"|"operator-reporting";
/** Existing independent native reviewer credentials remain distinct from CAN.
 * No fallback, new role, token or grant is manufactured by this adapter. */
export async function resolveGovernedWorkflow(request:Request,mode:WorkflowMode){
 if(request.method!=="POST"&&request.method!=="GET")throw new AuthorizationError("explicit HTTP method");
 if(mode==="operator-reporting"&&request.method!=="GET")throw new AuthorizationError("read-only reporting context");
 const context=await (mode==="operator-reporting"?(readCookie(request,accessSessionCookie)!==undefined?getIdentityContext(request):getCanonicalCommandContext(request)):mode==="planning"?getBlueprintPlanningContext(request):mode==="canonical"?getCanonicalCommandContext(request):mode==="learner"?getInstructionalLearnerContext(request):getIdentityContext(request));
 if(!context.actorPersonId)throw new AuthorizationError("verified Person");
 return {
  ...organizationLaunchWorkflows(request,mode),
  decideNoncreditCompletion:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("Completion administration context");return completionAdmin0.decideNoncreditCompletionService(request,raw);},
  getNoncreditCompletionPolicyCatalog:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="canonical")throw new AuthorizationError("Completion administration context");return completionAdmin1.getNoncreditCompletionPolicyCatalogService(request);},
  publishNoncreditCompletionPolicy:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("Completion administration context");return completionAdmin1.publishNoncreditCompletionPolicyService(request,raw);},
  getNoncreditCompletionReview:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="canonical")throw new AuthorizationError("Completion administration context");return completionAdmin2.getNoncreditCompletionReviewService(request,raw);},
  getNoncreditCompletionQueue:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="canonical")throw new AuthorizationError("Completion administration context");return completionAdmin2.getNoncreditCompletionQueueService(request,raw);},
  correctNoncreditCompletion:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("Completion administration context");return completionAdmin3.correctNoncreditCompletionService(request,raw);},
  getNoncreditEnrollmentPublisher:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="canonical")throw new AuthorizationError("Enrollment publication context");return (async()=>{const result=await noncreditPublication.getNoncreditEnrollmentPublisherService(request);return {...result,published:result.published.map(row=>({...row,opensAt:row.opensAt.toISOString(),closesAt:row.closesAt.toISOString()}))};})();},
  getNoncreditTrainingReadiness:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="canonical")throw new AuthorizationError("Enrollment publication context");return noncreditPublication.getNoncreditTrainingReadinessService(request,raw);},
  publishNoncreditSelfEnrollment:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("Enrollment publication context");return noncreditPublication.publishNoncreditSelfEnrollmentService(request,raw);},
  closeNoncreditSelfEnrollment:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("Enrollment publication context");return noncreditPublication.closeNoncreditSelfEnrollmentService(request,raw);},
  publishNoncreditAcrossAuthorizedSites:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("Enrollment publication context");return noncreditPublication.publishNoncreditAcrossAuthorizedSitesService(request,raw);},
  getNoncreditKnowledgeCheck:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="learner")throw new AuthorizationError("Knowledge check context");return knowledgeCheck.getNoncreditKnowledgeCheckService(request,raw);},
  beginNoncreditKnowledgeCheckAttempt:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="learner")throw new AuthorizationError("Knowledge check context");return knowledgeCheck.beginNoncreditKnowledgeCheckAttemptService(request,raw);},
  saveNoncreditKnowledgeCheckAnswer:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="learner")throw new AuthorizationError("Knowledge check context");return knowledgeCheck.saveNoncreditKnowledgeCheckAnswerService(request,raw);},
  submitNoncreditKnowledgeCheckAnswers:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="learner")throw new AuthorizationError("Knowledge check context");return knowledgeCheck.submitNoncreditKnowledgeCheckAnswersService(request,raw);},
  finalizeNoncreditKnowledgeCheckResult:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("Knowledge check context");return knowledgeCheck.finalizeNoncreditKnowledgeCheckResultService(request,raw);},
  provisionNoncreditKnowledgeCheckAccess:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("Knowledge check context");return knowledgeCheck.provisionNoncreditKnowledgeCheckAccessService(request,raw);},
  getNoncreditCompletionReadiness:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="learner")throw new AuthorizationError("Knowledge check context");return getNoncreditCompletionReadinessService(request,raw);},
  getNoncreditPilotOutcomes:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="operator-reporting")throw new AuthorizationError("Operational reporting context");return {...await pilotOutcomes.getNoncreditPilotOutcomes(request,raw),disclosureApproved:false as const};},
  getNoncreditOperatorNetworkSummary:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="operator-reporting")throw new AuthorizationError("Operational reporting context");return operatorNetwork.getNoncreditOperatorNetworkSummary(request,raw);},
  getFacilitatedImpactReport:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="canonical")throw new AuthorizationError("Operational reporting context");return facilitatedImpact.getFacilitatedImpactReport(request);},
  getNativeClassSurveyCampaignOptions:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="canonical")throw new AuthorizationError("Classroom survey context");return classSurvey.getNativeClassSurveyCampaignOptions(request,raw);},
  linkNativeClassSurveyCampaign:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("Classroom survey context");return classSurvey.linkNativeClassSurveyCampaign(request,raw);},
  getClassroomSurveyOptions:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="canonical")throw new AuthorizationError("Classroom survey context");return roomSurvey.getClassroomSurveyOptions(request,raw);},
  attachClassroomSurvey:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("Classroom survey context");return roomSurvey.attachClassroomSurvey(request,raw);},
  getClassroomLearnerSurveys:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="learner")throw new AuthorizationError("Classroom survey context");return roomSurvey.getClassroomLearnerSurveys(request,raw);},
  readCanonicalSurveyDraftAccess:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="canonical")throw new AuthorizationError("Survey context");return surveyDraft.readCanonicalSurveyDraftAccess(request);},
  createCanonicalSurveyDraft:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("Survey context");return surveyDraft.createCanonicalSurveyDraft(request,raw);},
  readCanonicalSurveyReviewQueue:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="canonical")throw new AuthorizationError("Survey context");return surveyApproval.readCanonicalSurveyReviewQueue(request);},
  readCanonicalSurveyPublicationQueue:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="canonical")throw new AuthorizationError("Survey context");return surveyApproval.readCanonicalSurveyPublicationQueue(request);},
  recordCanonicalSurveyReview:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("Survey context");return surveyApproval.recordCanonicalSurveyReview(request,raw);},
  publishCanonicalSurveyVersion:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("Survey context");return surveyApproval.publishCanonicalSurveyVersion(request,raw);},
  listNoncreditCourseSurveys:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="learner")throw new AuthorizationError("Survey context");return courseSurvey.listNoncreditCourseSurveys(request,raw);},
  getCourseSurvey:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="learner")throw new AuthorizationError("Survey context");return courseSurvey.getCourseSurvey(request,raw);},
  submitCourseSurvey:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="learner")throw new AuthorizationError("Survey context");return courseSurvey.submitCourseSurvey(request,raw);},
  previewSiteMarketingArtifact:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Marketing artifact context");return artifacts.previewSiteMarketingArtifact(request,raw);},
  createSiteMarketingPackageRelease:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Marketing artifact context");return artifacts.createSiteMarketingPackageRelease(request,raw);},
  listSiteMarketingPackageReleases:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("Marketing artifact context");return artifacts.listSiteMarketingPackageReleases(request,raw);},
  listSiteMarketingReleases:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("Marketing artifact context");return artifacts.listSiteMarketingReleases(request,raw);},
  getSiteMarketingReleaseOutput:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("Marketing artifact context");return artifacts.getSiteMarketingReleaseOutput(request,raw);},
  withdrawSiteMarketingRelease:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Marketing artifact context");return artifacts.withdrawSiteMarketingRelease(request,raw);},
  readSiteMarketingSuggestionsV61:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("Marketing package context");return marketing.readSiteMarketingSuggestionsV61(request,raw);},
  listSiteMarketingPackagesPageV61:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("Marketing package context");return marketing.listSiteMarketingPackagesPageV61(request,raw);},
  createSiteMarketingPackageV61:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Marketing package context");return marketing.createSiteMarketingPackageV61(request,raw);},
  saveSiteMarketingPackageV61:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Marketing package context");return marketing.saveSiteMarketingPackageV61(request,raw);},
  duplicateSiteMarketingPackageV61:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Marketing package context");return marketing.duplicateSiteMarketingPackageV61(request,raw);},
  archiveSiteMarketingPackageV61:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Marketing package context");return marketing.archiveSiteMarketingPackageV61(request,raw);},
  selectSiteMarketingPackageBrandV61:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Marketing package context");return marketing.selectSiteMarketingPackageBrandV61(request,raw);},
  deleteSiteMarketingPackageV61:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Marketing package context");return marketing.deleteSiteMarketingPackageV61(request,raw);},
  createEngagementDefinition:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Engagement context");return engagement.createEngagementDefinition(request,parseCommandInput(engagementInput.createEngagementDefinitionInput,raw));},
  createEngagementGoLink:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Engagement context");return engagement.createEngagementGoLink(request,parseCommandInput(engagementInput.createEngagementGoLinkInput,raw));},
  listEngagementGoLinks:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("Engagement context");return engagement.listEngagementGoLinks(request,parseCommandInput(engagementInput.listEngagementGoLinksInput,raw));},
  retireEngagementDefinition:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Engagement context");return engagement.retireEngagementDefinition(request,parseCommandInput(engagementInput.retireEngagementDefinitionInput,raw));},
  revokeEngagementGoLink:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Engagement context");return engagement.revokeEngagementGoLink(request,parseCommandInput(engagementInput.revokeEngagementGoLinkInput,raw));},
  listSiteEngagementDefinitions:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("Engagement context");return engagement.listSiteEngagementDefinitions(request,parseCommandInput(engagementInput.listSiteEngagementDefinitionsInput,raw));},
  prepareEngagementEmailDraft:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("Engagement context");return engagement.prepareEngagementEmailDraft(request,parseCommandInput(engagementInput.prepareEngagementEmailDraftInput,raw));},
  listOwnerEngagementDestinations:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("Engagement context");return engagement.listOwnerEngagementDestinations(request,parseCommandInput(engagementInput.listOwnerEngagementDestinationsInput,raw));},
  listOwnerEngagementDefinitions:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("Engagement context");return engagement.listOwnerEngagementDefinitions(request,parseCommandInput(engagementInput.listOwnerEngagementDefinitionsInput,raw));},
  readSenderAdministration:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("Sender administration context");return sender.readSenderAdministration(request,parseCommandInput(senderInput.scopeInput,raw).organizationId);},
  listSenderOrganizationsPage:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("Sender administration context");return sender.listSenderOrganizationsPage(request,parseCommandInput(senderInput.pageInput,raw));},
  changeSenderAdministration:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Sender administration context");return sender.changeSenderAdministration(request,parseCommandInput(senderInput.changeInput,raw));},
  revokeSenderAdministration:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Sender administration context");return sender.revokeSenderAdministration(request,parseCommandInput(senderInput.revokeInput,raw));},
  readEngagementCampaignWorkspace:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("Campaign read context");const result=await campaign.readEngagementCampaignWorkspace(request,parseCommandInput(campaignInput.readEngagementCampaignWorkspaceInput,raw));return {...result,campaigns:result.campaigns.map(row=>({...row,scheduled_at:new Date(row.scheduled_at).toISOString(),cancelled_at:row.cancelled_at===null?null:new Date(row.cancelled_at).toISOString()}))};},
  saveCampaignRecipientList:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Campaign command context");const result=await campaign.saveCampaignRecipientList(request,parseCommandInput(campaignInput.saveCampaignRecipientListInput,raw));return result;},
  queueEngagementCampaign:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Campaign command context");const result=await campaign.queueEngagementCampaign(request,parseCommandInput(campaignInput.queueEngagementCampaignInput,raw));return result;},
  cancelEngagementCampaign:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Campaign command context");const result=await campaign.cancelEngagementCampaign(request,parseCommandInput(campaignInput.cancelEngagementCampaignInput,raw));return result;},
  readCampaignListMembers:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("Campaign read context");const result=await campaign.readCampaignListMembers(request,parseCommandInput(campaignInput.readCampaignListMembersInput,raw));return {...result,members:result.members.map(row=>({...row,consent_at:new Date(row.consent_at).toISOString()}))};},
  updateCampaignListMember:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Campaign command context");const result=await campaign.updateCampaignListMember(request,parseCommandInput(campaignInput.updateCampaignListMemberInput,raw));return result;},
  exploreCanonicalBlueprintReferences:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="planning")throw new AuthorizationError("catalog or reviewer context");return exploreCanonicalBlueprintReferencesService(request,raw);},
  discoverCanonicalBlueprintOfferings:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="planning")throw new AuthorizationError("catalog or reviewer context");return discoverCanonicalBlueprintOfferingsService(request,raw);},
  readCanonicalBlueprintWorkspace:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="planning")throw new AuthorizationError("catalog or reviewer context");return readCanonicalBlueprintWorkspaceService(request,raw);},
  listCanonicalBlueprintReviews:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="canonical")throw new AuthorizationError("catalog or reviewer context");return listCanonicalBlueprintReviewsService(request);},
  listCanonicalBlueprintReviewEvidence:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="canonical")throw new AuthorizationError("catalog or reviewer context");return listCanonicalBlueprintReviewEvidenceService(request,raw);},
  createSiteGoLink:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Site Go Link context");return createSiteGoLinkService(request,raw);},
  listSiteGoLinksPage:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("Site Go Link context");return listSiteGoLinksPageService(request,raw);},
  listAvailableGoDestinations:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("Site Go Link context");return listAvailableGoDestinationsService(request,raw);},
  inspectSavedGoLink:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("Site Go Link context");return inspectSavedGoLinkService(request,raw);},
  setSiteGoLinkPaused:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Site Go Link context");return setSiteGoLinkPausedService(request,raw);},
  revokeSiteGoLink:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Site Go Link context");return revokeSiteGoLinkService(request,raw);},
  getMyNativeTeachingClasses:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("role workspace context");if(context.role!=="teacher")throw new AuthorizationError("teacher membership");return getMyNativeTeachingClassesService(request,raw);},
  getNativeTeacherToday:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("role workspace context");if(context.role!=="teacher")throw new AuthorizationError("teacher membership");return getNativeTeacherTodayService(request,raw);},
  getNativeClassTeacherHomework:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="canonical")throw new AuthorizationError("role workspace context");return getNativeClassTeacherHomeworkService(request,raw);},
  getNativeClassTeacherMissingWork:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="canonical")throw new AuthorizationError("role workspace context");return getNativeClassTeacherMissingWorkService(request,raw);},
  getNativeClassTeacherOpenFollowUps:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="canonical")throw new AuthorizationError("role workspace context");return getNativeClassTeacherOpenFollowUpsService(request,raw);},
  createNativeClassMissingWorkFollowUp:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("role workspace context");return createNativeClassMissingWorkFollowUpService(request,raw);},
  getNativeClassTeacherHomeworkHistory:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="canonical")throw new AuthorizationError("role workspace context");return getNativeClassTeacherHomeworkHistoryService(request,raw);},
  returnNativeClassPracticeFeedback:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("role workspace context");return returnNativeClassPracticeFeedbackService(request,raw);},
  getNativeClassTeacherAssessments:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="canonical")throw new AuthorizationError("role workspace context");return getNativeClassTeacherAssessmentsService(request,raw);},
  getNativeClassTeacherHistoricalWork:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="canonical")throw new AuthorizationError("role workspace context");return getNativeClassTeacherHistoricalWorkService(request,raw);},
  getMyNativeGuardianLearners:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("role workspace context");return getMyNativeGuardianLearnersService(request,raw);},
  getMyNativeGuardianClassApprovals:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("role workspace context");return getMyNativeGuardianClassApprovalsService(request,raw);},
  getMyNativeGuardianClassEnrollments:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("role workspace context");return getMyNativeGuardianClassEnrollmentsService(request,raw);},
  getGuardianCommunitySummary:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("role workspace context");return getGuardianCommunitySummaryService(request,raw);},
  requestNativeGuardianClassApproval:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("role workspace context");return requestNativeGuardianClassApprovalService(request,raw);},
  acceptNativeGuardianClassApproval:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("role workspace context");return acceptNativeGuardianClassApprovalService(request,raw);},
  withdrawMyGuardianNativeClassEnrollment:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("role workspace context");return withdrawMyGuardianNativeClassEnrollmentService(request,raw);},
  getNativeClassReport:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="canonical")throw new AuthorizationError("reporting context");return getNativeClassReportService(request,raw);},
  requestReportingRelationship:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("reporting context");return requestReportingRelationshipService(request,raw);},
  decideRelationshipRequest:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("reporting context");return decideRelationshipRequestService(request,raw);},
  getRelationshipPortfolio:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("reporting context");return readRelationshipPortfolio(request);},
  getNativeOfferingAdoptionReviewQueue:async()=>{if(request.method!=="GET"||mode!=="canonical")throw new AuthorizationError("adoption review context");return getNativeOfferingAdoptionReviewQueueService(request);},
  readCanonicalBlueprintHome:async()=>{if(request.method!=="GET"||mode!=="planning")throw new AuthorizationError("planning context");return readCanonicalBlueprintHomeService(request);},
  createUnifiedClassDraft:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("class operator context");return createUnifiedClassDraftService(request,raw);},
  activateUnifiedClass:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("class operator context");return activateUnifiedClassService(request,raw);},
  publishUnifiedClassOffering:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("class operator context");return publishUnifiedClassOfferingService(request,raw);},
  closeUnifiedClassOffering:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("class operator context");return closeUnifiedClassOfferingService(request,raw);},
  createNextUnifiedClassOfferingVersion:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("class operator context");return createNextUnifiedClassOfferingVersionService(request,raw);},
  getMyUnifiedClassDrafts:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="canonical")throw new AuthorizationError("class operator context");return getMyUnifiedClassDraftsService(request,raw);},
  getNativeClassOperatorSites:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="canonical")throw new AuthorizationError("class operator context");return getNativeClassOperatorSitesService(request,raw);},
  getUnifiedClassCourseOptions:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="canonical")throw new AuthorizationError("class operator context");return getUnifiedClassCourseOptionsService(request,raw);},
  getFacilitatedRoomMedia:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="canonical")throw new AuthorizationError("governed workflow context");return getFacilitatedRoomMediaService(request,raw);},
  getFacilitatedRoomMediaAccess:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("governed workflow context");return getFacilitatedRoomMediaAccessService(request,raw);},
  getLearnerFacilitatedRoom:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="learner")throw new AuthorizationError("governed workflow context");return getLearnerFacilitatedRoomService(request,raw);},
  getNativeClassSessionAgenda:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="canonical")throw new AuthorizationError("governed workflow context");return getNativeClassSessionAgendaService(request,raw);},
  resumeLinkedNativeClassLearner:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("governed workflow context");return resumeLinkedNativeClassLearnerService(request);},
  activateReviewedNativeClassLearner:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("governed workflow context");return activateReviewedNativeClassLearnerService(request);},
  pairWithFacilitatedRoom:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="learner")throw new AuthorizationError("classroom operation context");return pairWithFacilitatedRoomService(request,raw);},
  leaveFacilitatedRoom:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="learner")throw new AuthorizationError("classroom operation context");return leaveFacilitatedRoomService(request,raw);},
  renewFacilitatedLearningPairing:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("classroom operation context");return renewFacilitatedLearningPairingService(request,raw);},
  endFacilitatedLearningRoom:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("classroom operation context");return endFacilitatedLearningRoomService(request,raw);},
  recordFacilitatedPlayback:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("classroom operation context");return recordFacilitatedPlaybackService(request,raw);},
  attestClassroomParticipation:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("classroom operation context");return attestClassroomParticipationService(request,raw);},
  issueClassroomProjectorCommand:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("classroom operation context");return issueClassroomProjectorCommandService(request,raw);},
  releaseClassroomActivity:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("classroom operation context");return releaseClassroomActivityService(request,raw);},
  closeClassroomActivity:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("classroom operation context");return closeClassroomActivityService(request,raw);},
  submitClassroomResponse:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="learner")throw new AuthorizationError("classroom operation context");return submitClassroomResponseService(request,raw);},
  recordClassroomPresence:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="learner")throw new AuthorizationError("classroom operation context");return recordClassroomPresenceService(request,raw);},
  getClassroomConnectCourseChoices:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="learner")throw new AuthorizationError("classroom operation context");return getClassroomConnectCourseChoicesService(request,raw);},
  getClassroomAttendanceRoster:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="canonical")throw new AuthorizationError("classroom operation context");return getClassroomAttendanceRosterService(request,raw);},
  getClassroomProjectorCommand:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="canonical")throw new AuthorizationError("classroom operation context");return getClassroomProjectorCommandService(request,raw);},
  getClassroomLearnerActivities:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="learner")throw new AuthorizationError("classroom operation context");return getClassroomLearnerActivitiesService(request,raw);},
  getClassroomPresentationState:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="canonical")throw new AuthorizationError("classroom operation context");return getClassroomPresentationStateService(request,raw);},
  scheduleNativeClassSessions:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("class session context");return scheduleNativeClassSessionsService(request,raw);},
  changeNativeClassSessionSchedule:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("class session context");return changeNativeClassSessionScheduleService(request,raw);},
  openNativeClassSession:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("class session context");return openNativeClassSessionService(request,raw);},
  revokeNativeClassSession:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("class session context");return revokeNativeClassSessionService(request,raw);},
  transferNativeClassroomControl:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("class session context");return transferNativeClassroomControlService(request,raw);},
  publishNativeClassSessionAgenda:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("class session context");return publishNativeClassSessionAgendaService(request,raw);},
  registerNoncredit:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("registration context");return enrollMyselfInNoncreditService(request,raw);},
  enrollNativeClass:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("enrollment context");return enrollInNativeClassService(request,raw);},
  readCanonicalBlueprintConfiguration:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="planning")throw new AuthorizationError("governed read context");return readCanonicalBlueprintConfigurationService(request,raw);},
  readCanonicalBlueprintReview:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="planning")throw new AuthorizationError("governed read context");return readCanonicalBlueprintReviewService(request,raw);},
  readCanonicalBlueprintReviewHistory:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="planning")throw new AuthorizationError("governed read context");return readCanonicalBlueprintReviewHistoryService(request,raw);},
  createCanonicalBlueprintConfiguration:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="planning")throw new AuthorizationError("governed workflow context");return createCanonicalBlueprintConfigurationService(request,raw);},
  saveCanonicalBlueprintConfiguration:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="planning")throw new AuthorizationError("governed workflow context");return saveCanonicalBlueprintConfigurationService(request,raw);},
  submitCanonicalBlueprintConfiguration:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="planning")throw new AuthorizationError("governed workflow context");return submitCanonicalBlueprintConfigurationService(request,raw);},
  decideCanonicalBlueprintReview:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("governed workflow context");return decideCanonicalBlueprintReviewService(request,raw);},
  executeCanonicalBlueprintConfiguration:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("governed workflow context");return executeCanonicalBlueprintConfigurationService(request,raw);},
  recordNativeDeploymentReadiness:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("governed workflow context");return recordNativeDeploymentReadinessService(request,raw);},
  placeNativeDeploymentSite:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("governed workflow context");return placeNativeDeploymentSiteService(request,raw);},
  approveNativeOfferingAdoption:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("governed workflow context");return approveNativeOfferingAdoptionService(request,raw);},
 };
}
