import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { normalizeClientError } from "@/lib/client-error";
import {
  enrollInNativeClass, nativeClassEnrollmentInput,
} from "./native-class-enrollment.functions";
import { resumeLinkedNativeClassLearner } from "./native-class-session-recovery.functions";
import { activateReviewedNativeClassLearner } from "./native-class-reviewed-onboarding.functions";

/**
 * One application command owns the CAN-to-native identity recovery sequence.
 * Pages and other enrollment experiences submit the same immutable enrollment
 * input; no browser can invent a Person, account, birth date or role grant.
 *
 * Only a genuinely missing native learner cookie is recoverable. Any other
 * authorization, enrollment capacity, consent or infrastructure failure is
 * returned unchanged. Enrollment is still the sole source of seats/attempts.
 */
export const enrollCurrentPersonInClass=createServerFn({method:"POST"})
 .validator((raw:unknown)=>nativeClassEnrollmentInput.parse(raw))
 .handler(async({data})=>{
   setResponseHeader("Cache-Control","private, no-store");
   setResponseHeader("Referrer-Policy","no-referrer");
   try{
     return await enrollInNativeClass({data});
   }catch(originalError){
     if(normalizeClientError(originalError).code!=="CANONICAL_LEARNER_SESSION_REQUIRED")
       throw originalError;
   }
   try{
     await resumeLinkedNativeClassLearner();
   }catch(recoveryError){
     if(normalizeClientError(recoveryError).code!=="CANONICAL_LEARNER_ONBOARDING_REQUIRED")
       throw recoveryError;
     await activateReviewedNativeClassLearner();
   }
   return enrollInNativeClass({data});
 });
