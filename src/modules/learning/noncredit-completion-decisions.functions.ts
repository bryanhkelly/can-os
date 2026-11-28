import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import * as input from "./noncredit-completion-decisions.inputs";
export const decideNoncreditCompletion=createServerFn({method:"POST"}).validator((raw:unknown)=>input.schema.parse(raw)).handler(async({data})=>{setResponseHeader("Cache-Control","private, no-store");const service=await import("./noncredit-completion-decisions.server");return service.decideNoncreditCompletionService(getRequest(),data);});
