import {z} from "zod";
import {readBoundedResponseText} from "@/domain/bounded-request-body";
import {SITE_CONTENT_INSTRUCTIONS,parseGeneratedSiteContent,type SiteGenerationInput} from "@/domain/site-content-generation";
import {SITE_PACKAGE_INSTRUCTIONS,parseSiteContentPackage,type SitePackageInput} from "@/domain/site-content-package";
const endpoint="https://platform.ai.gloo.com/ai/v2/guarded/responses";
const responseSchema=z.object({status:z.string().optional(),model:z.string().optional(),id:z.string().optional(),
  output:z.array(z.object({type:z.string(),content:z.array(z.object({type:z.string(),text:z.string().optional()}).passthrough()).optional()}).passthrough()),
}).passthrough();
export class GlooProviderError extends Error {
  constructor(readonly code:string,message:string){super(message);this.name="GlooProviderError";}
}
export function glooConfiguration(){
  const key=process.env.GLOO_API_KEY?.trim(),model=process.env.GLOO_MODEL?.trim();
  return {keyConfigured:Boolean(key),modelConfigured:Boolean(model)};
}
export function assertGlooConfiguration(){
  const config=glooConfiguration();
  if(!config.keyConfigured||!config.modelConfigured)throw new GlooProviderError(!config.keyConfigured&&!config.modelConfigured?"gloo_missing_both":!config.keyConfigured?"gloo_missing_key":"gloo_missing_model","Gloo AI is not configured for this deployment.");
}
export function safeGlooFailure(error:unknown){
  return error instanceof GlooProviderError?{code:error.code,message:error.message}:{code:"processing_failed",message:"Site Intelligence could not complete or persist the result. Contact support."};
}
/** Fixed provider endpoint, server-only credentials, no automatic provider fallback. */
async function requestGloo(input:unknown,instructions:string,maxTokens:number,send:typeof fetch){
  const key=process.env.GLOO_API_KEY?.trim(),model=process.env.GLOO_MODEL?.trim();
  assertGlooConfiguration();
  const signal=AbortSignal.timeout(45000);
  let response:Response;
  try{response=await send(endpoint,{method:"POST",redirect:"error",signal,
    headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},
    body:JSON.stringify({model,instructions,input:JSON.stringify(input),max_output_tokens:maxTokens})});}
  catch{throw new GlooProviderError(signal.aborted?"gloo_timeout":"gloo_network",signal.aborted?"Gloo request timed out.":"Gloo could not be reached from this deployment.");}
  if(!response.ok)throw new GlooProviderError("gloo_http_"+response.status,"Gloo returned HTTP "+response.status+". "+(response.status===401||response.status===403?"Check API key and model access.":response.status===400||response.status===404||response.status===422?"Check model identifier and request compatibility.":response.status===429?"Provider rate limit reached.":"Check provider availability."));
  let value:z.infer<typeof responseSchema>;
  try{value=responseSchema.parse(JSON.parse(await readBoundedResponseText(response,128000)));}catch{throw new GlooProviderError("gloo_invalid_response","Gloo returned an invalid response.");}
  if(value.status&&value.status!=="completed")throw new GlooProviderError("gloo_incomplete","Gloo AI returned an incomplete draft.");
  const raw=value.output.filter(item=>item.type==="message").flatMap(item=>item.content??[]).filter(c=>c.type==="output_text").map(c=>c.text??"").join("");
  return {raw,model:value.model??model,providerResponseId:value.id??null};
}

export async function generateWithGloo(input:SiteGenerationInput,send:typeof fetch=fetch){
 const {raw,...metadata}=await requestGloo(input,SITE_CONTENT_INSTRUCTIONS,3000,send);
 try{return {...metadata,content:parseGeneratedSiteContent(raw,input.target)};}catch{throw new GlooProviderError("gloo_content_contract","Gloo draft did not satisfy the content contract.");}
}
export async function generateSitePackageWithGloo(input:SitePackageInput,send:typeof fetch=fetch){
 const {raw,...metadata}=await requestGloo(input,SITE_PACKAGE_INSTRUCTIONS,12000,send);
 try{return {...metadata,content:parseSiteContentPackage(raw,input)};}catch{throw new GlooProviderError("gloo_content_contract","Gloo package did not satisfy the content contract.");}
}

/** Synthetic probe contains no tenant data and never returns provider text or secrets. */
export async function testGlooConnection(send:typeof fetch=fetch){
 const configuration=glooConfiguration();
 try{const result=await requestGloo("Reply with OK.","Return only OK.",128,send);if(!result.raw.trim())throw new GlooProviderError("gloo_empty_response","Gloo returned no text.");return {...configuration,ok:true as const,code:"gloo_ok",message:"Gloo accepted a synthetic request and returned text."};}
 catch(error){return {...configuration,ok:false as const,...safeGlooFailure(error)};}
}
