import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {readSiteSpacesV61Schema,createSiteSpaceV61Schema,saveSiteSpaceV61Schema} from "@/domain/launch-facilities-v61";
import {readLaunchSiteFacilitiesV61Service,createLaunchSiteSpaceV61Service,saveLaunchSiteSpaceV61Service} from "./launch-site-facilities.server";
export const readLaunchSiteFacilitiesV61=createServerFn({method:"GET"})
 .validator((raw:unknown)=>readSiteSpacesV61Schema.parse(raw))
 .handler(({data})=>{setResponseHeader("Cache-Control","private, no-store");return readLaunchSiteFacilitiesV61Service(getRequest(),data);});
export const createLaunchSiteSpaceV61=createServerFn({method:"POST"})
 .validator((raw:unknown)=>createSiteSpaceV61Schema.parse(raw))
 .handler(({data})=>{setResponseHeader("Cache-Control","private, no-store");return createLaunchSiteSpaceV61Service(getRequest(),data);});
export const saveLaunchSiteSpaceV61=createServerFn({method:"POST"})
 .validator((raw:unknown)=>saveSiteSpaceV61Schema.parse(raw))
 .handler(({data})=>{setResponseHeader("Cache-Control","private, no-store");return saveLaunchSiteSpaceV61Service(getRequest(),data);});
