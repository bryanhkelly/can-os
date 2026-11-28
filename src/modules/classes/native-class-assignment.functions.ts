import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {assignAdultToNativeClassService,assignSchema} from "./native-class-assignment.server";
function privateResponse(){setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");}
export const assignAdultToNativeClass=createServerFn({method:"POST"}).validator((raw:unknown)=>assignSchema.parse(raw)).handler(async({data})=>{
 privateResponse();return assignAdultToNativeClassService(getRequest(),data);
});
