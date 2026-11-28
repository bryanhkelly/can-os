import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {withdrawInput,cancelInput,withdrawMyNativeClassEnrollmentService,cancelNativeClassEnrollmentService} from "./native-class-lifecycle.server";
function privateResponse(){setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");}
export const withdrawMyNativeClassEnrollment=createServerFn({method:"POST"}).validator((raw:unknown)=>withdrawInput.parse(raw)).handler(({data})=>{privateResponse();return withdrawMyNativeClassEnrollmentService(getRequest(),data);});
export const cancelNativeClassEnrollment=createServerFn({method:"POST"}).validator((raw:unknown)=>cancelInput.parse(raw)).handler(({data})=>{privateResponse();return cancelNativeClassEnrollmentService(getRequest(),data);});
