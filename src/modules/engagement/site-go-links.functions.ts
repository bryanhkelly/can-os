import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {createSchema,createSiteGoLinkService,packageScope,listSiteGoLinksService,revokeSchema,revokeSiteGoLinkService,choicesSchema,listAvailableGoDestinationsService,inspectSavedGoLinkService,manageSchema,setSiteGoLinkPausedService,pageSchema,listSiteGoLinksPageService} from "./site-go-link-management.server";
export const createSiteGoLink=createServerFn({method:"POST"}).validator((raw:unknown)=>createSchema.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return createSiteGoLinkService(getRequest(),data);
});
export const listSiteGoLinks=createServerFn({method:"GET"}).validator((raw:unknown)=>packageScope.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return listSiteGoLinksService(getRequest(),data);
});
export const revokeSiteGoLink=createServerFn({method:"POST"}).validator((raw:unknown)=>revokeSchema.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return revokeSiteGoLinkService(getRequest(),data);
});
export const listAvailableGoDestinations=createServerFn({method:"GET"}).validator((raw:unknown)=>choicesSchema.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return listAvailableGoDestinationsService(getRequest(),data);
});
export const inspectSavedGoLink=createServerFn({method:"GET"}).validator((raw:unknown)=>revokeSchema.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return inspectSavedGoLinkService(getRequest(),data);
});
export const setSiteGoLinkPaused=createServerFn({method:"POST"}).validator((raw:unknown)=>manageSchema.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return setSiteGoLinkPausedService(getRequest(),data);
});
export const listSiteGoLinksPage=createServerFn({method:"GET"}).validator((raw:unknown)=>pageSchema.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return listSiteGoLinksPageService(getRequest(),data);
});
