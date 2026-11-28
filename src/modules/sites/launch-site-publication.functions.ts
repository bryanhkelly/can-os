import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {readLaunchSitePublicationInput,readLaunchSitePublicationService,reviewLaunchSiteWebsiteCopyInput,reviewLaunchSiteWebsiteCopyService} from "./launch-site-publication.server";
export const readLaunchSitePublication=createServerFn({method:"GET"}).validator((raw:unknown)=>readLaunchSitePublicationInput.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");return readLaunchSitePublicationService(getRequest(),data);
});
export const reviewLaunchSiteWebsiteCopy=createServerFn({method:"POST"}).validator((raw:unknown)=>reviewLaunchSiteWebsiteCopyInput.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");return reviewLaunchSiteWebsiteCopyService(getRequest(),data);
});
