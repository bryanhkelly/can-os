import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {z} from "zod";
import {requireReportingPlatformAdministrator} from "@/modules/identity/reporting-platform-authority.server";
import {testGlooConnection} from "./gloo-content-provider.server";
import {listLegacyGlooFailures,authorizeLegacyGlooRetry} from "./site-content-package.server";
import {siteInput,previewInput,processInput,readSiteIntelligenceContentService,previewSiteIntelligenceService,processSiteIntelligenceService} from "./site-content-generation-http.server";
export const readSiteIntelligenceContent=createServerFn({method:"GET"}).validator((v:unknown)=>siteInput.parse(v)).handler(({data})=>{setResponseHeader("Cache-Control","private, no-store");return readSiteIntelligenceContentService(getRequest(),data);});
export const previewSiteIntelligence=createServerFn({method:"POST"}).validator((v:unknown)=>previewInput.parse(v)).handler(({data})=>{setResponseHeader("Cache-Control","private, no-store");return previewSiteIntelligenceService(getRequest(),data);});
export const processSiteIntelligence=createServerFn({method:"POST"}).validator((v:unknown)=>processInput.parse(v)).handler(({data})=>{setResponseHeader("Cache-Control","private, no-store");return processSiteIntelligenceService(getRequest(),data);});

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
