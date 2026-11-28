import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import * as input from "./native-class-survey-link.inputs";
export const getNativeClassSurveyCampaignOptions=createServerFn({method:"GET"}).validator((raw:unknown)=>input.select.parse(raw)).handler(async({data})=>{setResponseHeader("Cache-Control","private, no-store");const service=await import("./native-class-survey-link.server");return service.getNativeClassSurveyCampaignOptions(getRequest(),data);});
export const linkNativeClassSurveyCampaign=createServerFn({method:"POST"}).validator((raw:unknown)=>input.link.parse(raw)).handler(async({data})=>{setResponseHeader("Cache-Control","private, no-store");const service=await import("./native-class-survey-link.server");return service.linkNativeClassSurveyCampaign(getRequest(),data);});
