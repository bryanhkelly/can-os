import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import * as service from "./guardian-family-applications.server";
export const getGuardianFamilyApplicationWorkspace=createServerFn({method:"GET"}).handler(async()=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return service.getGuardianFamilyApplicationWorkspaceService(getRequest());
});
export const startGuardianFamilyApplication=createServerFn({method:"POST"}).validator((raw:unknown)=>service.applicationInput.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return service.startGuardianFamilyApplicationService(getRequest(),data);
});
