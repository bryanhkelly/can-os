import {createServerFn} from "@tanstack/react-start";
import {getRequest,appendResponseHeader,setResponseHeader} from "@tanstack/react-start/server";
import {resumeLinkedNativeClassLearnerService} from "./native-class-session-recovery.server";
export const resumeLinkedNativeClassLearner=createServerFn({method:"POST"}).handler(async()=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 const {cookie,result}=await resumeLinkedNativeClassLearnerService(getRequest());
 appendResponseHeader("Set-Cookie",cookie);return result;
});
