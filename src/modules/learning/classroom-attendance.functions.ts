import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {getClassroomAttendanceRosterService,getClassroomAttendanceRosterInputSchema,attestClassroomParticipationService,attestClassroomParticipationInputSchema} from "./classroom-attendance.server";
export const getClassroomAttendanceRoster=createServerFn({method:"GET"}).validator((raw:unknown)=>getClassroomAttendanceRosterInputSchema.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return getClassroomAttendanceRosterService(getRequest(),data);
});
export const attestClassroomParticipation=createServerFn({method:"POST"}).validator((raw:unknown)=>attestClassroomParticipationInputSchema.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return attestClassroomParticipationService(getRequest(),data);
});
