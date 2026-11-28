import { createRequire } from 'node:module';
import { Injectable, ServiceUnavailableException, UnauthorizedException, ForbiddenException, BadRequestException, ConflictException, UnsupportedMediaTypeException } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
export type Identity = {readReleaseContent:(input:unknown)=>Promise<unknown>;readSession:()=>Promise<unknown>;readReleaseOverview:(input:unknown)=>Promise<unknown>;readReleasePolicy:(input:unknown)=>Promise<unknown>;readReleaseQueue:(input:unknown)=>Promise<unknown>;createSite:(input:unknown)=>Promise<unknown>;submitRelease:(input:unknown)=>Promise<unknown>;saveReleasePolicy:(input:unknown)=>Promise<unknown>;decideRelease:(input:unknown)=>Promise<unknown>;publishCourses:(input:unknown)=>Promise<unknown>;approveAssetManifest:(input:unknown)=>Promise<unknown>;publishOffering:(input:unknown)=>Promise<unknown>;me:unknown;readStudentClasses:()=>Promise<unknown>;readLearningResume:(id:string)=>Promise<unknown>;readHomeworkSummary:(id:string)=>Promise<unknown>;selectMembership:(id:string)=>Promise<void>;recordActivity:()=>Promise<void>;completeLesson:(id:string,lessonId:string)=>Promise<unknown>;submitHomework:(id:string,assignmentId:string,responseText:string)=>Promise<unknown>};
type AuthHandler='handleAccessRequest'|'handleAccessVerification'|'handlePersonalRegistration'|'handleSiteSignupRequest'|'handleAccessLogout';
export type WorkflowMode='planning'|'canonical'|'can'|'learner'|'operator-reporting';
export type Workflow=Record<'getAdmissionOfferOptions'|'issueAdmissionOffer'|'respondToAdmissionOffer'|'activateOfferedEnrollment'|'withdrawIssuedAdmissionOffer'|'withdrawMyNativeClassEnrollment'|'cancelNativeClassEnrollment'|'joinNoncreditWaitlist'|'cancelMyNoncreditWaitlist'|'getMyNoncreditWaitlistPage'|'withdrawMyNoncreditRegistration'|'decideNoncreditCompletion'|'getNoncreditCompletionPolicyCatalog'|'publishNoncreditCompletionPolicy'|'getNoncreditCompletionReview'|'getNoncreditCompletionQueue'|'correctNoncreditCompletion'|'getNoncreditEnrollmentPublisher'|'getNoncreditTrainingReadiness'|'publishNoncreditSelfEnrollment'|'closeNoncreditSelfEnrollment'|'publishNoncreditAcrossAuthorizedSites'|'getNoncreditKnowledgeCheck'|'beginNoncreditKnowledgeCheckAttempt'|'saveNoncreditKnowledgeCheckAnswer'|'submitNoncreditKnowledgeCheckAnswers'|'finalizeNoncreditKnowledgeCheckResult'|'provisionNoncreditKnowledgeCheckAccess'|'getNoncreditCompletionReadiness'|'getNoncreditPilotOutcomes'|'getNoncreditOperatorNetworkSummary'|'getFacilitatedImpactReport'|'getNativeClassSurveyCampaignOptions'|'linkNativeClassSurveyCampaign'|'getClassroomSurveyOptions'|'attachClassroomSurvey'|'getClassroomLearnerSurveys'|'readCanonicalSurveyDraftAccess'|'createCanonicalSurveyDraft'|'readCanonicalSurveyReviewQueue'|'readCanonicalSurveyPublicationQueue'|'recordCanonicalSurveyReview'|'publishCanonicalSurveyVersion'|'listNoncreditCourseSurveys'|'getCourseSurvey'|'submitCourseSurvey'|'previewSiteMarketingArtifact'|'createSiteMarketingPackageRelease'|'listSiteMarketingPackageReleases'|'listSiteMarketingReleases'|'getSiteMarketingReleaseOutput'|'withdrawSiteMarketingRelease'|'readSiteMarketingSuggestionsV61'|'listSiteMarketingPackagesPageV61'|'createSiteMarketingPackageV61'|'saveSiteMarketingPackageV61'|'duplicateSiteMarketingPackageV61'|'archiveSiteMarketingPackageV61'|'selectSiteMarketingPackageBrandV61'|'deleteSiteMarketingPackageV61'|'createEngagementDefinition'|'createEngagementGoLink'|'listEngagementGoLinks'|'retireEngagementDefinition'|'revokeEngagementGoLink'|'listSiteEngagementDefinitions'|'prepareEngagementEmailDraft'|'listOwnerEngagementDestinations'|'listOwnerEngagementDefinitions'|'readSenderAdministration'|'listSenderOrganizationsPage'|'changeSenderAdministration'|'revokeSenderAdministration'|'readEngagementCampaignWorkspace'|'saveCampaignRecipientList'|'queueEngagementCampaign'|'cancelEngagementCampaign'|'readCampaignListMembers'|'updateCampaignListMember'|'getStaffLaunchWorkspace'|'getLaunchStudioDraft'|'saveLaunchStudioDraft'|'listLaunchOptions'|'getLaunchEntry'|'exploreCanonicalBlueprintReferences'|'discoverCanonicalBlueprintOfferings'|'readCanonicalBlueprintWorkspace'|'listCanonicalBlueprintReviews'|'listCanonicalBlueprintReviewEvidence'|'listSitePreviewShares'|'createSitePreviewShare'|'setSitePreviewSharePaused'|'revokeSitePreviewShare'|'getPartnerWebsitePreviewView'|'previewChurchWebsiteDraft'|'saveSiteWebsiteAndBrand'|'restoreChurchWebsiteContent'|'prepareSchoolWebsite'|'createSiteGoLink'|'listSiteGoLinksPage'|'listAvailableGoDestinations'|'inspectSavedGoLink'|'setSiteGoLinkPaused'|'revokeSiteGoLink'|'renameSitePublicIdentity'|'reserveSitePublicationAddress'|'setSitePublicationStatus'|'setAcademicProgramMarketingStatus'|'getLaunchSiteConfiguration'|'updateLaunchSiteAddress'|'updateLaunchSiteContact'|'updateLaunchSiteIdentity'|'updateLaunchSiteInformation'|'readSiteBrandHttp'|'saveSiteBrandHttp'|'revokeSiteBrandAssetHttp'|'readLaunchSitePublication'|'reviewLaunchSiteWebsiteCopy'|'readSiteInformationV61'|'saveSiteInformationV61'|'readExistingSiteProgramsV61'|'readSiteProgramsAudiencesV61'|'saveSiteProgramsAudiencesV61'|'startLaunch'|'completeLaunchRequirement'|'submitLaunchEvidence'|'reviewLaunchEvidence'|'activateLaunch'|'scheduleLaunchOrientation'|'getMyNativeTeachingClasses'|'getNativeTeacherToday'|'getNativeClassTeacherHomework'|'getNativeClassTeacherMissingWork'|'getNativeClassTeacherOpenFollowUps'|'createNativeClassMissingWorkFollowUp'|'getNativeClassTeacherHomeworkHistory'|'returnNativeClassPracticeFeedback'|'getNativeClassTeacherAssessments'|'getNativeClassTeacherHistoricalWork'|'getMyNativeGuardianLearners'|'getMyNativeGuardianClassApprovals'|'getMyNativeGuardianClassEnrollments'|'getGuardianCommunitySummary'|'requestNativeGuardianClassApproval'|'acceptNativeGuardianClassApproval'|'withdrawMyGuardianNativeClassEnrollment'|'getNativeClassReport'|'requestReportingRelationship'|'decideRelationshipRequest'|'getRelationshipPortfolio'|'readCanonicalBlueprintHome'|'getNativeOfferingAdoptionReviewQueue'|'createUnifiedClassDraft'|'activateUnifiedClass'|'getMyUnifiedClassDrafts'|'publishUnifiedClassOffering'|'closeUnifiedClassOffering'|'createNextUnifiedClassOfferingVersion'|'getNativeClassOperatorSites'|'getUnifiedClassCourseOptions'|'getFacilitatedRoomMedia'|'getFacilitatedRoomMediaAccess'|'getLearnerFacilitatedRoom'|'getNativeClassSessionAgenda'|'resumeLinkedNativeClassLearner'|'activateReviewedNativeClassLearner'|'pairWithFacilitatedRoom'|'leaveFacilitatedRoom'|'renewFacilitatedLearningPairing'|'endFacilitatedLearningRoom'|'recordFacilitatedPlayback'|'attestClassroomParticipation'|'issueClassroomProjectorCommand'|'releaseClassroomActivity'|'closeClassroomActivity'|'submitClassroomResponse'|'recordClassroomPresence'|'getClassroomConnectCourseChoices'|'getClassroomAttendanceRoster'|'getClassroomProjectorCommand'|'getClassroomLearnerActivities'|'getClassroomPresentationState'|'scheduleNativeClassSessions'|'changeNativeClassSessionSchedule'|'openNativeClassSession'|'revokeNativeClassSession'|'transferNativeClassroomControl'|'publishNativeClassSessionAgenda'|'registerNoncredit'|'enrollNativeClass'|'readCanonicalBlueprintConfiguration'|'readCanonicalBlueprintReview'|'readCanonicalBlueprintReviewHistory'|'createCanonicalBlueprintConfiguration'|'saveCanonicalBlueprintConfiguration'|'submitCanonicalBlueprintConfiguration'|'decideCanonicalBlueprintReview'|'executeCanonicalBlueprintConfiguration'|'recordNativeDeploymentReadiness'|'placeNativeDeploymentSite'|'approveNativeOfferingAdoption',(input:unknown)=>Promise<unknown>>;
type Bridge = Record<AuthHandler,(request:Request)=>Promise<Response>> & {resolveGovernedWorkflow:(request:Request,mode:WorkflowMode)=>Promise<Workflow>;resolveHttpIdentity:(request:Request)=>Promise<Identity>;classifyHttpDomainError:(error:unknown)=>string};

/** Only explicit verified local runtime configuration can enable this adapter. */
@Injectable()
export class CanonicalIdentityService {
  private bridge?: Bridge;
  private enabled = false;
  private writeOrigin:string|null=null;
  configure(enabled:boolean,writeOrigin:string|null=null) { this.enabled=enabled;this.writeOrigin=enabled?writeOrigin:null; }
  private load(): Bridge {
    if (!this.enabled) throw new ServiceUnavailableException();
    if (!this.bridge) {
      try { this.bridge = createRequire(__filename)('./canonical.cjs') as Bridge; }
      catch { throw new ServiceUnavailableException(); }
    }
    return this.bridge;
  }

  assertWriteRequest(request:FastifyRequest):void {

      if(request.method!=='POST')throw new ForbiddenException();
      if(!this.writeOrigin)throw new ServiceUnavailableException();
      if(request.headers.origin!==this.writeOrigin)throw new ForbiddenException();
      if(request.headers['sec-fetch-site']==='cross-site')throw new ForbiddenException();
      const contentType=request.headers['content-type'];
      if(typeof contentType!=='string'||contentType.split(';')[0]?.trim().toLowerCase()!=='application/json')
        throw new UnsupportedMediaTypeException();
  }
  /** Explicit fixed operation selected by the controller, never by the caller. */
  async executeAccess(handler:AuthHandler,request:FastifyRequest,body:unknown):Promise<Response>{
    this.assertWriteRequest(request);
    const bridge=this.load();
    const headers=new Headers({'content-type':'application/json','origin':this.writeOrigin!});
    if(typeof request.headers.cookie==='string')headers.set('cookie',request.headers.cookie);
    if(typeof request.headers['user-agent']==='string')headers.set('user-agent',request.headers['user-agent']);
    return bridge[handler](new Request(this.writeOrigin!+'/api/v1/access',{method:'POST',headers,body:JSON.stringify(body)}));
  }
  async authenticateWorkflow(request:FastifyRequest,mode:WorkflowMode,method:'GET'|'POST'='POST'):Promise<Workflow>{
    if(request.method!==method)throw new ForbiddenException();
    if(method==='POST')this.assertWriteRequest(request);
    const cookie=request.headers.cookie;
    if(typeof cookie!=='string'||!cookie)throw new UnauthorizedException();
    const bridge=this.load();
    try{return await bridge.resolveGovernedWorkflow(new Request((method==='POST'?this.writeOrigin!:'http://127.0.0.1')+'/api/v1/workflow',{method,headers:{cookie,...(method==='POST'?{origin:this.writeOrigin!}:{})}}),mode);}
    catch(error){throw this.translate(bridge,error);}
  }
  async runWorkflow<T>(work:()=>Promise<T>):Promise<T>{
    const bridge=this.load();
    try{return await work();}
    catch(error){if(error instanceof z.ZodError)throw error;throw this.translate(bridge,error);}
  }
  async authenticate(request: FastifyRequest, mode:'read'|'write'='read'): Promise<Identity> {
    // No caller-supplied role, account, grant or forwarding headers.
    if(mode==='read' && request.method!=='GET')throw new ForbiddenException();
    if(mode==='write')this.assertWriteRequest(request);
    const cookie = request.headers.cookie;
    if (typeof cookie !== 'string' || !cookie) throw new UnauthorizedException();
    const bridge = this.load();
    let identity: Identity;
    try { identity = await bridge.resolveHttpIdentity(new Request((mode==='write'?this.writeOrigin!:'http://127.0.0.1')+'/api/v1/identity', {method:request.method,headers:{cookie,...(mode==='write'?{origin:this.writeOrigin!}:{})}})); }
    catch(error) {
      // Failure to establish a GET session is authentication failure; business
      // authorization denials after successful authentication stay 403.
      // Preserve existing write-mode delegation denials rather than treating
      // them as expired credentials.
      if(mode==='read'&&bridge.classifyHttpDomainError(error)==='authorization')throw new UnauthorizedException();
      throw this.translate(bridge,error);
    }
    return identity;
  }
  async run<T>(identity: Identity, work: (identity: Identity)=>Promise<T>): Promise<T> {
    const bridge = this.load();
    // Output validation failures are internal defects, not caller validation errors.
    try { return await work(identity); }
    catch(error) {
      if (error instanceof ForbiddenException || error instanceof z.ZodError) throw error;
      throw this.translate(bridge,error);
    }
  }
  private translate(bridge:Bridge,error:unknown):Error {
    switch(bridge.classifyHttpDomainError(error)){
      case 'authentication': return new UnauthorizedException();
      case 'authorization': return new ForbiddenException();
      case 'validation': return new BadRequestException();
      case 'conflict': return new ConflictException();
      case 'unavailable': return new ServiceUnavailableException();
      default: return new Error('Unexpected domain failure');
    }
  }
}

