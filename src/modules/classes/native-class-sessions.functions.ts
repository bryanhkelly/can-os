import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {nativeClassSessionScheduleSchema,scheduleNativeClassSessionsService,nativeClassSessionChangeSchema,changeNativeClassSessionScheduleService,openInput,openNativeClassSessionService,revokeInput,revokeNativeClassSessionService} from "./native-class-sessions.server";
export {nativeClassSessionScheduleSchema} from "./native-class-sessions.server";
export {nativeClassSessionChangeSchema} from "./native-class-sessions.server";
export const scheduleNativeClassSessions=createServerFn({method:"POST"}).validator((raw:unknown)=>nativeClassSessionScheduleSchema.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return scheduleNativeClassSessionsService(getRequest(),data);
});
export const changeNativeClassSessionSchedule=createServerFn({method:"POST"}).validator((raw:unknown)=>nativeClassSessionChangeSchema.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return changeNativeClassSessionScheduleService(getRequest(),data);
});
export const openNativeClassSession=createServerFn({method:"POST"}).validator((raw:unknown)=>openInput.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return openNativeClassSessionService(getRequest(),data);
});
export const revokeNativeClassSession=createServerFn({method:"POST"}).validator((raw:unknown)=>revokeInput.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return revokeNativeClassSessionService(getRequest(),data);
});
