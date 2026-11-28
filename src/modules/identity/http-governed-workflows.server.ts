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
import {startLaunchService,completeLaunchRequirementService,submitLaunchEvidenceService,reviewLaunchEvidenceService,activateLaunchService,scheduleLaunchOrientationService} from "@/modules/programs/launch-commands.server";
import {readSiteInformationV61Service,saveSiteInformationV61Service} from "@/modules/programs/site-information-v61.server";
import {readExistingSiteProgramsV61Service,readSiteProgramsAudiencesV61Service,saveSiteProgramsAudiencesV61Service} from "@/modules/programs/site-programs-audiences-v61.server";
import {readSiteBrandHttp,saveSiteBrandHttp,revokeSiteBrandAssetHttp} from "@/modules/sites/site-brand-http.server";
import {readLaunchSitePublicationService,reviewLaunchSiteWebsiteCopyService} from "@/modules/sites/launch-site-publication.server";
import {updateLaunchSiteAddressService,updateLaunchSiteContactService,updateLaunchSiteInformationService,updateLaunchSiteIdentityService,getLaunchSiteConfigurationService} from "@/modules/programs/site-configuration.server";
import {renameSitePublicIdentityService,reserveSitePublicationAddressService,setSitePublicationStatusService,setAcademicProgramMarketingStatusService} from "@/modules/sites/site-publication-commands.server";
import {createSiteGoLinkService,listSiteGoLinksPageService,listAvailableGoDestinationsService,inspectSavedGoLinkService,setSiteGoLinkPausedService,revokeSiteGoLinkService} from "@/modules/engagement/site-go-link-management.server";
import {getPartnerWebsitePreviewViewService,previewChurchWebsiteDraftService,saveSiteWebsiteAndBrandService,restoreChurchWebsiteContentService,prepareSchoolWebsiteService} from "@/modules/sites/site-website-commands.server";
import {listSitePreviewSharesService,createSitePreviewShareService,setSitePreviewSharePausedService,revokeSitePreviewShareService} from "@/modules/sites/site-preview-sharing.server";
import {exploreCanonicalBlueprintReferencesService,discoverCanonicalBlueprintOfferingsService,readCanonicalBlueprintWorkspaceService,listCanonicalBlueprintReviewsService,listCanonicalBlueprintReviewEvidenceService} from "@/modules/blueprints/blueprint-catalog-read.server";
import {getStaffLaunchWorkspaceService,getLaunchStudioDraftService,saveLaunchStudioDraftService} from "@/modules/programs/launch-drafts.server";
import {listLaunchOptionsService,getLaunchEntryService} from "@/modules/programs/launch-discovery.server";
export type WorkflowMode="planning"|"canonical"|"can"|"learner";
/** Existing independent native reviewer credentials remain distinct from CAN.
 * No fallback, new role, token or grant is manufactured by this adapter. */
export async function resolveGovernedWorkflow(request:Request,mode:WorkflowMode){
 if(request.method!=="POST"&&request.method!=="GET")throw new AuthorizationError("explicit HTTP method");
 const context=await (mode==="planning"?getBlueprintPlanningContext(request):mode==="canonical"?getCanonicalCommandContext(request):mode==="learner"?getInstructionalLearnerContext(request):getIdentityContext(request));
 if(!context.actorPersonId)throw new AuthorizationError("verified Person");
 return {
  readEngagementCampaignWorkspace:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("Campaign read context");const result=await campaign.readEngagementCampaignWorkspace(request,parseCommandInput(campaignInput.readEngagementCampaignWorkspaceInput,raw));return {...result,campaigns:result.campaigns.map(row=>({...row,scheduled_at:new Date(row.scheduled_at).toISOString(),cancelled_at:row.cancelled_at===null?null:new Date(row.cancelled_at).toISOString()}))};},
  saveCampaignRecipientList:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Campaign command context");const result=await campaign.saveCampaignRecipientList(request,parseCommandInput(campaignInput.saveCampaignRecipientListInput,raw));return result;},
  queueEngagementCampaign:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Campaign command context");const result=await campaign.queueEngagementCampaign(request,parseCommandInput(campaignInput.queueEngagementCampaignInput,raw));return result;},
  cancelEngagementCampaign:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Campaign command context");const result=await campaign.cancelEngagementCampaign(request,parseCommandInput(campaignInput.cancelEngagementCampaignInput,raw));return result;},
  readCampaignListMembers:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("Campaign read context");const result=await campaign.readCampaignListMembers(request,parseCommandInput(campaignInput.readCampaignListMembersInput,raw));return {...result,members:result.members.map(row=>({...row,consent_at:new Date(row.consent_at).toISOString()}))};},
  updateCampaignListMember:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Campaign command context");const result=await campaign.updateCampaignListMember(request,parseCommandInput(campaignInput.updateCampaignListMemberInput,raw));return result;},
  getStaffLaunchWorkspace:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("Launch workspace context");return getStaffLaunchWorkspaceService(request);},
  getLaunchStudioDraft:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("Launch workspace context");return getLaunchStudioDraftService(request,raw);},
  saveLaunchStudioDraft:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Launch workspace context");return saveLaunchStudioDraftService(request,raw);},
  listLaunchOptions:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("Launch workspace context");const result=await listLaunchOptionsService(request);return {...result,sites:result.sites.map(({id,organizationId,name,slug,timezone,lifecycleStatus,updatedAt,websiteContentSaved,websiteDraft})=>({id,organizationId,name,slug,timezone,lifecycleStatus,updatedAt,websiteContentSaved,websiteDraft}))};},
  getLaunchEntry:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("Launch workspace context");return getLaunchEntryService(request,raw);},
  exploreCanonicalBlueprintReferences:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="planning")throw new AuthorizationError("catalog or reviewer context");return exploreCanonicalBlueprintReferencesService(request,raw);},
  discoverCanonicalBlueprintOfferings:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="planning")throw new AuthorizationError("catalog or reviewer context");return discoverCanonicalBlueprintOfferingsService(request,raw);},
  readCanonicalBlueprintWorkspace:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="planning")throw new AuthorizationError("catalog or reviewer context");return readCanonicalBlueprintWorkspaceService(request,raw);},
  listCanonicalBlueprintReviews:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="canonical")throw new AuthorizationError("catalog or reviewer context");return listCanonicalBlueprintReviewsService(request);},
  listCanonicalBlueprintReviewEvidence:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="canonical")throw new AuthorizationError("catalog or reviewer context");return listCanonicalBlueprintReviewEvidenceService(request,raw);},
  listSitePreviewShares:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("Site preview sharing context");return listSitePreviewSharesService(request,raw);},
  createSitePreviewShare:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Site preview sharing context");return createSitePreviewShareService(request,raw);},
  setSitePreviewSharePaused:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Site preview sharing context");return setSitePreviewSharePausedService(request,raw);},
  revokeSitePreviewShare:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Site preview sharing context");return revokeSitePreviewShareService(request,raw);},
  getPartnerWebsitePreviewView:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("Site website context");const preview=await getPartnerWebsitePreviewViewService(request,raw);return {siteId:preview.siteId,siteConfigurationRevision:preview.siteConfigurationRevision,currentRevision:preview.currentRevision,currentBrandVersionId:preview.currentBrandVersionId,previewHtml:preview.previewHtml,previewPages:preview.previewPages};},
  previewChurchWebsiteDraft:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Site website context");return previewChurchWebsiteDraftService(request,raw);},
  saveSiteWebsiteAndBrand:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Site website context");return saveSiteWebsiteAndBrandService(request,raw);},
  restoreChurchWebsiteContent:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Site website context");return restoreChurchWebsiteContentService(request,raw);},
  prepareSchoolWebsite:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Site website context");return prepareSchoolWebsiteService(request,raw);},
  createSiteGoLink:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Site Go Link context");return createSiteGoLinkService(request,raw);},
  listSiteGoLinksPage:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("Site Go Link context");return listSiteGoLinksPageService(request,raw);},
  listAvailableGoDestinations:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("Site Go Link context");return listAvailableGoDestinationsService(request,raw);},
  inspectSavedGoLink:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("Site Go Link context");return inspectSavedGoLinkService(request,raw);},
  setSiteGoLinkPaused:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Site Go Link context");return setSiteGoLinkPausedService(request,raw);},
  revokeSiteGoLink:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Site Go Link context");return revokeSiteGoLinkService(request,raw);},
  renameSitePublicIdentity:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Site publication context");return renameSitePublicIdentityService(request,raw);},
  reserveSitePublicationAddress:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Site publication context");return reserveSitePublicationAddressService(request,raw);},
  setSitePublicationStatus:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Site publication context");return setSitePublicationStatusService(request,raw);},
  setAcademicProgramMarketingStatus:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Site publication context");return setAcademicProgramMarketingStatusService(request,raw);},
  getLaunchSiteConfiguration:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("Site profile context");return getLaunchSiteConfigurationService(request,raw);},
  updateLaunchSiteAddress:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Site profile context");return updateLaunchSiteAddressService(request,raw);},
  updateLaunchSiteContact:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Site profile context");return updateLaunchSiteContactService(request,raw);},
  updateLaunchSiteIdentity:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Site profile context");return updateLaunchSiteIdentityService(request,raw);},
  updateLaunchSiteInformation:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Site profile context");return updateLaunchSiteInformationService(request,raw);},
  readSiteBrandHttp:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("Site Brand and publication context");return readSiteBrandHttp(request,raw);},
  saveSiteBrandHttp:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Site Brand and publication context");return saveSiteBrandHttp(request,raw);},
  revokeSiteBrandAssetHttp:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Site Brand and publication context");return revokeSiteBrandAssetHttp(request,raw);},
  readLaunchSitePublication:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("Site Brand and publication context");return readLaunchSitePublicationService(request,raw);},
  reviewLaunchSiteWebsiteCopy:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Site Brand and publication context");return reviewLaunchSiteWebsiteCopyService(request,raw);},
  readSiteInformationV61:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("Site planning context");return readSiteInformationV61Service(request,raw);},
  saveSiteInformationV61:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Site planning context");return saveSiteInformationV61Service(request,raw);},
  readExistingSiteProgramsV61:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("Site planning context");return readExistingSiteProgramsV61Service(request,raw);},
  readSiteProgramsAudiencesV61:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("Site planning context");return readSiteProgramsAudiencesV61Service(request,raw);},
  saveSiteProgramsAudiencesV61:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Site planning context");return saveSiteProgramsAudiencesV61Service(request,raw);},
  startLaunch:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("launch command context");return startLaunchService(request,raw);},
  completeLaunchRequirement:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("launch command context");return completeLaunchRequirementService(request,raw);},
  submitLaunchEvidence:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("launch command context");return submitLaunchEvidenceService(request,raw);},
  reviewLaunchEvidence:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("launch command context");return reviewLaunchEvidenceService(request,raw);},
  activateLaunch:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("launch command context");return activateLaunchService(request,raw);},
  scheduleLaunchOrientation:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("launch command context");return scheduleLaunchOrientationService(request,raw);},
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
