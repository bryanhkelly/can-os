import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {readExistingSiteProgramsV61Input,readExistingSiteProgramsV61Service,readSiteProgramsAudiencesV61Input,readSiteProgramsAudiencesV61Service,saveSiteProgramsAudiencesV61Input,saveSiteProgramsAudiencesV61Service} from "./site-programs-audiences-v61.server";
export const readExistingSiteProgramsV61=createServerFn({method:"GET"}).validator((raw:unknown)=>readExistingSiteProgramsV61Input.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");return readExistingSiteProgramsV61Service(getRequest(),data);
});
export const readSiteProgramsAudiencesV61=createServerFn({method:"GET"}).validator((raw:unknown)=>readSiteProgramsAudiencesV61Input.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");return readSiteProgramsAudiencesV61Service(getRequest(),data);
});
export const saveSiteProgramsAudiencesV61=createServerFn({method:"POST"}).validator((raw:unknown)=>saveSiteProgramsAudiencesV61Input.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");return saveSiteProgramsAudiencesV61Service(getRequest(),data);
});
