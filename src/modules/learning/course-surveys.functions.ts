import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {scope,submission,courseInput} from "./course-surveys.inputs";
export const listNoncreditCourseSurveys=createServerFn({method:"GET"}).validator((raw:unknown)=>courseInput.parse(raw)).handler(async({data})=>{setResponseHeader("Cache-Control","private, no-store");const service=await import("./course-surveys.server");return service.listNoncreditCourseSurveys(getRequest(),data);});
export const getCourseSurvey=createServerFn({method:"GET"}).validator((raw:unknown)=>scope.parse(raw)).handler(async({data})=>{setResponseHeader("Cache-Control","private, no-store");const service=await import("./course-surveys.server");return service.getCourseSurvey(getRequest(),data);});
export const submitCourseSurvey=createServerFn({method:"POST"}).validator((raw:unknown)=>submission.parse(raw)).handler(async({data})=>{setResponseHeader("Cache-Control","private, no-store");const service=await import("./course-surveys.server");return service.submitCourseSurvey(getRequest(),data);});
