import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import * as input from "./noncredit-completion-corrections.inputs";
export const correctNoncreditCompletion=createServerFn({method:"POST"}).validator((raw:unknown)=>input.schema.parse(raw)).handler(async({data})=>{setResponseHeader("Cache-Control","private, no-store");const service=await import("./noncredit-completion-corrections.server");return service.correctNoncreditCompletionService(getRequest(),data);});
