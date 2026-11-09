import {siteTemplateIds,type SiteTemplateId} from "@/domain/site-theme";
import {schoolPhotographyBrief,templatePhotographyRoles} from "@/domain/template-photography-production";
import type {TemplatePhotographyRole} from "@/domain/template-sample-images";
import {normalizeFalKey,submitSchoolPhoto,schoolPhotoResult} from "./fal-generation.server";
import {verifyPhotoBytes,verifyPhotoAspectRatio,type VerifiedPhoto} from "./photo-binary.server";
import {allowedTemplateVariantWidth} from "@/domain/template-photo-responsive";
import {advanceTemplatePhotoReset,readTemplatePhotoResetState,PHOTO_RESET_ID} from "./r2-photo-reset.server";

/**
 * Native Cloudflare R2 binding, not an S3 presigned-URL client.
 * Access is granted by Wrangler to the existing private can-os bucket.
 */
export interface TemplatePhotoBucket {
  head(key:string):Promise<{size:number;httpMetadata?:{contentType?:string}}|null>;
  delete?(key:string):Promise<void>;
  list(options:{prefix:string;limit?:number}):Promise<{objects:Array<{key:string}>}>;
  get(key:string):Promise<{body:ReadableStream; text():Promise<string>;httpMetadata?:{contentType?:string}}|null>;
  put(key:string,value:string|ArrayBuffer|ArrayBufferView|ReadableStream,options?:{
    onlyIf?:{etagDoesNotMatch:string};
    httpMetadata?:{contentType:string};
  }):Promise<{key:string}|null>;
}
/** Cloudflare Images binding transforms private R2 byte streams on demand. */
export interface TemplatePhotoImages {
  input(source:ReadableStream):{
    transform(options:{width:number}):{
      output(options:{format:"image/webp";quality:number}):{
        response(options?:{headers:HeadersInit}):Promise<Response>|Response;
      };
    };
  };
}
export interface PhotoWorkerEnv {
  TEMPLATE_PHOTO_BUCKET?:TemplatePhotoBucket;
  IMAGES?:TemplatePhotoImages;
  FAL_KEY?:string;
  CAN_TEMPLATE_PHOTOGRAPHY_GENERATE?:string;
  CAN_TEMPLATE_PHOTOGRAPHY_SUBMIT?:string;
  CAN_TEMPLATE_PHOTOGRAPHY_BULK?:string;
  CAN_TEMPLATE_PHOTO_RESET_ONCE?:string;
  CAN_TEMPLATE_PHOTO_RECOVER_HISTORY?:string;
  CAN_TEMPLATE_PHOTO_RESPONSIVE_ENABLED?:string;
}
const templateSet=new Set<string>(siteTemplateIds);
const roleSet=new Set<string>(templatePhotographyRoles);
const family:Record<SiteTemplateId,string>={
  heritage:"heritage",community:"community",modern:"modern",
  "bright-futures":"bright",summit:"summit",classic:"classic",campus:"campus",
};
const keyFor=(template:SiteTemplateId,role:TemplatePhotographyRole)=>
  `school-template-previews/v3/${family[template]}/${role}.jpg`;
const stateKey=(template:SiteTemplateId,role:TemplatePhotographyRole)=>
  template==="summit"&&role==="hero"
    ? "school-template-production/pilot-summit-20261109/hero.json"
    : `school-template-production/v1/${template}/${role}.json`;
const cursorKey="school-template-production/v1/cursor.json";
const r2ProbeKey="school-template-maintenance/r2-write-verified.json";
type JobState={
  status:"reserved"|"submitted"|"completed"|"rejected";
  requestId?:string;resultUrl?:string;statusUrl?:string;
  assetUrl?:string;reason?:string;updatedAt:string;
  rescueCount?:number;importAttempts?:number;nextAttemptAt?:string;
};
const now=()=>new Date().toISOString();
const noStore={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
const unavailable=()=>Response.json({error:"Template photography storage unavailable"},{status:503,headers:noStore});
const invalid=()=>new Response("Not found",{status:404,headers:noStore});
const keys=templatePhotographyRoles.flatMap(role=>
  siteTemplateIds.map(template=>({template,role})));
const allowedGeneratedHost=(host:string,path:string)=>
  host==="fal.media"||host.endsWith(".fal.media")||
  host==="storage.googleapis.com"&&path.startsWith("/falserverless/");

/**
 * Download generated media via a tightly constrained HTTPS CDN allowlist.
 * fal's storage domain can legitimately redirect to its object storage; follow
 * no more than two redirects, validating EVERY new destination before fetching.
 */
async function inspectFile(resultUrl:string,minimum:{width:number;height:number}):Promise<VerifiedPhoto>{
  let url=new URL(resultUrl);
  let result:Response|undefined;
  for(let redirects=0;redirects<=2;redirects++){
    if(url.protocol!=="https:"||!allowedGeneratedHost(url.hostname,url.pathname))
      throw Error("Unsupported image source");
    result=await fetch(url.toString(),{method:"GET",redirect:"manual"});
    if(![301,302,303,307,308].includes(result.status))break;
    if(redirects===2)throw Error("Media redirect limit exceeded");
    const target=result.headers.get("location");
    if(!target)throw Error("Missing media redirect location");
    url=new URL(target,url);
    result=undefined;
  }
  if(!result)throw Error("Generated media response missing");
  if(!result.ok)throw Error(`Generated media HTTP ${result.status}`);
  if(Number(result.headers.get("content-length")||0)>25_000_000)
    throw Error("Generated file unavailable or exceeds size limit");
  // Materialize the media bytes BEFORE R2 PUT. Never pass the CDN URL as
  // an object body or infer media type from a misleading .jpg key suffix.
  const bytes=await result.arrayBuffer();
  return verifyPhotoBytes(bytes,minimum);
}

/**
 * One-time Worker-to-R2 binary write/read verification.
 * No provider calls and no paid image generation. This distinguishes a broken
 * R2 binding from fal queue/CDN transfer failures.
 */
async function verifyNativeR2Write(bucket:TemplatePhotoBucket):Promise<void>{
  const previous=await bucket.get(r2ProbeKey);
  if(previous){
    const data=await previous.text();
    try{
      if((JSON.parse(data) as {verified?:boolean}).verified===true)return;
    }catch{/* Probe is corrupt; verify a fresh round trip below. */}
  }
  const payload=JSON.stringify({verified:true,checkedAt:now()});
  await bucket.put(r2ProbeKey,payload,{httpMetadata:{contentType:"application/json"}});
  const copy=await bucket.get(r2ProbeKey);
  if(!copy||(await copy.text())!==payload)
    throw Error("R2 write/read verification failed");
}

async function getJob(bucket:TemplatePhotoBucket,key:string):Promise<JobState|null>{
  const object=await bucket.get(key);
  if(!object)return null;
  const state=JSON.parse(await object.text()) as JobState;
  if(!["reserved","submitted","completed","rejected"].includes(state.status))
    throw new Error("Invalid persisted image job state");
  return state;
}
async function saveJob(bucket:TemplatePhotoBucket,key:string,state:JobState,onlyNew=false):Promise<boolean>{
  const result=await bucket.put(key,JSON.stringify(state),{
    ...(onlyNew?{onlyIf:{etagDoesNotMatch:"*"}}:{}),
    httpMetadata:{contentType:"application/json"},
  });
  return result!==null;
}
async function getCursor(bucket:TemplatePhotoBucket):Promise<number>{
  const object=await bucket.get(cursorKey);
  if(!object)return 0;
  const parsed=JSON.parse(await object.text()) as {index?:unknown};
  return typeof parsed.index==="number"&&Number.isInteger(parsed.index)&&
    parsed.index>=0&&parsed.index<keys.length?parsed.index:0;
}
async function setCursor(bucket:TemplatePhotoBucket,index:number):Promise<void>{
  await bucket.put(cursorKey,JSON.stringify({index,updatedAt:now()}),{
    httpMetadata:{contentType:"application/json"},
  });
}

export type PhotoCronResult={status:"disabled"|"active";scanned:number;submitted:number;
  uploaded:number;inProgress:number;rejected:number};

/**
 * Cloudflare cron generation is deliberately staged:
 * 1) Make and verify the Community hero before spending on the other 83.
 * 2) Poll submitted queue jobs each tick, independent of the submission cursor.
 * 3) Issue at most two new billable requests per tick after the hero succeeds.
 *
 * Four pre-fix reservations from the Nov 8 invalid-header incident are eligible
 * for a single carefully bounded recovery: their provider HTTP request was
 * never sent, because the invalid header failed request construction.
 */
/**
 * One-time, non-billable reconciliation for the Community & Faith hero already
 * generated successfully on fal.ai (HTTP 200, user-provided request details
 * dated 2026-11-08). Resolve the provider result rather than re-generating.
 * Remove this recovery hint after verifying the canonical R2 JPEG.
 */
const communityHeroCompletedFalRequestId="01a1bd6d-371f-7153-8d96-484fa643cac1";
export function canAdoptCompletedCommunityHero(job:JobState|null):boolean{
  if(!job)return true;
  if(job.status==="completed"||job.status==="submitted")return false;
  // Never overwrite a different accepted request ID: its billing/status may
  // still be valid even if an earlier transfer failed.
  if(job.requestId && job.requestId!==communityHeroCompletedFalRequestId)return false;
  // Never repeatedly retry a rejected transfer of this already-known image.
  if(job.requestId===communityHeroCompletedFalRequestId)
    return job.status==="rejected" && (job.rescueCount??0)===0;
  // Old preflight failures or reserved jobs never reached fal.ai.
  return (job.status==="reserved" &&
      Date.now()-Date.parse(job.updatedAt)>5*60*1000) ||
    (job.status==="rejected" &&
      job.reason==="FAL_KEY contains invalid HTTP header characters");
}
const legacyHeaderFailureCutoff="2026-11-08T19:50:00.000Z";
const jobPrefix="school-template-production/v1/";
function canRescue(job:JobState):boolean{
  // Never repeat a job that has a provider request ID: it might be billable.
  if(job.requestId)return false;
  // Only this exact local preflight error is guaranteed to have happened
  // before any request reached fal.ai. Once the key is replaced, a single
  // submission can proceed. A subsequent provider rejection has a different
  // reason and will not be retried automatically.
  if(job.status==="rejected")
    return (job.rescueCount??0)===0 &&
      job.reason==="FAL_KEY contains invalid HTTP header characters";
  // Older reserved jobs can be retried only once, after a short cooling period.
  return job.status==="reserved" && (job.rescueCount??0)===0 &&
    job.updatedAt<legacyHeaderFailureCutoff &&
    Date.now()-Date.parse(job.updatedAt)>5*60*1000;
}
function safeError(error:unknown):string{
  if(!(error instanceof Error))return "Unknown provider submission failure";
  if(error.message.includes("FAL_KEY"))return error.message.slice(0,120);
  if(error.message.startsWith("fal.ai request failed with HTTP")||
     /^Generated media HTTP [0-9]{3}$/.test(error.message)||
     /^fal history HTTP [0-9]{3}$/.test(error.message)||
     error.message==="fal history response missing items"||
     error.message==="Completed media is not yet available for import")
    return error.message.slice(0,90);
  if(error.message==="Invalid header value.")return "Invalid Authorization header";
  const verifiableFailures=new Set([
    "Generated photo does not meet required resolution",
    "Generated photo does not match required aspect ratio",
    "Unsupported image source",
    "Generated file unavailable or exceeds size limit",
    "Generated file has invalid size",
    "R2 file verification failed",
    "Expected exactly one generated photo",
    "Image URL missing",
    "Unknown fal.ai queue state",
    "Media redirect limit exceeded",
    "Missing media redirect location",
  ]);
  if(verifiableFailures.has(error.message))return error.message;
  return error.name==="TypeError"?"Provider connection failed":error.name.slice(0,64);
}
async function queuePhoto(bucket:TemplatePhotoBucket,
  template:SiteTemplateId,role:TemplatePhotographyRole,key:string,
  falKey:string,rescueJob?:JobState):Promise<boolean>{
  // A durable reservation is persisted before invoking a billable provider.
  // Rescue existing known-bad header reservations once, never indefinitely.
  const rescueCount=rescueJob?1:0;
  if(rescueJob){
    await saveJob(bucket,key,{status:"reserved",rescueCount,updatedAt:now()});
  }else{
    const acquired=await saveJob(bucket,key,{status:"reserved",updatedAt:now()},true);
    if(!acquired)return false;
  }
  try{
    const response=await submitSchoolPhoto(template,role,falKey);
    await saveJob(bucket,key,{status:"submitted",requestId:response.requestId,
      resultUrl:response.responseUrl,statusUrl:response.statusUrl,
      rescueCount,updatedAt:now()});
    return true;
  }catch(error){
    // Do not retry a failed request automatically: some network failures are
    // ambiguous about whether the provider accepted and charged for the work.
    await saveJob(bucket,key,{status:"rejected",rescueCount,
      reason:safeError(error),updatedAt:now()});
    console.error("CAN photo submission rejected",{
      template,role,reason:safeError(error),
    });
    return false;
  }
}
/**
 * At-most-once *generation* and retryable *ingestion*. Persist the completed
 * asset URL BEFORE downloading: a failed R2 write must never pay to regenerate.
 * Native R2 state is private; the website status endpoint never exposes URLs.
 */
async function completePhoto(bucket:TemplatePhotoBucket,
  template:SiteTemplateId,role:TemplatePhotographyRole,
  job:JobState,falKey:string,jobPath=stateKey(template,role)):Promise<"ready"|"pending"|"rejected">{
  if(!job.requestId)return "rejected";
  const stateKeyPath=jobPath;
  let stage="queue-status";
  let assetUrl=job.assetUrl;
  try{
    if(!assetUrl){
      // Fetch the completed result directly. fal's result endpoint returns
      // images[0].url; a separate queue-status network hop is unnecessary and
      // was preventing completed requests from reaching R2 when it failed.
      stage="result-url";
      const completed=await schoolPhotoResult(job.requestId,falKey,job.resultUrl);
      assetUrl=completed.imageUrl;
      // Check source before persisting potentially untrusted API output.
      const source=new URL(assetUrl);
      if(source.protocol!=="https:" ||
        !allowedGeneratedHost(source.hostname,source.pathname))
        throw Error("Unsupported image source");
      await saveJob(bucket,stateKeyPath,{
        ...job,status:"submitted",assetUrl,updatedAt:now(),
      });
    }
    stage="download";
    const brief=schoolPhotographyBrief(template,role);
    const photo=await inspectFile(assetUrl,brief.minimum);
    verifyPhotoAspectRatio(photo,brief.aspect_ratio);
    stage="r2-upload";
    const target=keyFor(template,role);
    // If another run already delivered the same slot, keep its verified object.
    if(!await bucket.head(target))
      await bucket.put(target,photo.bytes,{onlyIf:{etagDoesNotMatch:"*"},
        httpMetadata:{contentType:photo.contentType}});
    const verified=await bucket.head(target);
    if(!verified||verified.size!==photo.bytes.byteLength)
      throw Error("R2 file verification failed");
    await saveJob(bucket,stateKeyPath,{
      status:"completed",requestId:job.requestId,updatedAt:now(),
    });
    console.info("CAN photo verified in R2",{template,role});
    return "ready";
  }catch(error){
    // Source/network/provider outage can be retried. Never re-submit the image
    // request, and never lose the known completed asset URL.
    const attempts=(job.importAttempts??0)+1;
    const reason=stage+":"+safeError(error);
    const terminal=attempts>=30 ||
      reason.includes("Unsupported image source") ||
      reason.includes("does not meet required resolution") ||
      reason.includes("does not match required aspect ratio") ||
      reason.includes("invalid size");
    // Network failures are non-billable; back off instead of rejecting the
    // already-paid fal result permanently after a few cron ticks.
    const retryDelayMs=Math.min(60*60*1000,15_000*2**Math.min(attempts,8));
    await saveJob(bucket,stateKeyPath,{
      ...job,status:terminal?"rejected":"submitted",assetUrl,
      importAttempts:attempts,reason,updatedAt:now(),
      nextAttemptAt:terminal?undefined:new Date(Date.now()+retryDelayMs).toISOString(),
    });
    console.error("CAN photo import attempt",{
      template,role,stage,attempts,terminal,reason,
    });
    return terminal?"rejected":"pending";
  }
}

/**
 * fal.ai Platform API: read-only request history with stored input/output.
 * This recovers existing paid images even if an old queue GET has expired or
 * a job's request_id was lost from R2 after the model completed.
 *
 * NEVER POST to fal.ai, never use a dashboard/cookie login, never auto-generate.
 */
const falHistoryKey="school-template-production/v1/fal-history-recovery.json";
type FalHistoryDiagnostic={
  checkedAt:string;state:"running"|"imported"|"no-match"|"error";
  matching:number;uploaded:number;archived?:number;
  reason?:string;nextCheckAt?:string;
};
const allowedHistoryStart="2026-11-08T00:00:00Z";
async function readHistoryDiagnostic(bucket:TemplatePhotoBucket):Promise<FalHistoryDiagnostic|null>{
  const obj=await bucket.get(falHistoryKey);
  if(!obj)return null;
  try{return JSON.parse(await obj.text()) as FalHistoryDiagnostic;}catch{return null;}
}
async function writeHistoryDiagnostic(bucket:TemplatePhotoBucket,diagnostic:FalHistoryDiagnostic){
  await bucket.put(falHistoryKey,JSON.stringify(diagnostic),{
    httpMetadata:{contentType:"application/json"},
  });
}
function templateFromSavedPrompt(input:unknown):"summit"|"community"|null{
  if(!input||typeof input!=="object")return null;
  const prompt=(input as {prompt?:unknown}).prompt;
  if(typeof prompt!=="string")return null;
  if(prompt.startsWith("Summit Preparatory:"))return "summit";
  if(prompt.startsWith("Community & Faith:"))return "community";
  return null;
}
function extractHistoryImage(output:unknown):string|null{
  if(!output||typeof output!=="object")return null;
  const images=(output as {images?:unknown}).images;
  if(!Array.isArray(images)||images.length!==1)return null;
  const url=(images[0] as {url?:unknown}|null)?.url;
  return typeof url==="string"?url:null;
}
async function importAlreadyGeneratedFalHistory(bucket:TemplatePhotoBucket,
  falKey:string):Promise<{uploaded:number;matched:number}>{
  const previous=await readHistoryDiagnostic(bucket);
  if(previous?.nextCheckAt&&Date.parse(previous.nextCheckAt)>Date.now())
    return {uploaded:0,matched:0};
  const base:FalHistoryDiagnostic={
    state:"running",checkedAt:now(),matching:0,uploaded:0,archived:0,
  };
  await writeHistoryDiagnostic(bucket,base);
  let diagnostic:FalHistoryDiagnostic={...base,state:"no-match"};
  try{
    const url=new URL("https://api.fal.ai/v1/models/requests/by-endpoint");
    url.searchParams.set("endpoint_id","fal-ai/nano-banana-2");
    url.searchParams.set("start",allowedHistoryStart);
    url.searchParams.set("status","success");
    url.searchParams.set("expand","payloads");
    url.searchParams.set("limit","50");
    const response=await fetch(url.toString(),{
      method:"GET",headers:{
        "Authorization":`Key ${falKey}`,"Accept":"application/json",
      },redirect:"error",
    });
    if(!response.ok)throw Error(`fal history HTTP ${response.status}`);
    const json=await response.json() as {items?:unknown};
    if(!Array.isArray(json.items))throw Error("fal history response missing items");
    const tried=new Set<string>();
    let checked=0;
    for(const request of json.items){
      if(checked>=6)break;
      if(!request||typeof request!=="object")continue;
      const item=request as {
        request_id?:unknown;endpoint_id?:unknown;status_code?:unknown;
        json_input?:unknown;json_output?:unknown;
      };
      if(item.endpoint_id!=="fal-ai/nano-banana-2"||item.status_code!==200)continue;
      const template=templateFromSavedPrompt(item.json_input);
      if(!template)continue;
      const requestId=item.request_id;
      if(typeof requestId!=="string"||
         !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(requestId)||
         tried.has(requestId))continue;
      tried.add(requestId);
      const source=extractHistoryImage(item.json_output);
      if(!source)continue;
      diagnostic.matching++;
      // Keep all already-paid outputs, including both Summit alternatives.
      // The first valid photo is mapped to hero; other variants are retained
      // in a private R2 archive without overwriting the selected photograph.
      const archiveKey=`school-template-previews/v3/_archive/${template}/${requestId}.jpg`;
      const fileKey=keyFor(template,"hero");
      if(await bucket.head(archiveKey) && await bucket.head(fileKey))continue;
      checked++;
      try{
        const brief=schoolPhotographyBrief(template,"hero");
        const photo=await inspectFile(source,brief.minimum);
        verifyPhotoAspectRatio(photo,brief.aspect_ratio);
        if(!await bucket.head(archiveKey)){
          await bucket.put(archiveKey,photo.bytes,{
            onlyIf:{etagDoesNotMatch:"*"},
            httpMetadata:{contentType:photo.contentType},
          });
          diagnostic.archived=(diagnostic.archived??0)+1;
        }
        const archive=await bucket.head(archiveKey);
        if(!archive||archive.size!==photo.bytes.byteLength)
          throw Error("R2 archive verification failed");
        if(!await bucket.head(fileKey)){
          await bucket.put(fileKey,photo.bytes,{
            onlyIf:{etagDoesNotMatch:"*"},
            httpMetadata:{contentType:photo.contentType},
          });
          const head=await bucket.head(fileKey);
          if(!head||head.size!==photo.bytes.byteLength)
            throw Error("R2 file verification failed");
          await saveJob(bucket,stateKey(template,"hero"),{
            status:"completed",requestId,updatedAt:now(),
          });
          diagnostic.uploaded++;
          diagnostic.state="imported";
        }
        console.info("CAN completed fal media copied to R2",{template,
          role:"hero",bytes:photo.bytes.byteLength});
      }catch(error){
        // Continue to the other already-paid Summit request. Never re-generate.
        diagnostic.reason=safeError(error);
        console.error("CAN saved fal media transfer failed",{template,
          reason:diagnostic.reason});
      }
    }
    if(await bucket.head(keyFor("summit","hero")) ||
       await bucket.head(keyFor("community","hero"))){
      diagnostic.state="imported";
      if(!diagnostic.uploaded)diagnostic.reason=undefined;
    }else if(diagnostic.uploaded===0&&diagnostic.matching>0){
      diagnostic.state="error";
      diagnostic.reason??="Completed media is not yet available for import";
    }
  }catch(error){
    diagnostic.state="error";
    diagnostic.reason=safeError(error);
    console.error("CAN fal request-history recovery unavailable",{reason:diagnostic.reason});
  }
  diagnostic.checkedAt=now();
  diagnostic.nextCheckAt=new Date(Date.now()+3*60*1000).toISOString();
  await writeHistoryDiagnostic(bucket,diagnostic);
  return {uploaded:diagnostic.uploaded,matched:diagnostic.matching};
}

/**
 * Production cron has two separate responsibilities:
 * (1) Ingest previously generated (already billable) fal.ai request IDs.
 * (2) Submit NEW requests ONLY after explicit CAN_TEMPLATE_PHOTOGRAPHY_SUBMIT
 *     opt-in. Disabling new billing does NOT disable ingestion.
 *
 * R2 stores job state durably so there is no duplicate paid POST on each tick.
 */
export async function runBoundTemplatePhotoProduction(env:PhotoWorkerEnv):Promise<PhotoCronResult>{
  const result:PhotoCronResult={status:"disabled",scanned:0,submitted:0,
    uploaded:0,inProgress:0,rejected:0};
  if(env.CAN_TEMPLATE_PHOTOGRAPHY_GENERATE!=="true")return result;
  if(!env.TEMPLATE_PHOTO_BUCKET)
    throw Error("Missing template photography R2 bucket binding");
  const bucket=env.TEMPLATE_PHOTO_BUCKET;
  // A bounded archival reset must complete before existing result imports or
  // any paid new job submissions. Reset is one-time and idempotent in R2.
  if(env.CAN_TEMPLATE_PHOTO_RESET_ONCE===PHOTO_RESET_ID){
    const state=await advanceTemplatePhotoReset(bucket);
    console.info("CAN template photo reset tick",{
      phase:state.phase,removed:state.removed,copied:state.copied,
      reason:state.reason,
    });
    if(state.phase!=="completed")return result;
  }
  if(!env.FAL_KEY)throw Error("Missing FAL_KEY for active photography ingestion");
  const falKey=normalizeFalKey(env.FAL_KEY);
  result.status="active";
  // Prove the native binding can write and read before attempting a media PUT.
  await verifyNativeR2Write(bucket);

  // Recover the already-paid Community photograph without calling fal.ai's
  // billable submission endpoint. Never overwrite a different accepted job.
  const communityKey=stateKey("community","hero");
  // Never repopulate freshly reset R2 folders with old November images.
  // Historical recovery must be separately opted into by an operator.
  if(env.CAN_TEMPLATE_PHOTO_RECOVER_HISTORY==="true" &&
      !await bucket.head(keyFor("community","hero"))){
    const community=await getJob(bucket,communityKey);
    if(canAdoptCompletedCommunityHero(community)){
      await saveJob(bucket,communityKey,{
        status:"submitted",requestId:communityHeroCompletedFalRequestId,
        rescueCount:1,updatedAt:now(),
      });
      console.info("CAN photography adopted existing Community fal request");
    }
  }

  // The Summit pilot has its own durable state path. Older Summit requests
  // may also exist under /v1; process BOTH, but upload to only one JPEG slot.
  const pilotKey=stateKey("summit","hero");
  const historical=await bucket.list({prefix:jobPrefix,limit:250});
  const candidates:Array<{path:string;template:SiteTemplateId;role:TemplatePhotographyRole}>=[
    {path:pilotKey,template:"summit",role:"hero"},
  ];
  for(const object of historical.objects){
    const parts=object.key.split("/");
    if(parts.length!==4||parts[0]!=="school-template-production"||
       parts[1]!=="v1"||!parts[3].endsWith(".json"))continue;
    const t=parts[2],r=parts[3].slice(0,-5);
    if(!templateSet.has(t)||!roleSet.has(r))continue;
    candidates.push({
      path:object.key,template:t as SiteTemplateId,role:r as TemplatePhotographyRole,
    });
  }
  candidates.sort((a,b)=>Number(b.role==="hero")-Number(a.role==="hero"));
  let processed=0;
  for(const candidate of candidates){
    if(processed>=6)break;
    const job=await getJob(bucket,candidate.path);
    if(!job)continue;
    result.scanned++;
    const key=keyFor(candidate.template,candidate.role);
    if(await bucket.head(key)){
      // Reconcile legacy state without additional provider calls.
      if(job.status!=="completed"&&job.requestId)
        await saveJob(bucket,candidate.path,{
          status:"completed",requestId:job.requestId,updatedAt:now(),
        });
      continue;
    }
    // Accepted fal request IDs can be re-fetched without paying again.
    // Previous "rejected" state is not proof an already-paid image is lost.
    if(!job.requestId||!["submitted","rejected"].includes(job.status))continue;
    const attempts=job.importAttempts??0;
    if(attempts>=30)continue;
    if(job.nextAttemptAt&&Date.parse(job.nextAttemptAt)>Date.now())continue;
    if(job.reason?.includes("Unsupported image source")||
       job.reason?.includes("does not meet required resolution"))continue;
    processed++;
    const outcome=await completePhoto(bucket,candidate.template,candidate.role,
      job,falKey,candidate.path);
    if(outcome==="ready")result.uploaded++;
    else if(outcome==="pending")result.inProgress++;
    else result.rejected++;
  }

  // The generated images visible in fal.ai show we've submitted enough.
  // Never create more paid images by default, including after job failure.
  if(env.CAN_TEMPLATE_PHOTOGRAPHY_SUBMIT!=="true"){
    // Read-only historical recovery does not send any billable model request.
    // A clean 84-image rebuild must not import superseded fal.ai outputs.
    if(env.CAN_TEMPLATE_PHOTO_RECOVER_HISTORY==="true"){
      const recovered=await importAlreadyGeneratedFalHistory(bucket,falKey);
      result.uploaded+=recovered.uploaded;
    }
    return result;
  }

  // Even when explicitly enabled, require a verified Summit hero BEFORE bulk.
  if(!await bucket.head(keyFor("summit","hero"))){
    const job=await getJob(bucket,pilotKey);
    if(!job){
      if(await queuePhoto(bucket,"summit","hero",pilotKey,falKey))
        result.submitted++;
      else result.rejected++;
    }
    return result;
  }
  if(env.CAN_TEMPLATE_PHOTOGRAPHY_BULK!=="true")return result;

  // Cost-safety gate: no more than two unsettled, billable requests and never
  // continue spending after a rejection. The job records are durable and
  // uniqueness is protected by conditional R2 reservations.
  const existing=await bucket.list({prefix:jobPrefix,limit:250});
  let inflight=0,billedSlots=1; // verified Summit hero uses one paid request
  let rejected=0;
  for(const object of existing.objects){
    const parts=object.key.split("/");
    if(parts.length!==4||parts[0]!=="school-template-production"||
       parts[1]!=="v1"||!parts[3].endsWith(".json"))continue;
    if(!templateSet.has(parts[2])||!roleSet.has(parts[3].slice(0,-5)))continue;
    const state=await getJob(bucket,object.key);
    if(!state)continue;
    billedSlots++;
    if(state.status==="submitted"||state.status==="reserved")inflight++;
    if(state.status==="rejected")rejected++;
  }
  if(rejected>0){
    console.error("CAN photography campaign paused after rejected job",{rejected});
    return result;
  }
  if(inflight>=2||billedSlots>=84)return result;

  const cursor=await getCursor(bucket);
  let advance=0;
  for(;advance<6;advance++){
    if(result.submitted>=2-inflight||result.rejected>0||billedSlots+result.submitted>=84)break;
    const {template,role}=keys[(cursor+advance)%keys.length]!;
    if(await bucket.head(keyFor(template,role)))continue;
    const key=stateKey(template,role);
    const existing=await getJob(bucket,key);
    // In-flight, completed, rejected, or reserved all prohibit a new charge.
    if(existing)continue;
    if(await queuePhoto(bucket,template,role,key,falKey))result.submitted++;
    else {result.rejected++;break;}
  }
  await setCursor(bucket,(cursor+advance)%keys.length);
  return result;
}

/** Private sample photos only. Real school-owned media is unrelated. */
export async function readBoundTemplatePhoto(request:Request,env:PhotoWorkerEnv):Promise<Response>{
  const bucket=env.TEMPLATE_PHOTO_BUCKET;
  if(!bucket)return unavailable();
  const match=new URL(request.url).pathname.match(/^\/template-photo\/([^/]+)\/([^/]+)$/);
  if(!match||!templateSet.has(match[1])||!roleSet.has(match[2]))return invalid();
  const template=match[1] as SiteTemplateId,role=match[2] as TemplatePhotographyRole;
  const url=new URL(request.url);
  const width=allowedTemplateVariantWidth(role,url.searchParams.get("w"));
  if(width===undefined)return invalid();
  try {
    const obj=await bucket.get(keyFor(template,role));
    if(!obj)return invalid();
    if(width!==null){
      // Each known width is generated on demand from the original private
      // R2 asset. There are no new fal.ai generation requests.
      if(!env.IMAGES)return unavailable();
      return await env.IMAGES.input(obj.body)
        .transform({width})
        .output({format:"image/webp",quality:80})
        .response({headers:{
          "Cache-Control":"public, max-age=86400, stale-while-revalidate=86400",
          "X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer",
        }});
    }
    return new Response(obj.body,{headers:{
      "Content-Type":obj.httpMetadata?.contentType??"image/jpeg",
      "Cache-Control":"public, max-age=900",
      "X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer",
    }});
  }catch(error){
    console.error("Template image delivery failed",{
      template,role,width,
      failure:error instanceof Error?error.name:"unknown",
    });
    return unavailable();
  }
}
export async function readBoundTemplatePhotoStatus(request:Request,env:PhotoWorkerEnv):Promise<Response>{
  const template=new URL(request.url).searchParams.get("template");
  if(!template||!templateSet.has(template))return invalid();
  const bucket=env.TEMPLATE_PHOTO_BUCKET;
  if(!bucket)return unavailable();
  try{
    const t=template as SiteTemplateId;
    const ready:string[]=[];
    for(const role of templatePhotographyRoles)
      if(await bucket.head(keyFor(t,role)))ready.push(role);
    // Safe, public operational signal without request IDs, secrets or prompts.
    const heroReady=ready.includes("hero");
    // A legacy Summit job may have uploaded a valid hero while the newer
    // isolated pilot record still shows rejected. R2 availability wins.
    let heroJob=await getJob(bucket,stateKey(t,"hero"));
    if(!heroReady && t==="summit"){
      const historical=await getJob(bucket,"school-template-production/v1/summit/hero.json");
      if(historical?.requestId &&
         (heroJob?.status!=="submitted" || !heroJob.requestId))
        heroJob=historical;
    }
    return Response.json({template:t,generated:ready.length,total:12,ready,
      heroStatus:heroReady?"completed":heroJob?.status??"unstarted",
      heroError:heroReady?undefined:(
        heroJob?.status==="rejected" ||
        (heroJob?.status==="submitted"&&heroJob.importAttempts)
          ?heroJob.reason:undefined),
      heroImportAttempts:heroJob?.importAttempts??0,
      heroLastAttemptAt:heroJob?.updatedAt,
      heroNextRetryAt:heroJob?.nextAttemptAt,
      newSubmissionsEnabled:env.CAN_TEMPLATE_PHOTOGRAPHY_SUBMIT==="true",
      responsiveDeliveryEnabled:env.CAN_TEMPLATE_PHOTO_RESPONSIVE_ENABLED==="true",
      uploadRecovery:await readHistoryDiagnostic(bucket),
      r2WriteVerified:Boolean(await bucket.head(r2ProbeKey)),
      photoReset:await readTemplatePhotoResetState(bucket),
      active:env.CAN_TEMPLATE_PHOTOGRAPHY_GENERATE==="true"},{headers:{
      "Cache-Control":"public, max-age=30","X-Content-Type-Options":"nosniff",
    }});
  }catch{return unavailable();}
}
