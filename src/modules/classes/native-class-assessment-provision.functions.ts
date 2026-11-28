import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {input} from "./native-class-assessment-provision.inputs";
export const provisionNativeClassKnowledgeCheckAccess=createServerFn({method:"POST"}).validator((raw:unknown)=>input.parse(raw)).handler(async({data})=>{setResponseHeader("Cache-Control","private, no-store");const service=await import("./native-class-assessment-provision.server");return service.provisionNativeClassKnowledgeCheckAccessService(getRequest(),data);});
