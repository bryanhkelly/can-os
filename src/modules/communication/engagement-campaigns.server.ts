// Legacy TanStack adapter only. Business authority lives in the shared service.
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import * as service from "./engagement-campaigns-service.server";
export function readEngagementCampaignWorkspace(data:Parameters<typeof service.readEngagementCampaignWorkspace>[1]){
 setResponseHeader("Cache-Control","private, no-store");
 return service.readEngagementCampaignWorkspace(getRequest(),data);
}
export function saveCampaignRecipientList(data:Parameters<typeof service.saveCampaignRecipientList>[1]){
 setResponseHeader("Cache-Control","private, no-store");
 return service.saveCampaignRecipientList(getRequest(),data);
}
export function queueEngagementCampaign(data:Parameters<typeof service.queueEngagementCampaign>[1]){
 setResponseHeader("Cache-Control","private, no-store");
 return service.queueEngagementCampaign(getRequest(),data);
}
export function cancelEngagementCampaign(data:Parameters<typeof service.cancelEngagementCampaign>[1]){
 setResponseHeader("Cache-Control","private, no-store");
 return service.cancelEngagementCampaign(getRequest(),data);
}
export function readCampaignListMembers(data:Parameters<typeof service.readCampaignListMembers>[1]){
 setResponseHeader("Cache-Control","private, no-store");
 return service.readCampaignListMembers(getRequest(),data);
}
export function updateCampaignListMember(data:Parameters<typeof service.updateCampaignListMember>[1]){
 setResponseHeader("Cache-Control","private, no-store");
 return service.updateCampaignListMember(getRequest(),data);
}
