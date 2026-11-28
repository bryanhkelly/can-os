import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import * as service from "./public-admissions-interest-http.server";
export const listPublicAdmissionsInterests=createServerFn({method:"GET"}).validator((raw:unknown)=>service.listPublicAdmissionsInterestsInput.parse(raw??{})).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return service.listPublicAdmissionsInterestsService(getRequest(),data);
});
export const assignPublicSiteInterestToProgram=createServerFn({method:"POST"}).validator((raw:unknown)=>service.assignPublicSiteInterestToProgramInput.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return service.assignPublicSiteInterestToProgramService(getRequest(),data);
});
export const invitePublicAdmissionsInterestToApply=createServerFn({method:"POST"}).validator((raw:unknown)=>service.invitePublicAdmissionsInterestToApplyInput.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return service.invitePublicAdmissionsInterestToApplyService(getRequest(),data);
});
export const setPublicAdmissionsInterestStatus=createServerFn({method:"POST"}).validator((raw:unknown)=>service.setPublicAdmissionsInterestStatusInput.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return service.setPublicAdmissionsInterestStatusService(getRequest(),data);
});
