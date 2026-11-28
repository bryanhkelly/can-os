import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {requestNativeClassApprovalService,requestInput,decideNativeClassApprovalService,decisionInput,getMyNativeClassApprovalsService,getNativeClassApprovalQueueService,queueInput} from "./native-class-approvals.server";
function privateResponse(){setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");}
export const requestNativeClassApproval=createServerFn({method:"POST"}).validator((raw:unknown)=>requestInput.parse(raw)).handler(async({data})=>{
 privateResponse();return requestNativeClassApprovalService(getRequest(),data);
});
export const decideNativeClassApproval=createServerFn({method:"POST"}).validator((raw:unknown)=>decisionInput.parse(raw)).handler(async({data})=>{
 privateResponse();return decideNativeClassApprovalService(getRequest(),data);
});
export const getMyNativeClassApprovals=createServerFn({method:"GET"}).handler(async()=>{
 privateResponse();return getMyNativeClassApprovalsService(getRequest());
});
export const getNativeClassApprovalQueue=createServerFn({method:"GET"}).validator((raw:unknown)=>queueInput.parse(raw)).handler(async({data})=>{
 privateResponse();return getNativeClassApprovalQueueService(getRequest(),data);
});
