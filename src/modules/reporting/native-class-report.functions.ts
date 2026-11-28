import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {nativeClassReportInput,getNativeClassReportService} from "./native-class-report.server";
export const getNativeClassReport=createServerFn({method:"GET"}).validator((raw:unknown)=>nativeClassReportInput.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return getNativeClassReportService(getRequest(),data);
});
