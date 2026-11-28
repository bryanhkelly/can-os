import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {inputSchema} from "./native-deployment-placement.server";
import {placeNativeDeploymentSiteService} from "./native-deployment-placement.server";
export const placeNativeDeploymentSite=createServerFn({method:"POST"}).validator((raw:unknown)=>inputSchema.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");return placeNativeDeploymentSiteService(getRequest(),data);
});
