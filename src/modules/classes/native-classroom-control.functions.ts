import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {transferInput,transferNativeClassroomControlService} from "./native-classroom-control.server";

export const transferNativeClassroomControl=createServerFn({method:"POST"}).validator((raw:unknown)=>transferInput.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return transferNativeClassroomControlService(getRequest(),data);
});
