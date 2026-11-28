import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {withdrawInput,withdrawMyNoncreditRegistrationService} from "./noncredit-self-enrollment-withdraw.server";
export const withdrawMyNoncreditRegistration=createServerFn({method:"POST"}).validator((raw:unknown)=>withdrawInput.parse(raw)).handler(async({data})=>{
  setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
  return withdrawMyNoncreditRegistrationService(getRequest(),data);
});
