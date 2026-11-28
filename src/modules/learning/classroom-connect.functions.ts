import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {getClassroomConnectCourseChoicesService} from "./classroom-connect.server";
export const getClassroomConnectCourseChoices=createServerFn({method:"GET"}).handler(async()=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return getClassroomConnectCourseChoicesService(getRequest());
});
