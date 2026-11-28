import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {input} from "./credential-revocation.inputs";
export const revokeLearningAwardIssuance=createServerFn({method:"POST"}).validator((raw:unknown)=>input.parse(raw)).handler(async({data})=>{setResponseHeader("Cache-Control","private, no-store");const service=await import("./credential-revocation.server");return service.revokeLearningAwardIssuanceService(getRequest(),data);});
