import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {input} from "./native-class-completion-policy.inputs";
export const publishNativeClassCompletionPolicy=createServerFn({method:"POST"}).validator((raw:unknown)=>input.parse(raw)).handler(async({data})=>{setResponseHeader("Cache-Control","private, no-store");const service=await import("./native-class-completion-policy.server");return service.publishNativeClassCompletionPolicyService(getRequest(),data);});
