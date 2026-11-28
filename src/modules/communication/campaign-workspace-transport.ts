import type {CampaignTransport} from "@/domain/campaign-workspace-api";
import {prepareEngagementEmailDraft} from "@/modules/engagement/engagement-registry.functions";
import {readEngagementCampaignWorkspace,saveCampaignRecipientList,queueEngagementCampaign,cancelEngagementCampaign,readCampaignListMembers,updateCampaignListMember} from "./engagement-campaigns.functions";
/** Explicit existing transport; selection occurs before a workspace mounts, never after an error. */
export const legacyCampaignTransport:CampaignTransport={kind:"legacy",api:{
 prepareEngagementEmailDraft,readEngagementCampaignWorkspace,saveCampaignRecipientList,queueEngagementCampaign,
 cancelEngagementCampaign,readCampaignListMembers,updateCampaignListMember,
}};
