import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import * as input from "./noncredit-completion-review.inputs";
export const getNoncreditCompletionReview=createServerFn({method:"GET"}).validator((raw:unknown)=>input.input.parse(raw)).handler(async({data})=>{setResponseHeader("Cache-Control","private, no-store");const service=await import("./noncredit-completion-review.server");return service.getNoncreditCompletionReviewService(getRequest(),data);});
export const getNoncreditCompletionQueue=createServerFn({method:"GET"}).validator((raw:unknown)=>input.queueInput.parse(raw)).handler(async({data})=>{setResponseHeader("Cache-Control","private, no-store");const service=await import("./noncredit-completion-review.server");return service.getNoncreditCompletionQueueService(getRequest(),data);});
