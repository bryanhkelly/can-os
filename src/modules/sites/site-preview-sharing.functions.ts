import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {listSitePreviewSharesInput,listSitePreviewSharesService,createSitePreviewShareInput,createSitePreviewShareService,setSitePreviewSharePausedInput,setSitePreviewSharePausedService,revokeSitePreviewShareInput,revokeSitePreviewShareService} from "./site-preview-sharing.server";
export const listSitePreviewShares=createServerFn({method:"GET"}).validator((raw:unknown)=>listSitePreviewSharesInput.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return listSitePreviewSharesService(getRequest(),data);
});
export const createSitePreviewShare=createServerFn({method:"POST"}).validator((raw:unknown)=>createSitePreviewShareInput.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return createSitePreviewShareService(getRequest(),data);
});
export const setSitePreviewSharePaused=createServerFn({method:"POST"}).validator((raw:unknown)=>setSitePreviewSharePausedInput.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return setSitePreviewSharePausedService(getRequest(),data);
});
export const revokeSitePreviewShare=createServerFn({method:"POST"}).validator((raw:unknown)=>revokeSitePreviewShareInput.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return revokeSitePreviewShareService(getRequest(),data);
});
