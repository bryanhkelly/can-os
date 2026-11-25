import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {getCommandContext} from "@/modules/identity/command-context.server";
import {readNetworkReportingReadiness} from "./network-reporting-readiness.server";
export const getNetworkReportingReadiness=createServerFn({method:"GET"}).handler(async()=>{
  setResponseHeader("Cache-Control","private, no-store");
  return readNetworkReportingReadiness(await getCommandContext(getRequest()));
});
