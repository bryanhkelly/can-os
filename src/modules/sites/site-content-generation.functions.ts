import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {z} from "zod";
import {getCommandContext} from "@/modules/identity/command-context.server";
import {siteGenerationOptionsSchema} from "@/domain/site-content-generation";
import {previewSitePackage,processSitePackage,readStoredSitePackage} from "./site-content-package.server";
const siteInput=z.object({siteId:z.string().uuid(),consumer:z.enum(["website","outreach"])}).strict();
const request=siteInput.extend({options:siteGenerationOptionsSchema});
export const readSiteIntelligenceContent=createServerFn({method:"GET"}).validator((v:unknown)=>siteInput.parse(v)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");
 return readStoredSitePackage(await getCommandContext(getRequest()),data.siteId,data.consumer);
});
export const previewSiteIntelligence=createServerFn({method:"POST"}).validator((v:unknown)=>request.parse(v)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");
 return previewSitePackage(await getCommandContext(getRequest()),data);
});
export const processSiteIntelligence=createServerFn({method:"POST"}).validator((v:unknown)=>request.extend({digest:z.string().regex(/^[a-f0-9]{64}$/),externalProcessingConfirmed:z.literal(true)}).parse(v)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");
 return processSitePackage(await getCommandContext(getRequest()),data);
});
