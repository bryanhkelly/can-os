import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {readInput,getNativeClassSessionAgendaService,publishInput,publishNativeClassSessionAgendaService} from "./native-class-session-agenda.server";

export const getNativeClassSessionAgenda=createServerFn({method:"GET"}).validator((raw:unknown)=>readInput.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return getNativeClassSessionAgendaService(getRequest(),data);
});
export const publishNativeClassSessionAgenda=createServerFn({method:"POST"}).validator((raw:unknown)=>publishInput.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return publishNativeClassSessionAgendaService(getRequest(),data);
});
