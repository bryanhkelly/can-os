import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {createUnifiedClassDraftService,createUnifiedClassDraftInput,activateUnifiedClassService,activateUnifiedClassInput,getMyUnifiedClassDraftsService,getMyUnifiedClassDraftsInput,publishUnifiedClassOfferingService,publishUnifiedClassOfferingInput,closeUnifiedClassOfferingService,closeUnifiedClassOfferingInput,createNextUnifiedClassOfferingVersionService,createNextUnifiedClassOfferingVersionInput,getNativeClassOperatorSitesService,getUnifiedClassCourseOptionsService,getUnifiedClassCourseOptionsInput} from "./unified-class.server";
export const createUnifiedClassDraft=createServerFn({method:"POST"}).validator((raw:unknown)=>createUnifiedClassDraftInput.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");return createUnifiedClassDraftService(getRequest(),data);
});
export const activateUnifiedClass=createServerFn({method:"POST"}).validator((raw:unknown)=>activateUnifiedClassInput.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");return activateUnifiedClassService(getRequest(),data);
});
export const getMyUnifiedClassDrafts=createServerFn({method:"GET"}).validator((raw:unknown)=>getMyUnifiedClassDraftsInput.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");return getMyUnifiedClassDraftsService(getRequest(),data);
});
export const publishUnifiedClassOffering=createServerFn({method:"POST"}).validator((raw:unknown)=>publishUnifiedClassOfferingInput.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");return publishUnifiedClassOfferingService(getRequest(),data);
});
export const closeUnifiedClassOffering=createServerFn({method:"POST"}).validator((raw:unknown)=>closeUnifiedClassOfferingInput.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");return closeUnifiedClassOfferingService(getRequest(),data);
});
export const createNextUnifiedClassOfferingVersion=createServerFn({method:"POST"}).validator((raw:unknown)=>createNextUnifiedClassOfferingVersionInput.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");return createNextUnifiedClassOfferingVersionService(getRequest(),data);
});
export const getNativeClassOperatorSites=createServerFn({method:"GET"}).handler(async()=>{
 setResponseHeader("Cache-Control","private, no-store");return getNativeClassOperatorSitesService(getRequest());
});
export const getUnifiedClassCourseOptions=createServerFn({method:"GET"}).validator((raw:unknown)=>getUnifiedClassCourseOptionsInput.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");return getUnifiedClassCourseOptionsService(getRequest(),data);
});
