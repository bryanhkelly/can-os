import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
export const getFacilitatedImpactReport=createServerFn({method:"GET"}).handler(async()=>{setResponseHeader("Cache-Control","private, no-store");const service=await import("./facilitated-impact.server");return service.getFacilitatedImpactReport(getRequest());});
