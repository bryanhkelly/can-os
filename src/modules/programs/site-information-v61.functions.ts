import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {readSiteInformationV61Input,readSiteInformationV61Service,saveSiteInformationV61Input,saveSiteInformationV61Service} from "./site-information-v61.server";
export const readSiteInformationV61=createServerFn({method:"GET"}).validator((raw:unknown)=>readSiteInformationV61Input.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");return readSiteInformationV61Service(getRequest(),data);
});
export const saveSiteInformationV61=createServerFn({method:"POST"}).validator((raw:unknown)=>saveSiteInformationV61Input.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");return saveSiteInformationV61Service(getRequest(),data);
});
