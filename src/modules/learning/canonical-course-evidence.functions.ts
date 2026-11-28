import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {input} from "./canonical-course-evidence.inputs";
export const getCanonicalCourseEvidence=createServerFn({method:"GET"}).validator((raw:unknown)=>input.parse(raw)).handler(async({data})=>{setResponseHeader("Cache-Control","private, no-store");const service=await import("./canonical-course-evidence.server");return service.getCanonicalCourseEvidenceService(getRequest(),data);});
