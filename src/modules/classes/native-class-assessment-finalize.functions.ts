import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {pendingInput,input} from "./native-class-assessment-finalize.inputs";
export const getNativeClassPendingKnowledgeReviews=createServerFn({method:"GET"}).validator((raw:unknown)=>pendingInput.parse(raw)).handler(async({data})=>{setResponseHeader("Cache-Control","private, no-store");const service=await import("./native-class-assessment-finalize.server");return service.getNativeClassPendingKnowledgeReviewsService(getRequest(),data);});
export const finalizeNativeClassKnowledgeCheck=createServerFn({method:"POST"}).validator((raw:unknown)=>input.parse(raw)).handler(async({data})=>{setResponseHeader("Cache-Control","private, no-store");const service=await import("./native-class-assessment-finalize.server");return service.finalizeNativeClassKnowledgeCheckService(getRequest(),data);});
