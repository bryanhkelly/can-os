import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {getMyNativeGuardianLearnersService,requestNativeGuardianClassApprovalService,requestNativeGuardianClassApprovalInput,getMyNativeGuardianClassApprovalsService,acceptNativeGuardianClassApprovalService,acceptNativeGuardianClassApprovalInput,withdrawMyGuardianNativeClassEnrollmentService,withdrawMyGuardianNativeClassEnrollmentInput,getMyNativeGuardianClassEnrollmentsService,getGuardianCommunitySummaryService} from "./native-class-guardian-enrollment.server";
export const getMyNativeGuardianLearners=createServerFn({method:"GET"}).handler(async()=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return getMyNativeGuardianLearnersService(getRequest());
});
export const requestNativeGuardianClassApproval=createServerFn({method:"POST"}).validator((raw:unknown)=>requestNativeGuardianClassApprovalInput.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return requestNativeGuardianClassApprovalService(getRequest(),data);
});
export const getMyNativeGuardianClassApprovals=createServerFn({method:"GET"}).handler(async()=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return getMyNativeGuardianClassApprovalsService(getRequest());
});
export const acceptNativeGuardianClassApproval=createServerFn({method:"POST"}).validator((raw:unknown)=>acceptNativeGuardianClassApprovalInput.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return acceptNativeGuardianClassApprovalService(getRequest(),data);
});
export const withdrawMyGuardianNativeClassEnrollment=createServerFn({method:"POST"}).validator((raw:unknown)=>withdrawMyGuardianNativeClassEnrollmentInput.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return withdrawMyGuardianNativeClassEnrollmentService(getRequest(),data);
});
export const getMyNativeGuardianClassEnrollments=createServerFn({method:"GET"}).handler(async()=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return getMyNativeGuardianClassEnrollmentsService(getRequest());
});
export const getGuardianCommunitySummary=createServerFn({method:"GET"}).handler(async()=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return getGuardianCommunitySummaryService(getRequest());
});
