import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {previewInput} from "./credential-preview.inputs";
export const previewNoncreditCredential=createServerFn({method:"POST"}).validator((raw:unknown)=>previewInput.parse(raw)).handler(async({data})=>{setResponseHeader("Cache-Control","private, no-store");const service=await import("./credential-preview.server");return service.previewNoncreditCredentialService(getRequest(),data);});
