// WS03 owns the Site and Launch Studio HTTP adapters. The caller still establishes
// a verified Person before composing this registry; each domain service enforces exact scope.
import {AuthorizationError} from "@/domain/command-context";
import {getIdentityContext} from "@/modules/identity/command-context.server";
import {readAuthorizedSiteGeography} from "@/modules/geography/site-geography-read.server";
import {z} from "zod";
import {parseCommandInput} from "@/domain/command-input";
import {startLaunchService,completeLaunchRequirementService,submitLaunchEvidenceService,reviewLaunchEvidenceService,activateLaunchService,scheduleLaunchOrientationService} from "@/modules/programs/launch-commands.server";
import {readSiteInformationV61Service,saveSiteInformationV61Service} from "@/modules/programs/site-information-v61.server";
import {readExistingSiteProgramsV61Service,readSiteProgramsAudiencesV61Service,saveSiteProgramsAudiencesV61Service} from "@/modules/programs/site-programs-audiences-v61.server";
import {readSiteBrandHttp,saveSiteBrandHttp,revokeSiteBrandAssetHttp} from "@/modules/sites/site-brand-http.server";
import {readLaunchSitePublicationService,reviewLaunchSiteWebsiteCopyService} from "@/modules/sites/launch-site-publication.server";
import {updateLaunchSiteAddressService,updateLaunchSiteContactService,updateLaunchSiteInformationService,updateLaunchSiteIdentityService,getLaunchSiteConfigurationService} from "@/modules/programs/site-configuration.server";
import {renameSitePublicIdentityService,reserveSitePublicationAddressService,setSitePublicationStatusService,setAcademicProgramMarketingStatusService} from "@/modules/sites/site-publication-commands.server";
import {getPartnerWebsitePreviewViewService,previewChurchWebsiteDraftService,saveSiteWebsiteAndBrandService,restoreChurchWebsiteContentService,prepareSchoolWebsiteService} from "@/modules/sites/site-website-commands.server";
import {listSitePreviewSharesService,createSitePreviewShareService,setSitePreviewSharePausedService,revokeSitePreviewShareService} from "@/modules/sites/site-preview-sharing.server";
import {getStaffLaunchWorkspaceService,getLaunchStudioDraftService,saveLaunchStudioDraftService} from "@/modules/programs/launch-drafts.server";
import {listLaunchOptionsService,getLaunchEntryService} from "@/modules/programs/launch-discovery.server";

import {listMySitesService} from "@/modules/operations/site-directory.server";
import {getNetworkSitesService,createNetworkSiteService,createSiteInput} from "@/modules/networks/network-sites.server";
import {readLaunchSiteFacilitiesV61Service,createLaunchSiteSpaceV61Service,saveLaunchSiteSpaceV61Service} from "@/modules/operations/launch-site-facilities.server";
import {readLaunchClassFacilitiesV61Service,saveLaunchClassPhysicalPlanV61Service} from "@/modules/classes/launch-class-facilities.server";
import {readAuthorizedSiteContentChannels,saveAuthorizedSiteContentChannels,publishAuthorizedSiteContentChannels} from "@/modules/sites/site-content-channels.server";
import {siteContentBlockSchema} from "@/domain/site-content-channels";
const channelsScope=z.object({siteId:z.string().uuid()}).strict();
const channelPublication=channelsScope.extend({expectedRevision:z.number().int().min(0).max(2147483647)});
const channelSave=channelPublication.extend({blocks:z.array(siteContentBlockSchema).max(12).refine(xs=>new Set(xs.map(x=>x.id)).size===xs.length)});
import {getCommandContext} from "@/modules/identity/command-context.server";
import {siteMediaUploadSchema,siteMediaReviewSchema,siteMediaRevokeSchema} from "@/domain/site-media-folder";
import {beginSiteMediaFolderUpload,finishSiteMediaFolderUpload,listSiteMediaFolder,reviewSiteMediaFolder,revokeSiteMediaFolder,siteMediaKeyPattern} from "@/modules/sites/site-media-folder.server";
const mediaFinish=siteMediaUploadSchema.extend({key:z.string().regex(siteMediaKeyPattern)});
import {readSiteIntelligenceContentService,previewSiteIntelligenceService,processSiteIntelligenceService} from "@/modules/sites/site-content-generation-http.server";
const geographyInput=z.object({siteId:z.string().uuid()}).strict();
export function organizationLaunchWorkflows(request:Request,mode:string){
 return {
  readSiteIntelligenceContent:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("Site Intelligence context");return readSiteIntelligenceContentService(request,raw);},
  previewSiteIntelligence:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Site Intelligence context");return previewSiteIntelligenceService(request,raw);},
  processSiteIntelligence:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Site Intelligence context");return processSiteIntelligenceService(request,raw);},
  beginSchoolSiteMediaUpload:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Site media context");const data=parseCommandInput(siteMediaUploadSchema,raw);return beginSiteMediaFolderUpload(await getCommandContext(request),data);},
  finishSchoolSiteMediaUpload:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Site media context");const data=parseCommandInput(mediaFinish,raw);return finishSiteMediaFolderUpload(await getCommandContext(request),data);},
  listSchoolSiteMedia:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("Site media context");const data=parseCommandInput(geographyInput,raw);return listSiteMediaFolder(await getCommandContext(request),data.siteId);},
  approveSchoolSiteMediaFolder:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Site media context");const data=parseCommandInput(siteMediaReviewSchema,raw);return reviewSiteMediaFolder(await getCommandContext(request),data);},
  revokeSchoolSiteMediaFolder:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Site media context");const data=parseCommandInput(siteMediaRevokeSchema,raw);return revokeSiteMediaFolder(await getCommandContext(request),data);},
  getSiteContentChannels:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("Content channels context");return readAuthorizedSiteContentChannels(request,parseCommandInput(channelsScope,raw).siteId);},
  saveSiteContentChannels:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Content channels context");return saveAuthorizedSiteContentChannels(request,parseCommandInput(channelSave,raw));},
  publishSiteContentChannels:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Content channels context");return publishAuthorizedSiteContentChannels(request,parseCommandInput(channelPublication,raw));},
  readLaunchSiteFacilitiesV61:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("Launch facilities context");return readLaunchSiteFacilitiesV61Service(request,raw);},
  createLaunchSiteSpaceV61:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Launch facilities context");return createLaunchSiteSpaceV61Service(request,raw);},
  saveLaunchSiteSpaceV61:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Launch facilities context");return saveLaunchSiteSpaceV61Service(request,raw);},
  readLaunchClassFacilitiesV61:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="canonical")throw new AuthorizationError("Launch facilities context");return readLaunchClassFacilitiesV61Service(request,raw);},
  saveLaunchClassPhysicalPlanV61:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="canonical")throw new AuthorizationError("Launch facilities context");return saveLaunchClassPhysicalPlanV61Service(request,raw);},
  listMySites:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("Site directory context");parseCommandInput(z.object({}).strict(),raw);return listMySitesService(request);},
  getNetworkSites:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("Network Site context");parseCommandInput(z.object({}).strict(),raw);return getNetworkSitesService(request);},
  createNetworkSite:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Network Site context");return createNetworkSiteService(request,parseCommandInput(createSiteInput,raw));},
  getStaffLaunchWorkspace:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("Launch workspace context");return getStaffLaunchWorkspaceService(request);},
  getLaunchStudioDraft:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("Launch workspace context");return getLaunchStudioDraftService(request,raw);},
  saveLaunchStudioDraft:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Launch workspace context");return saveLaunchStudioDraftService(request,raw);},
  listLaunchOptions:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("Launch workspace context");const result=await listLaunchOptionsService(request);return {...result,sites:result.sites.map(({id,organizationId,name,slug,timezone,lifecycleStatus,updatedAt,websiteContentSaved,websiteDraft})=>({id,organizationId,name,slug,timezone,lifecycleStatus,updatedAt,websiteContentSaved,websiteDraft}))};},
  getLaunchEntry:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("Launch workspace context");return getLaunchEntryService(request,raw);},
  listSitePreviewShares:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("Site preview sharing context");return listSitePreviewSharesService(request,raw);},
  createSitePreviewShare:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Site preview sharing context");return createSitePreviewShareService(request,raw);},
  setSitePreviewSharePaused:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Site preview sharing context");return setSitePreviewSharePausedService(request,raw);},
  revokeSitePreviewShare:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Site preview sharing context");return revokeSitePreviewShareService(request,raw);},
  getPartnerWebsitePreviewView:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("Site website context");const preview=await getPartnerWebsitePreviewViewService(request,raw);return {siteId:preview.siteId,siteConfigurationRevision:preview.siteConfigurationRevision,currentRevision:preview.currentRevision,currentBrandVersionId:preview.currentBrandVersionId,previewHtml:preview.previewHtml,previewPages:preview.previewPages};},
  previewChurchWebsiteDraft:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Site website context");return previewChurchWebsiteDraftService(request,raw);},
  saveSiteWebsiteAndBrand:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Site website context");return saveSiteWebsiteAndBrandService(request,raw);},
  restoreChurchWebsiteContent:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Site website context");return restoreChurchWebsiteContentService(request,raw);},
  prepareSchoolWebsite:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Site website context");return prepareSchoolWebsiteService(request,raw);},
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
  readSiteGeography:async(raw:unknown)=>{
   if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("Site geography context");
   const {siteId}=parseCommandInput(geographyInput,raw);
   const result=await readAuthorizedSiteGeography(await getIdentityContext(request),siteId);
   const version=result.version;
   // Return source facts, not inferred regulatory or organizational authority.
   return {siteId,status:result.status,market:result.market,areas:result.areas,
    version:version?{id:version.id,marketStatus:version.market_status,source:version.source,benchmark:version.benchmark,vintage:version.vintage,resolvedAt:new Date(version.resolved_at).toISOString()}:null};
  },
 };
}
