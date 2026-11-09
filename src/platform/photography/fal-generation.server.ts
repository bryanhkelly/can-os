import {schoolPhotographyBrief} from "@/domain/template-photography-production";
import type {SiteTemplateId} from "@/domain/site-theme";
import type {TemplatePhotographyRole} from "@/domain/template-sample-images";

/**
 * fal.ai production adapter. Server-only, no browser imports and no public route.
 * Every submit costs money: calling code must require a deliberate authorized
 * operator action and enforce batch limits and a budget before invoking submit.
 */
const endpoint="https://queue.fal.run/fal-ai/nano-banana-2";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * fal.ai keys are single-line printable ASCII tokens. Normalize accidental
 * whitespace and invisible formatting inserted by secret-manager copy/paste.
 * Never log the raw or normalized value. Control bytes not known to be
 * whitespace remain invalid and cannot be injected into Authorization.
 */
export function normalizeFalKey(raw:string|undefined):string {
  if(!raw)throw new Error("FAL_KEY is not configured on the server");
  const key=raw.replace(/[\s\u200B-\u200D\uFEFF]/g,"");
  if(!key)throw new Error("FAL_KEY is empty after whitespace normalization");
  if(/[^\x21-\x7E]/.test(key))
    throw new Error("FAL_KEY contains invalid HTTP header characters");
  return key;
}
function credentials(injectedKey?:string):string {
  return normalizeFalKey(injectedKey ?? process.env.FAL_KEY);
}
function headers(injectedKey?:string):HeadersInit {
  return {"Authorization":`Key ${credentials(injectedKey)}`,"Content-Type":"application/json"};
}
async function safeJson(response:Response):Promise<Record<string,unknown>> {
  if(!response.ok)throw new Error(`fal.ai request failed with HTTP ${response.status}`);
  const json:unknown=await response.json();
  if(!json||typeof json!=="object"||Array.isArray(json))throw new Error("Invalid fal.ai response");
  return json as Record<string,unknown>;
}
export type FalPhotographyJob={
  requestId:string;
  responseUrl?:string;
  statusUrl?:string;
  template:SiteTemplateId;
  role:TemplatePhotographyRole;
  proposedFilename:string;
  requestedWidth:number;
  requestedHeight:number;
};

/** Enqueue one image; never automatically submit an entire batch. */
export async function submitSchoolPhoto(
  template:SiteTemplateId,role:TemplatePhotographyRole,injectedKey?:string,
):Promise<FalPhotographyJob>{
  const brief=schoolPhotographyBrief(template,role);
  const response=await fetch(endpoint,{
    method:"POST",headers:{
      ...headers(injectedKey),
      // Preserve the result in request history while R2 ingestion completes.
      // This is not an instruction to generate any additional images.
      "X-Fal-Store-IO":"1",
    },
    body:JSON.stringify({
      prompt:brief.prompt,aspect_ratio:brief.aspect_ratio,
      resolution:"4K",output_format:"jpeg",
      limit_generations:true,enable_web_search:false,
      enable_image_search:false,
      safety_tolerance:"2",
    }),
  });
  const data=await safeJson(response);
  if(typeof data.request_id!=="string"||!uuid.test(data.request_id))
    throw new Error("fal.ai did not return a valid request identifier");
  // Preserve the canonical provider-provided result/status links, as the
  // queue API can route these differently from the original submit URL.
  const checkQueueUrl=(value:unknown,kind:"result"|"status"):string|undefined=>{
    if(typeof value!=="string")return undefined;
    const target=new URL(value);
    const base=`/fal-ai/nano-banana-2/requests/${data.request_id}`;
    if(target.protocol!=="https:"||target.hostname!=="queue.fal.run"||
       target.pathname!==(kind==="status"?base+"/status":base))
      throw new Error("fal.ai returned an unexpected queue URL");
    return target.toString();
  };
  return {requestId:data.request_id,
    responseUrl:checkQueueUrl(data.response_url,"result"),
    statusUrl:checkQueueUrl(data.status_url,"status"),
    template,role,
    proposedFilename:brief.filename,
    requestedWidth:brief.minimum.width,requestedHeight:brief.minimum.height};
}

/** Poll by validated ID only. Never follow URLs supplied by the provider. */
export async function schoolPhotoStatus(requestId:string,injectedKey?:string):Promise<"IN_QUEUE"|"IN_PROGRESS"|"COMPLETED"> {
  if(!uuid.test(requestId))throw new Error("Invalid request identifier");
  const result=await safeJson(await fetch(`${endpoint}/requests/${requestId}/status`,{
    headers:headers(injectedKey),method:"GET",
  }));
  if(result.status!=="IN_QUEUE"&&result.status!=="IN_PROGRESS"&&result.status!=="COMPLETED")
    throw new Error("Unknown fal.ai queue state");
  return result.status;
}

/** Fetch an image reference only after review workflow has confirmed completion.
 * Returned provider URL is not a public CAN OS media URL and must never go into
 * the website image manifest before download, resolution/quality checks and R2 upload.
 */
export async function schoolPhotoResult(
  requestId:string,injectedKey?:string,providerResponseUrl?:string,
):Promise<{imageUrl:string}> {
  if(!uuid.test(requestId))throw new Error("Invalid request identifier");
  let resultUrl=`${endpoint}/requests/${requestId}`;
  if(providerResponseUrl){
    const candidate=new URL(providerResponseUrl);
    if(candidate.protocol!=="https:"||candidate.hostname!=="queue.fal.run"||
       candidate.pathname!==`/fal-ai/nano-banana-2/requests/${requestId}`)
      throw Error("Unsupported fal.ai result URL");
    resultUrl=candidate.toString();
  }
  const result=await safeJson(await fetch(resultUrl,{
    headers:headers(injectedKey),method:"GET",
  }));
  const images=result.images;
  if(!Array.isArray(images)||images.length!==1)throw new Error("Expected exactly one generated photo");
  const photo=images[0] as Record<string,unknown>;
  if(typeof photo?.url!=="string")throw new Error("Image URL missing");
  const url=new URL(photo.url);
  if(url.protocol!=="https:")throw new Error("Invalid image URL scheme");
  return {imageUrl:url.toString()};
}
