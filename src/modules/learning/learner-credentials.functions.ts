import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {downloadInput} from "./learner-credentials.inputs";
export const listMyNoncreditCredentials=createServerFn({method:"GET"}).handler(async()=>{setResponseHeader("Cache-Control","private, no-store");const service=await import("./learner-credentials.server");return service.listMyNoncreditCredentialsService(getRequest());});
export const downloadMyNoncreditCredential=createServerFn({method:"POST"}).validator((raw:unknown)=>downloadInput.parse(raw)).handler(async({data})=>{setResponseHeader("Cache-Control","private, no-store");const service=await import("./learner-credentials.server");return service.downloadMyNoncreditCredentialService(getRequest(),data);});
