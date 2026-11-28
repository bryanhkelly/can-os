import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {z} from "zod";
import {requireReportingPlatformAdministrator} from "@/modules/identity/reporting-platform-authority.server";
import {testGlooConnection} from "./gloo-content-provider.server";
import {getCommandContext} from "@/modules/identity/command-context.server";
import {siteGenerationOptionsSchema} from "@/domain/site-content-generation";
import {previewSitePackage,processSitePackage,readStoredSitePackage,listLegacyGlooFailures,authorizeLegacyGlooRetry} from "./site-content-package.server";
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
 const request=getRequest();
 return processSitePackage(await getCommandContext(request),data,()=>getCommandContext(request));
});

/** Independent synthetic connection probe, restricted to verified platform administration. */
export const checkGlooConnection=createServerFn({method:"POST"}).handler(async()=>{
 setResponseHeader("Cache-Control","private, no-store");
 await requireReportingPlatformAdministrator(getRequest());
 return testGlooConnection();
});

export const readGlooRecoveryCandidates=createServerFn({method:"GET"}).handler(async()=>{
 setResponseHeader("Cache-Control","private, no-store");
 await requireReportingPlatformAdministrator(getRequest());
 return listLegacyGlooFailures();
});
export const grantLegacyGlooRetry=createServerFn({method:"POST"}).validator((v:unknown)=>z.object({siteId:z.string().uuid(),inputId:z.string().uuid(),confirmed:z.literal(true)}).strict().parse(v)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");
 const actor=await requireReportingPlatformAdministrator(getRequest());
 return authorizeLegacyGlooRetry(actor,data);
});
