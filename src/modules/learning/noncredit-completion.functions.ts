import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {completion} from "./noncredit-assessment.inputs";
export const getNoncreditCompletionReadiness=createServerFn({method:"GET"}).validator((raw:unknown)=>completion.parse(raw)).handler(async({data})=>{setResponseHeader("Cache-Control","private, no-store");const service=await import("./noncredit-completion.server");return service.getNoncreditCompletionReadinessService(getRequest(),data);});
