import {siteTemplateIds,type SiteTemplateId} from "@/domain/site-theme";
import {schoolPhotographyBrief,templatePhotographyRoles} from "@/domain/template-photography-production";
import type {TemplatePhotographyRole} from "@/domain/template-sample-images";
import {normalizeFalKey,submitSchoolPhoto,schoolPhotoResult,schoolPhotoStatus} from "./fal-generation.server";
import {jpegDimensions} from "./scheduled-production.server";

/**
 * Native Cloudflare R2 binding, not an S3 presigned-URL client.
 * Access is granted by Wrangler to the existing private can-os bucket.
 */
export interface TemplatePhotoBucket {
  head(key:string):Promise<{size:number}|null>;
  list(options:{prefix:string;limit?:number}):Promise<{objects:Array<{key:string}>}>;
  get(key:string):Promise<{body:ReadableStream; text():Promise<string>}|null>;
  put(key:string,value:string|ArrayBuffer|ArrayBufferView,options?:{
    onlyIf?:{etagDoesNotMatch:string};
    httpMetadata?:{contentType:string};
  }):Promise<{key:string}|null>;
}
export interface PhotoWorkerEnv {
  TEMPLATE_PHOTO_BUCKET?:TemplatePhotoBucket;
  FAL_KEY?:string;
  CAN_TEMPLATE_PHOTOGRAPHY_GENERATE?:string;
  CAN_TEMPLATE_PHOTOGRAPHY_BULK?:string;
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
    ? "school-template-production/pilot-summit-20261108/hero.json"
    : `school-template-production/v1/${template}/${role}.json`;
const cursorKey="school-template-production/v1/cursor.json";
type JobState={
  status:"reserved"|"submitted"|"completed"|"rejected";
  requestId?:string;assetUrl?:string;reason?:string;updatedAt:string;
  rescueCount?:number;importAttempts?:number;
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
async function inspectFile(resultUrl:string,minimum:{width:number;height:number}):Promise<ArrayBuffer>{
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
  if(!result||!result.ok||
    Number(result.headers.get("content-length")||0)>25_000_000)
    throw Error("Generated file unavailable or exceeds size limit");
  const bytes=await result.arrayBuffer();
  if(bytes.byteLength<4096||bytes.byteLength>25_000_000)
    throw Error("Generated file has invalid size");
  const size=jpegDimensions(new Uint8Array(bytes));
  if(!size||size.width<minimum.width||size.height<minimum.height)
    throw Error("Generated photo does not meet required resolution");
  return bytes;
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
    return job.reason==="FAL_KEY contains invalid HTTP header characters";
  // Older reserved jobs can be retried only once, after a short cooling period.
  return job.status==="reserved" && (job.rescueCount??0)===0 &&
    job.updatedAt<legacyHeaderFailureCutoff &&
    Date.now()-Date.parse(job.updatedAt)>5*60*1000;
}
function safeError(error:unknown):string{
  if(!(error instanceof Error))return "Unknown provider submission failure";
  if(error.message.includes("FAL_KEY"))return error.message.slice(0,120);
  if(error.message.startsWith("fal.ai request failed with HTTP"))
    return error.message.slice(0,90);
  if(error.message==="Invalid header value.")return "Invalid Authorization header";
  const verifiableFailures=new Set([
    "Generated photo does not meet required resolution",
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
  job:JobState,falKey:string):Promise<"ready"|"pending"|"rejected">{
  if(!job.requestId)return "rejected";
  const stateKeyPath=stateKey(template,role);
  let stage="queue-status";
  let assetUrl=job.assetUrl;
  try{
    if(!assetUrl){
      // Existing completed Community request is explicitly confirmed by the
      // provider. For all other jobs poll the queue until COMPLETED.
      if(job.requestId!==communityHeroCompletedFalRequestId){
        const status=await schoolPhotoStatus(job.requestId,falKey);
        if(status!=="COMPLETED")return "pending";
      }
      stage="result-url";
      const completed=await schoolPhotoResult(job.requestId,falKey);
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
    const bytes=await inspectFile(assetUrl,brief.minimum);
    stage="r2-upload";
    const target=keyFor(template,role);
    // If another run already delivered the same slot, keep its verified object.
    if(!await bucket.head(target))
      await bucket.put(target,bytes,{onlyIf:{etagDoesNotMatch:"*"},
        httpMetadata:{contentType:"image/jpeg"}});
    if(!await bucket.head(target))throw Error("R2 file verification failed");
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
    const terminal=attempts>=8 ||
      reason.includes("Unsupported image source") ||
      reason.includes("does not meet required resolution") ||
      reason.includes("invalid size");
    await saveJob(bucket,stateKeyPath,{
      ...job,status:terminal?"rejected":"submitted",assetUrl,
      importAttempts:attempts,reason,updatedAt:now(),
    });
    console.error("CAN photo import attempt",{
      template,role,stage,attempts,terminal,reason,
    });
    return terminal?"rejected":"pending";
  }
}

export async function runBoundTemplatePhotoProduction(env:PhotoWorkerEnv):Promise<PhotoCronResult>{
  const result:PhotoCronResult={status:"disabled",scanned:0,submitted:0,
    uploaded:0,inProgress:0,rejected:0};
  if(env.CAN_TEMPLATE_PHOTOGRAPHY_GENERATE!=="true")return result;
  if(!env.TEMPLATE_PHOTO_BUCKET||!env.FAL_KEY)
    throw Error("Missing photography production binding or key");
  const bucket=env.TEMPLATE_PHOTO_BUCKET;
  result.status="active";
  let falKey:string;
  try{
    // fal.ai keys cannot contain whitespace; strip accidental paste formatting
    // locally before constructing the Authorization header.
    falKey=normalizeFalKey(env.FAL_KEY);
  }catch{
    console.error("CAN photo generation blocked: invalid FAL_KEY formatting");
    return result;
  }
  // Verify exactly one full-size, delivered photo before launching 83 jobs.
  // One paid Summit hero is the controlled, fresh end-to-end production test.
  // Never submit an 84-image batch until this image is verifiably in R2.
  const firstTemplate:"summit"="summit",firstRole:"hero"="hero";
  if(!await bucket.head(keyFor(firstTemplate,firstRole))){
    const key=stateKey(firstTemplate,firstRole);
    let job=await getJob(bucket,key);
    result.scanned++;
    if(job?.status==="submitted"&&job.requestId){
      const completed=await completePhoto(bucket,firstTemplate,firstRole,job,falKey);
      if(completed==="ready")result.uploaded++;
      else if(completed==="pending")result.inProgress++;
      else result.rejected++;
    }else if(!job||canRescue(job)){
      if(await queuePhoto(bucket,firstTemplate,firstRole,key,falKey,job??undefined))
        result.submitted++;
      else result.rejected++;
    }else if(job?.status==="rejected"){
      result.rejected++;
      console.error("CAN first hero requires intervention",{
        template:firstTemplate,role:firstRole,reason:job.reason??"unknown",
      });
    }
    // Never spend on secondary roles until the first real 4K hero is verified.
    return result;
  }

  // Explicit operator switch is needed for the full 84-image paid campaign.
  // The single Summit pilot runs without this switch.
  if(env.CAN_TEMPLATE_PHOTOGRAPHY_BULK!=="true")return result;

  // Revisit all pending queue IDs promptly. A cursor alone would require a
  // 70-minute round trip before polling the earliest submitted request.
  const jobs=await bucket.list({prefix:jobPrefix,limit:250});
  for(const object of jobs.objects){
    if(result.uploaded+result.inProgress+result.rejected>=5)break;
    const parts=object.key.split("/");
    if(parts.length!==4||parts[0]!=="school-template-production"||
       parts[1]!=="v1"||!parts[3].endsWith(".json"))continue;
    const templatePart=parts[2],rolePart=parts[3].slice(0,-5);
    if(!templateSet.has(templatePart)||!roleSet.has(rolePart))continue;
    const t=templatePart as SiteTemplateId,r=rolePart as TemplatePhotographyRole;
    if(await bucket.head(keyFor(t,r)))continue;
    const job=await getJob(bucket,object.key);
    if(job?.status==="submitted"&&job.requestId){
      const completed=await completePhoto(bucket,t,r,job,falKey);
      if(completed==="ready")result.uploaded++;
      else if(completed==="pending")result.inProgress++;
      else result.rejected++;
    }else if(job&&canRescue(job)){
      if(await queuePhoto(bucket,t,r,object.key,falKey,job))
        result.submitted++;
      else result.rejected++;
    }
  }

  // Submit new jobs slowly, and stop on the first provider rejection.
  const cursor=await getCursor(bucket);
  let advance=0;
  for(;advance<6;advance++){
    if(result.submitted>=2||result.rejected>0)break;
    const {template,role}=keys[(cursor+advance)%keys.length]!;
    result.scanned++;
    if(await bucket.head(keyFor(template,role)))continue;
    const key=stateKey(template,role),job=await getJob(bucket,key);
    if(job)continue;
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
  try {
    const obj=await bucket.get(keyFor(template,role));
    if(!obj)return invalid();
    return new Response(obj.body,{headers:{
      "Content-Type":"image/jpeg","Cache-Control":"public, max-age=900",
      "X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer",
    }});
  }catch{return unavailable();}
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
    const heroJob=await getJob(bucket,stateKey(t,"hero"));
    return Response.json({template:t,generated:ready.length,total:12,ready,
      heroStatus:heroJob?.status??"unstarted",
      heroError:heroJob?.status==="rejected" ||
        (heroJob?.status==="submitted"&&heroJob.importAttempts)
          ?heroJob.reason:undefined,
      heroImportAttempts:heroJob?.importAttempts??0,
      active:env.CAN_TEMPLATE_PHOTOGRAPHY_GENERATE==="true"},{headers:{
      "Cache-Control":"public, max-age=30","X-Content-Type-Options":"nosniff",
    }});
  }catch{return unavailable();}
}
