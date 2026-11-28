import {createServerFn} from "@tanstack/react-start";
import {getRequest,appendResponseHeader,setResponseHeader} from "@tanstack/react-start/server";
import {activateReviewedNativeClassLearnerService} from "./native-class-reviewed-onboarding.server";
export const activateReviewedNativeClassLearner=createServerFn({method:"POST"}).handler(async()=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 const {cookie,result}=await activateReviewedNativeClassLearnerService(getRequest());
 appendResponseHeader("Set-Cookie",cookie);return result;
});
