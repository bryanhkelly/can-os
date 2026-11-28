import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {getMyNativeTeachingClassesService,getNativeTeacherTodayService} from "./native-class-teacher-home.server";
export const getMyNativeTeachingClasses=createServerFn({method:"GET"}).handler(async()=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return getMyNativeTeachingClassesService(getRequest());
});
export const getNativeTeacherToday=createServerFn({method:"GET"}).handler(async()=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return getNativeTeacherTodayService(getRequest());
});
