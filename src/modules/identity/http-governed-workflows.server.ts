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
export type WorkflowMode="planning"|"canonical"|"can"|"learner";
/** Existing independent native reviewer credentials remain distinct from CAN.
 * No fallback, new role, token or grant is manufactured by this adapter. */
export async function resolveGovernedWorkflow(request:Request,mode:WorkflowMode){
 if(request.method!=="POST"&&request.method!=="GET")throw new AuthorizationError("explicit HTTP method");
 const context=await (mode==="planning"?getBlueprintPlanningContext(request):mode==="canonical"?getCanonicalCommandContext(request):mode==="learner"?getInstructionalLearnerContext(request):getIdentityContext(request));
 if(!context.actorPersonId)throw new AuthorizationError("verified Person");
 return {
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
