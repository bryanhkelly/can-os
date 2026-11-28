import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {getClassroomProjectorCommandService,getClassroomProjectorCommandInputSchema,issueClassroomProjectorCommandService,issueClassroomProjectorCommandInputSchema} from "./classroom-projector.server";
export const getClassroomProjectorCommand=createServerFn({method:"GET"}).validator((raw:unknown)=>getClassroomProjectorCommandInputSchema.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return getClassroomProjectorCommandService(getRequest(),data);
});
export const issueClassroomProjectorCommand=createServerFn({method:"POST"}).validator((raw:unknown)=>issueClassroomProjectorCommandInputSchema.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return issueClassroomProjectorCommandService(getRequest(),data);
});
