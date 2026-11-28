import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {getMyNativeClassCalendarService,calendarInput} from "./native-class-calendar.server";
function noStore(){setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");}
export const getMyNativeClassCalendar=createServerFn({method:"GET"}).validator((raw:unknown)=>calendarInput.parse(raw)).handler(async({data})=>{noStore();return getMyNativeClassCalendarService(getRequest(),data);});
