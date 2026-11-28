import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {input} from "./native-class-canonical-evidence.inputs";
export const getNativeClassCanonicalEvidence=createServerFn({method:"GET"}).validator((raw:unknown)=>input.parse(raw)).handler(async({data})=>{setResponseHeader("Cache-Control","private, no-store");const service=await import("./native-class-canonical-evidence.server");return service.getNativeClassCanonicalEvidenceService(getRequest(),data);});
