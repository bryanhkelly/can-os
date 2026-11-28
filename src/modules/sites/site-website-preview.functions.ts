import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {getPartnerWebsitePreviewViewInput,getPartnerWebsitePreviewViewService,previewChurchWebsiteDraftInput,previewChurchWebsiteDraftService,saveSiteWebsiteAndBrandInput,saveSiteWebsiteAndBrandService,restoreChurchWebsiteContentInput,restoreChurchWebsiteContentService,prepareSchoolWebsiteInput,prepareSchoolWebsiteService} from "./site-website-commands.server";
export const getPartnerWebsitePreviewView=createServerFn({method:"GET"}).validator((value:unknown)=>getPartnerWebsitePreviewViewInput.parse(value??{})).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return getPartnerWebsitePreviewViewService(getRequest(),data);
});
export const previewChurchWebsiteDraft=createServerFn({method:"POST"}).validator((value:unknown)=>previewChurchWebsiteDraftInput.parse(value)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return previewChurchWebsiteDraftService(getRequest(),data);
});
export const saveSiteWebsiteAndBrand=createServerFn({method:"POST"}).validator((value:unknown)=>saveSiteWebsiteAndBrandInput.parse(value)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return saveSiteWebsiteAndBrandService(getRequest(),data);
});
export const restoreChurchWebsiteContent=createServerFn({method:"POST"}).validator((value:unknown)=>restoreChurchWebsiteContentInput.parse(value)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return restoreChurchWebsiteContentService(getRequest(),data);
});
export const prepareSchoolWebsite=createServerFn({method:"POST"}).validator((value:unknown)=>prepareSchoolWebsiteInput.parse(value)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return prepareSchoolWebsiteService(getRequest(),data);
});
