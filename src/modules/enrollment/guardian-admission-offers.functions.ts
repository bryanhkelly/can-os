import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import * as service from "./guardian-admission-offers-http.server";
export const getGuardianAdmissionOffers=createServerFn({method:"GET"}).validator((raw:unknown)=>service.getGuardianAdmissionOffersInput.parse(raw??{})).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return service.getGuardianAdmissionOffersService(getRequest(),data);
});
