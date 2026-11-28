// Legacy TanStack adapter only. Business authority lives in the shared service.
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import * as service from "./engagement-registry-service.server";
export {authorizeEngagementOwner,authorizeEngagementDistribution,readAuthorizedEngagementInvitation} from "./engagement-registry-service.server";
export function createEngagementDefinition(data:Parameters<typeof service.createEngagementDefinition>[1]){
 setResponseHeader("Cache-Control","private, no-store");
 return service.createEngagementDefinition(getRequest(),data);
}
export function createEngagementGoLink(data:Parameters<typeof service.createEngagementGoLink>[1]){
 setResponseHeader("Cache-Control","private, no-store");
 return service.createEngagementGoLink(getRequest(),data);
}
export function listEngagementGoLinks(data:Parameters<typeof service.listEngagementGoLinks>[1]){
 setResponseHeader("Cache-Control","private, no-store");
 return service.listEngagementGoLinks(getRequest(),data);
}
export function retireEngagementDefinition(data:Parameters<typeof service.retireEngagementDefinition>[1]){
 setResponseHeader("Cache-Control","private, no-store");
 return service.retireEngagementDefinition(getRequest(),data);
}
export function revokeEngagementGoLink(data:Parameters<typeof service.revokeEngagementGoLink>[1]){
 setResponseHeader("Cache-Control","private, no-store");
 return service.revokeEngagementGoLink(getRequest(),data);
}
export function listSiteEngagementDefinitions(data:Parameters<typeof service.listSiteEngagementDefinitions>[1]){
 setResponseHeader("Cache-Control","private, no-store");
 return service.listSiteEngagementDefinitions(getRequest(),data);
}
export function prepareEngagementEmailDraft(data:Parameters<typeof service.prepareEngagementEmailDraft>[1]){
 setResponseHeader("Cache-Control","private, no-store");
 return service.prepareEngagementEmailDraft(getRequest(),data);
}
export function listOwnerEngagementDestinations(data:Parameters<typeof service.listOwnerEngagementDestinations>[1]){
 setResponseHeader("Cache-Control","private, no-store");
 return service.listOwnerEngagementDestinations(getRequest(),data);
}
export function listOwnerEngagementDefinitions(data:Parameters<typeof service.listOwnerEngagementDefinitions>[1]){
 setResponseHeader("Cache-Control","private, no-store");
 return service.listOwnerEngagementDefinitions(getRequest(),data);
}
