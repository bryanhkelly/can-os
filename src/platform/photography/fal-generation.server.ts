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

function credentials(injectedKey?:string):string {
  // Secret-manager fields sometimes include trailing line endings from paste.
  // Never put raw untrimmed secrets into HTTP header values.
  const key=(injectedKey ?? process.env.FAL_KEY)?.trim();
  if(!key)throw new Error("FAL_KEY is not configured on the server");
  if(/[\\r\\n\\x00-\\x1F\\x7F]/.test(key))
    throw new Error("FAL_KEY contains invalid HTTP header characters");
  return key;
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
    method:"POST",headers:headers(injectedKey),
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
  return {requestId:data.request_id,template,role,
    proposedFilename:brief.filename,
    requestedWidth:brief.minimum.width,requestedHeight:brief.minimum.height};
}

/** Poll by validated ID only. Never follow URLs supplied by the provider. */
export async function schoolPhotoStatus(requestId:string,injectedKey?:string):Promise<"IN_QUEUE"|"IN_PROGRESS"|"COMPLETED"> {
  if(!uuid.test(requestId))throw new Error("Invalid request identifier");
  const result=await safeJson(await fetch(`${endpoint}/requests/${requestId}/status`,{
    headers:headers(injectedKey),method:"GET",cache:"no-store",
  }));
  if(result.status!=="IN_QUEUE"&&result.status!=="IN_PROGRESS"&&result.status!=="COMPLETED")
    throw new Error("Unknown fal.ai queue state");
  return result.status;
}

/** Fetch an image reference only after review workflow has confirmed completion.
 * Returned provider URL is not a public CAN OS media URL and must never go into
 * the website image manifest before download, resolution/quality checks and R2 upload.
 */
export async function schoolPhotoResult(requestId:string,injectedKey?:string):Promise<{imageUrl:string}> {
  if(!uuid.test(requestId))throw new Error("Invalid request identifier");
  const result=await safeJson(await fetch(`${endpoint}/requests/${requestId}`,{
    headers:headers(),method:"GET",cache:"no-store",
  }));
  const images=result.images;
  if(!Array.isArray(images)||images.length!==1)throw new Error("Expected exactly one generated photo");
  const photo=images[0] as Record<string,unknown>;
  if(typeof photo?.url!=="string")throw new Error("Image URL missing");
  const url=new URL(photo.url);
  if(url.protocol!=="https:")throw new Error("Invalid image URL scheme");
  return {imageUrl:url.toString()};
}
