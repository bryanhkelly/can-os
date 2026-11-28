import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {params} from "./noncredit-network-report.inputs";
export const getNoncreditOperatorNetworkSummary=createServerFn({method:"GET"}).validator((raw:unknown)=>params.parse(raw??{})).handler(async({data})=>{setResponseHeader("Cache-Control","private, no-store");const service=await import("./noncredit-network-report.server");return service.getNoncreditOperatorNetworkSummary(getRequest(),data);});
