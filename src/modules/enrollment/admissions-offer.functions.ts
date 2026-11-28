import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {getAdmissionOfferOptionsInput,getAdmissionOfferOptionsService,issueAdmissionOfferInput,issueAdmissionOfferService,respondToAdmissionOfferInput,respondToAdmissionOfferService,activateOfferedEnrollmentInput,activateOfferedEnrollmentService,withdrawIssuedAdmissionOfferInput,withdrawIssuedAdmissionOfferService} from "./admissions-offer-http.server";
export const getAdmissionOfferOptions=createServerFn({method:"GET"}).validator((raw:unknown)=>getAdmissionOfferOptionsInput.parse(raw??{})).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return getAdmissionOfferOptionsService(getRequest(),data);
});
export const issueAdmissionOffer=createServerFn({method:"POST"}).validator((raw:unknown)=>issueAdmissionOfferInput.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return issueAdmissionOfferService(getRequest(),data);
});
export const respondToAdmissionOffer=createServerFn({method:"POST"}).validator((raw:unknown)=>respondToAdmissionOfferInput.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return respondToAdmissionOfferService(getRequest(),data);
});
export const activateOfferedEnrollment=createServerFn({method:"POST"}).validator((raw:unknown)=>activateOfferedEnrollmentInput.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return activateOfferedEnrollmentService(getRequest(),data);
});
export const withdrawIssuedAdmissionOffer=createServerFn({method:"POST"}).validator((raw:unknown)=>withdrawIssuedAdmissionOfferInput.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return withdrawIssuedAdmissionOfferService(getRequest(),data);
});
