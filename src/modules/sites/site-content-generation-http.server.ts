import {z} from "zod";
import {parseCommandInput} from "@/domain/command-input";
import {getCommandContext} from "@/modules/identity/command-context.server";
import {siteGenerationOptionsSchema} from "@/domain/site-content-generation";
import {previewSitePackage,processSitePackage,readStoredSitePackage} from "./site-content-package.server";
export const siteInput=z.object({siteId:z.string().uuid(),consumer:z.enum(["website","outreach"])}).strict();
export const previewInput=siteInput.extend({options:siteGenerationOptionsSchema});
export const processInput=previewInput.extend({digest:z.string().regex(/^[a-f0-9]{64}$/),externalProcessingConfirmed:z.literal(true)});
export async function readSiteIntelligenceContentService(request:Request,raw:unknown){
 const data=parseCommandInput(siteInput,raw);
 return readStoredSitePackage(await getCommandContext(request),data.siteId,data.consumer);
}
export async function previewSiteIntelligenceService(request:Request,raw:unknown){
 const data=parseCommandInput(previewInput,raw);
 return previewSitePackage(await getCommandContext(request),data);
}
export async function processSiteIntelligenceService(request:Request,raw:unknown){
 const data=parseCommandInput(processInput,raw);
 return processSitePackage(await getCommandContext(request),data,()=>getCommandContext(request));
}
