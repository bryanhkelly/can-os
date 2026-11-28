import * as artifacts from "@/modules/programs/site-marketing-artifacts.server";
import * as marketing from "@/modules/programs/site-marketing-packages-v61.server";
import * as engagement from "@/modules/engagement/engagement-registry-service.server";
import * as engagementInput from "@/modules/engagement/engagement-registry.inputs";
import * as sender from "@/modules/communication/sender-registry-service.server";
import * as senderInput from "@/modules/communication/sender-registry.inputs";
import * as campaign from "@/modules/communication/engagement-campaigns-service.server";
import * as campaignInput from "@/modules/communication/engagement-campaigns.inputs";
import {createSiteGoLinkService,listSiteGoLinksPageService,listAvailableGoDestinationsService,inspectSavedGoLinkService,setSiteGoLinkPausedService,revokeSiteGoLinkService} from "@/modules/engagement/site-go-link-management.server";
import {AuthorizationError} from "@/domain/command-context";
import {parseCommandInput} from "@/domain/command-input";
import type {WorkflowMode} from "@/modules/identity/http-governed-workflows.server";

/** Request-bound domain adapters; the shared resolver verifies the actor first. */
export function createEngagementHttpWorkflows(request:Request,mode:WorkflowMode){
 return {
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
  createSiteGoLink:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Site Go Link context");return createSiteGoLinkService(request,raw);},
  listSiteGoLinksPage:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("Site Go Link context");return listSiteGoLinksPageService(request,raw);},
  listAvailableGoDestinations:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("Site Go Link context");return listAvailableGoDestinationsService(request,raw);},
  inspectSavedGoLink:async(raw:unknown)=>{if(request.method!=="GET"||mode!=="can")throw new AuthorizationError("Site Go Link context");return inspectSavedGoLinkService(request,raw);},
  setSiteGoLinkPaused:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Site Go Link context");return setSiteGoLinkPausedService(request,raw);},
  revokeSiteGoLink:async(raw:unknown)=>{if(request.method!=="POST"||mode!=="can")throw new AuthorizationError("Site Go Link context");return revokeSiteGoLinkService(request,raw);},
 };
}
