import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {inputSchema} from "./credential-issuance.inputs";
/** Unpublished source command; do not register a route before scoped issuance DB acceptance. */
export const issueNoncreditAchievement=createServerFn({method:"POST"}).validator((raw:unknown)=>inputSchema.parse(raw)).handler(async({data})=>{setResponseHeader("Cache-Control","private, no-store");const service=await import("./credential-issuance.server");return service.issueNoncreditAchievementService(getRequest(),data);});
