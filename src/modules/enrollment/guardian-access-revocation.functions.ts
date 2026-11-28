import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import * as service from "./guardian-access-revocation.server";
export const revokeAdmissionsGuardianAccess=createServerFn({method:"POST"}).validator((raw:unknown)=>service.revocationInput.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return service.revokeAdmissionsGuardianAccessService(getRequest(),data);
});
export const restoreAdmissionsGuardianAccess=createServerFn({method:"POST"}).validator((raw:unknown)=>service.revocationInput.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return service.restoreAdmissionsGuardianAccessService(getRequest(),data);
});
