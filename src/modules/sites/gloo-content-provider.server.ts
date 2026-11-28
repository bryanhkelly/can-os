import {z} from "zod";
import {readBoundedResponseText} from "@/domain/bounded-request-body";
import {SITE_CONTENT_INSTRUCTIONS,parseGeneratedSiteContent,type SiteGenerationInput} from "@/domain/site-content-generation";
import {SITE_PACKAGE_INSTRUCTIONS,parseSiteContentPackage,SitePackageContractError,type SitePackageInput} from "@/domain/site-content-package";
const endpoint="https://platform.ai.gloo.com/ai/v2/guarded/responses";
export const GLOO_PACKAGE_TIMEOUT_MS=120_000;
export const GLOO_PACKAGE_LEASE_MS=180_000;
const GLOO_PROBE_TIMEOUT_MS=30_000;
const MIN_CORRECTION_BUDGET_MS=15_000;
type ValidationIssue={field:string;reason:string};
type GlooEvent={stage:"provider_request"|"provider_response"|"response_parsed"|"contract_validated"|"contract_rejected"|"correction_requested"|"correction_skipped";request?:number;elapsedMs?:number;timeoutMs?:number;httpStatus?:number;responseCharacters?:number;issues?:ValidationIssue[]};
type GenerationHooks={onEvent?:(event:GlooEvent)=>void;beforeCorrection?:()=>Promise<void>};
// Only static schema keys and numeric array indices may be logged or returned. Never log Zod messages, raw JSON, arbitrary keys or provider text.
const schemaFields=new Set("schemaVersion target website outreach heroHeadline welcomeMessage localDescription schoolVision communityOutreach headline message callToAction reviewNotes identity tagline shortDescription longDescription purpose mission vision values story community audiences programs experiences id description leadership index biography websiteComposition navigation homeSections marketing site-announcement program-interest interest-invitation event-invitation talkingPoints partnerships positioning".split(" "));
function validationIssues(error:unknown):ValidationIssue[]{
 if(error instanceof SitePackageContractError)return [{field:error.field,reason:error.reason}];
 if(error instanceof SyntaxError)return [{field:"$",reason:"invalid_json"}];
 if(error instanceof z.ZodError)return error.issues.slice(0,12).map(issue=>({field:issue.path.map(part=>typeof part==="number"&&Number.isSafeInteger(part)?String(part):typeof part==="string"&&schemaFields.has(part)?part:"*").join(".")||"$",reason:issue.code}));
 return [{field:"$",reason:"contract_rejected"}];
}
/** Accept only a single outer Markdown JSON fence or harmless whitespace. No substring extraction, field coercion or content repair. */
export function normalizeGlooJson(raw:string):string{
 const trimmed=raw.trim();
 const fenced=/^```(?:json)?[ \\t]*\\r?\\n([\\s\\S]*?)\\r?\\n```[ \\t]*$/i.exec(trimmed);
 return fenced?fenced[1]!.trim():trimmed;
}
function contractFailure(error:unknown,label:string){
 const issues=validationIssues(error);
 return new GlooProviderError("gloo_content_contract",label+" did not satisfy the content contract: "+issues.map(issue=>issue.field+" ("+issue.reason+")").join(", ")+".",issues);
}
const responseSchema=z.object({status:z.string().optional(),model:z.string().optional(),id:z.string().optional(),
  output:z.array(z.object({type:z.string(),content:z.array(z.object({type:z.string(),text:z.string().optional()}).passthrough()).optional()}).passthrough()),
}).passthrough();
export class GlooProviderError extends Error {
  constructor(readonly code:string,message:string,readonly issues:ValidationIssue[]=[]){super(message);this.name="GlooProviderError";}
}
export function glooConfiguration(){
  const key=process.env.GLOO_API_KEY?.trim(),model=process.env.GLOO_MODEL?.trim();
  return {keyConfigured:Boolean(key),modelConfigured:Boolean(model)};
}
export function assertGlooConfiguration(){
  const key=process.env.GLOO_API_KEY?.trim(),model=process.env.GLOO_MODEL?.trim();
  if(!key||!model)throw new GlooProviderError(!key&&!model?"gloo_missing_both":!key?"gloo_missing_key":"gloo_missing_model","Gloo AI is not configured for this deployment.");
  return {key,model};
}
export function safeGlooFailure(error:unknown){
  return error instanceof GlooProviderError?{code:error.code,message:error.message}:{code:"processing_failed",message:"Site Intelligence could not complete or persist the result. Contact support."};
}
/** Fixed provider endpoint, server-only credentials, no automatic provider fallback. */
async function requestGloo(input:unknown,instructions:string,maxTokens:number,send:typeof fetch,timeoutMs:number,hooks:GenerationHooks={},request=1){
  const {key,model}=assertGlooConfiguration();
  const started=Date.now();
  const signal=AbortSignal.timeout(timeoutMs);
  hooks.onEvent?.({stage:"provider_request",request,timeoutMs});
  let response:Response;
  try{response=await send(endpoint,{method:"POST",redirect:"error",signal,
    headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},
    body:JSON.stringify({model,instructions,input:JSON.stringify(input),max_output_tokens:maxTokens})});}
  catch{throw new GlooProviderError(signal.aborted?"gloo_timeout":"gloo_network",signal.aborted?"Gloo request timed out.":"Gloo could not be reached from this deployment.");}
  hooks.onEvent?.({stage:"provider_response",request,httpStatus:response.status,elapsedMs:Date.now()-started});
  if(!response.ok)throw new GlooProviderError("gloo_http_"+response.status,"Gloo returned HTTP "+response.status+". "+(response.status===401||response.status===403?"Check API key and model access.":response.status===400||response.status===404||response.status===422?"Check model identifier and request compatibility.":response.status===429?"Provider rate limit reached.":"Check provider availability."));
  let value:z.infer<typeof responseSchema>;
  try{value=responseSchema.parse(JSON.parse(await readBoundedResponseText(response,128000)));}catch{throw new GlooProviderError(signal.aborted?"gloo_timeout":"gloo_invalid_response",signal.aborted?"Gloo response timed out.":"Gloo returned an invalid response.");}
  if(value.status&&value.status!=="completed")throw new GlooProviderError("gloo_incomplete","Gloo AI returned an incomplete draft.");
  const raw=value.output.filter(item=>item.type==="message").flatMap(item=>item.content??[]).filter(c=>c.type==="output_text").map(c=>c.text??"").join("");
  hooks.onEvent?.({stage:"response_parsed",request,elapsedMs:Date.now()-started,responseCharacters:raw.length});
  return {raw,model:value.model??model,providerResponseId:value.id??null};
}

export async function generateWithGloo(input:SiteGenerationInput,send:typeof fetch=fetch){
 const {raw,...metadata}=await requestGloo(input,SITE_CONTENT_INSTRUCTIONS,3000,send,GLOO_PACKAGE_TIMEOUT_MS);
 try{return {...metadata,content:parseGeneratedSiteContent(normalizeGlooJson(raw),input.target)};}catch(error){throw contractFailure(error,"Gloo draft");}
}
export async function generateSitePackageWithGloo(input:SitePackageInput,send:typeof fetch=fetch,hooks:GenerationHooks={}){
 const deadline=Date.now()+GLOO_PACKAGE_TIMEOUT_MS;
 async function run(instructions:string,request:number){
   const remaining=deadline-Date.now();
   if(remaining<=0)throw new GlooProviderError("gloo_timeout","Gloo package generation timed out.");
   const {raw,...metadata}=await requestGloo(input,instructions,12000,send,remaining,hooks,request);
   try{
     // Bound the original provider text as well as the normalized JSON.
     if(raw.length>64000)throw new SitePackageContractError("$","too_large","Content package exceeds limit");
     const content=parseSiteContentPackage(normalizeGlooJson(raw),input);
     hooks.onEvent?.({stage:"contract_validated",request});
     return {...metadata,content};
   }catch(error){
     const failure=contractFailure(error,"Gloo package");
     hooks.onEvent?.({stage:"contract_rejected",request,issues:failure.issues});
     throw failure;
   }
 }
 try{return await run(SITE_PACKAGE_INSTRUCTIONS,1);}
 catch(error){
   if(!(error instanceof GlooProviderError)||error.code!=="gloo_content_contract")throw error;
   if(deadline-Date.now()<MIN_CORRECTION_BUDGET_MS){hooks.onEvent?.({stage:"correction_skipped"});throw error;}
   // Recheck current authorization, consent, source digest and lease before
   // sending the same approved source again. Never send rejected provider text.
   await hooks.beforeCorrection?.();
   if(deadline-Date.now()<MIN_CORRECTION_BUDGET_MS){hooks.onEvent?.({stage:"correction_skipped"});throw error;}
   hooks.onEvent?.({stage:"correction_requested",request:2,issues:error.issues});
   const correction="The prior output failed validation. Regenerate the complete object from the original approved input. Correct these schema fields and reasons: "+JSON.stringify(error.issues)+". Do not invent facts or bypass any validation rule. Return exactly one JSON object.";
   return run(SITE_PACKAGE_INSTRUCTIONS+"\n"+correction,2);
 }
}

/** Synthetic probe contains no tenant data and never returns provider text or secrets. */
export async function testGlooConnection(send:typeof fetch=fetch){
 const configuration=glooConfiguration();
 try{const result=await requestGloo("Reply with OK.","Return only OK.",128,send,GLOO_PROBE_TIMEOUT_MS);if(!result.raw.trim())throw new GlooProviderError("gloo_empty_response","Gloo returned no text.");return {...configuration,ok:true as const,code:"gloo_ok",message:"Gloo accepted a synthetic request and returned text."};}
 catch(error){return {...configuration,ok:false as const,...safeGlooFailure(error)};}
}
