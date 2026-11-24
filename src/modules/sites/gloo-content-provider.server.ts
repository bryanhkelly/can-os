import {z} from "zod";
import {SITE_CONTENT_INSTRUCTIONS,parseGeneratedSiteContent,type SiteGenerationInput} from "@/domain/site-content-generation";
import {SITE_PACKAGE_INSTRUCTIONS,parseSiteContentPackage,type SitePackageInput} from "@/domain/site-content-package";
const endpoint="https://platform.ai.gloo.com/ai/v2/guarded/responses";
const responseSchema=z.object({status:z.string().optional(),model:z.string().optional(),id:z.string().optional(),
  output:z.array(z.object({type:z.string(),content:z.array(z.object({type:z.string(),text:z.string().optional()}).passthrough()).optional()}).passthrough()),
}).passthrough();
async function boundedText(response:Response){
  if(!response.body)throw new Error("Gloo returned no content");
  const reader=response.body.getReader();const decoder=new TextDecoder();let size=0,body="";
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>128000)throw new Error("Gloo response exceeds limit");body+=decoder.decode(value,{stream:true});}return body+decoder.decode();}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
/** Fixed provider endpoint, server-only credentials, no automatic provider fallback. */
async function requestGloo(input:unknown,instructions:string,maxTokens:number,send:typeof fetch){
  const key=process.env.GLOO_API_KEY?.trim(),model=process.env.GLOO_MODEL?.trim();
  if(!key||!model)throw new Error("Gloo AI is not configured for this deployment.");
  const response=await send(endpoint,{method:"POST",redirect:"error",signal:AbortSignal.timeout(45000),
    headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},
    body:JSON.stringify({model,instructions,input:JSON.stringify(input),max_output_tokens:maxTokens})});
  if(!response.ok)throw new Error("Gloo AI could not generate an eligible draft ("+response.status+").");
  let value:z.infer<typeof responseSchema>;
  try{value=responseSchema.parse(JSON.parse(await boundedText(response)));}catch{throw new Error("Gloo returned an invalid response.");}
  if(value.status&&value.status!=="completed")throw new Error("Gloo AI returned an incomplete draft.");
  const raw=value.output.filter(item=>item.type==="message").flatMap(item=>item.content??[]).filter(c=>c.type==="output_text").map(c=>c.text??"").join("");
  return {raw,model:value.model??model,providerResponseId:value.id??null};
}

export async function generateWithGloo(input:SiteGenerationInput,send:typeof fetch=fetch){
 const {raw,...metadata}=await requestGloo(input,SITE_CONTENT_INSTRUCTIONS,3000,send);
 try{return {...metadata,content:parseGeneratedSiteContent(raw,input.target)};}catch{throw new Error("Gloo draft did not satisfy the content contract.");}
}
export async function generateSitePackageWithGloo(input:SitePackageInput,send:typeof fetch=fetch){
 const {raw,...metadata}=await requestGloo(input,SITE_PACKAGE_INSTRUCTIONS,12000,send);
 try{return {...metadata,content:parseSiteContentPackage(raw,input)};}catch{throw new Error("Gloo package did not satisfy the content contract.");}
}
