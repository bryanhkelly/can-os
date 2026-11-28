import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import * as input from "./noncredit-completion-policy.inputs";
export const getNoncreditCompletionPolicyCatalog=createServerFn({method:"GET"}).handler(async()=>{setResponseHeader("Cache-Control","private, no-store");const service=await import("./noncredit-completion-policy.server");return service.getNoncreditCompletionPolicyCatalogService(getRequest());});
export const publishNoncreditCompletionPolicy=createServerFn({method:"POST"}).validator((raw:unknown)=>input.input.parse(raw)).handler(async({data})=>{setResponseHeader("Cache-Control","private, no-store");const service=await import("./noncredit-completion-policy.server");return service.publishNoncreditCompletionPolicyService(getRequest(),data);});
