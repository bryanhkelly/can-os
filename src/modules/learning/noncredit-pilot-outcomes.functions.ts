import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {params} from "./noncredit-pilot-outcomes.inputs";
export const getNoncreditPilotOutcomes=createServerFn({method:"GET"}).validator((raw:unknown)=>params.parse(raw)).handler(async({data})=>{setResponseHeader("Cache-Control","private, no-store");const service=await import("./noncredit-pilot-outcomes.server");return service.getNoncreditPilotOutcomes(getRequest(),data);});
