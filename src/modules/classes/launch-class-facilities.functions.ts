import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {readSiteSpacesV61Schema,saveClassPhysicalPlanV61Schema} from "@/domain/launch-facilities-v61";
import {readLaunchClassFacilitiesV61Service,saveLaunchClassPhysicalPlanV61Service} from "./launch-class-facilities.server";
export const readLaunchClassFacilitiesV61=createServerFn({method:"GET"})
 .validator((raw:unknown)=>readSiteSpacesV61Schema.parse(raw))
 .handler(({data})=>{setResponseHeader("Cache-Control","private, no-store");return readLaunchClassFacilitiesV61Service(getRequest(),data);});
export const saveLaunchClassPhysicalPlanV61=createServerFn({method:"POST"})
 .validator((raw:unknown)=>saveClassPhysicalPlanV61Schema.parse(raw))
 .handler(({data})=>{setResponseHeader("Cache-Control","private, no-store");return saveLaunchClassPhysicalPlanV61Service(getRequest(),data);});
