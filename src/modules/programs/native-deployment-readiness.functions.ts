import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {deploymentReadinessCommand} from "@/domain/native-deployment-readiness";
import {recordNativeDeploymentReadinessService} from "./native-deployment-readiness.server";
export const recordNativeDeploymentReadiness=createServerFn({method:"POST"}).validator((raw:unknown)=>deploymentReadinessCommand.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");return recordNativeDeploymentReadinessService(getRequest(),data);
});
