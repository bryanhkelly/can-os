import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {approvalInput,approveNativeOfferingAdoptionService} from "./native-offering-adoption-command.server";
import {getNativeOfferingAdoptionReviewQueueService} from "./native-offering-adoption-queue.server";
export const getNativeOfferingAdoptionReviewQueue=createServerFn({method:"GET"}).handler(async()=>{
 setResponseHeader("Cache-Control","private, no-store");return getNativeOfferingAdoptionReviewQueueService(getRequest());
});
export const approveNativeOfferingAdoption=createServerFn({method:"POST"}).validator((raw:unknown)=>approvalInput.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");return approveNativeOfferingAdoptionService(getRequest(),data);
});
