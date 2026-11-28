import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {classWorkspaceInput,rosterPageInput,getNativeClassWorkspaceService,getNativeClassRosterPageService} from "./native-class-workspace.server";
function noStore(){setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");}
export const getNativeClassRosterPage=createServerFn({method:"GET"}).validator((raw:unknown)=>rosterPageInput.parse(raw)).handler(async({data})=>{noStore();return getNativeClassRosterPageService(getRequest(),data);});
export const getNativeClassWorkspace=createServerFn({method:"GET"}).validator((raw:unknown)=>classWorkspaceInput.parse(raw)).handler(async({data})=>{noStore();return getNativeClassWorkspaceService(getRequest(),data);});
