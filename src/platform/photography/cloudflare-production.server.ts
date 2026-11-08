import {siteTemplateIds,type SiteTemplateId} from "@/domain/site-theme";
import {schoolPhotographyBrief,templatePhotographyRoles} from "@/domain/template-photography-production";
import type {TemplatePhotographyRole} from "@/domain/template-sample-images";
import {submitSchoolPhoto,schoolPhotoResult,schoolPhotoStatus} from "./fal-generation.server";
import {jpegDimensions} from "./scheduled-production.server";

/**
 * Native Cloudflare R2 binding, not an S3 presigned-URL client.
 * Access is granted by Wrangler to the existing private can-os bucket.
 */
export interface TemplatePhotoBucket {
  head(key:string):Promise<{size:number}|null>;
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
  `school-template-production/v1/${template}/${role}.json`;
const cursorKey="school-template-production/v1/cursor.json";
type JobState={
  status:"reserved"|"submitted"|"completed"|"rejected";
  requestId?:string;reason?:string;updatedAt:string;
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

async function inspectFile(resultUrl:string,minimum:{width:number;height:number}):Promise<ArrayBuffer>{
  const url=new URL(resultUrl);
  if(url.protocol!=="https:"||!allowedGeneratedHost(url.hostname,url.pathname))
    throw new Error("Unsupported image source");
  const result=await fetch(url.toString(),{redirect:"error"});
  if(!result.ok||Number(result.headers.get("content-length")||0)>25_000_000)
    throw new Error("Generated file unavailable or exceeds size limit");
  const bytes=await result.arrayBuffer();
  if(bytes.byteLength<4096||bytes.byteLength>25_000_000)
    throw new Error("Generated file has invalid size");
  const size=jpegDimensions(new Uint8Array(bytes));
  if(!size||size.width<minimum.width||size.height<minimum.height)
    throw new Error("Generated photo does not meet required resolution");
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
 * Every 5m. Four new paid requests maximum per scheduled invocation, no
 * automatic reruns for rejected/reserved jobs. Cursor visits all 84 slots.
 * The R2 conditional reservation protects against parallel cron execution.
 */
export async function runBoundTemplatePhotoProduction(env:PhotoWorkerEnv):Promise<PhotoCronResult>{
  const result:PhotoCronResult={status:"disabled",scanned:0,submitted:0,
    uploaded:0,inProgress:0,rejected:0};
  if(env.CAN_TEMPLATE_PHOTOGRAPHY_GENERATE!=="true")return result;
  if(!env.TEMPLATE_PHOTO_BUCKET||!env.FAL_KEY)throw Error("Missing photography production binding or key");
  result.status="active";
  const bucket=env.TEMPLATE_PHOTO_BUCKET;
  const cursor=await getCursor(bucket);
  for(let offset=0;offset<6;offset++){
    const {template,role}=keys[(cursor+offset)%keys.length]!;
    result.scanned++;
    const target=keyFor(template,role);
    if(await bucket.head(target))continue;
    const jobKey=stateKey(template,role),job=await getJob(bucket,jobKey);
    if(!job){
      if(result.submitted>=4)continue;
      const reserved=await saveJob(bucket,jobKey,{status:"reserved",updatedAt:now()},true);
      if(!reserved)continue;
      // With a durable reservation, never retry a failed submission blindly:
      // an API error could occur after the provider has already charged.
      const submitted=await submitSchoolPhoto(template,role,env.FAL_KEY);
      await saveJob(bucket,jobKey,{status:"submitted",requestId:submitted.requestId,updatedAt:now()});
      result.submitted++;
      continue;
    }
    if(job.status==="rejected"){result.rejected++;continue;}
    if(job.status==="completed"||job.status==="reserved"||!job.requestId)continue;
    if(result.uploaded>=4)continue;
    try {
      const status=await schoolPhotoStatus(job.requestId,env.FAL_KEY);
      if(status!=="COMPLETED"){result.inProgress++;continue;}
      const brief=schoolPhotographyBrief(template,role);
      const photo=await schoolPhotoResult(job.requestId,env.FAL_KEY);
      const bytes=await inspectFile(photo.imageUrl,brief.minimum);
      await bucket.put(target,bytes,{onlyIf:{etagDoesNotMatch:"*"},
        httpMetadata:{contentType:"image/jpeg"}});
      if(!await bucket.head(target))throw Error("Generated file was not stored in R2");
      await saveJob(bucket,jobKey,{status:"completed",requestId:job.requestId,updatedAt:now()});
      result.uploaded++;
    } catch(error) {
      await saveJob(bucket,jobKey,{
        status:"rejected",requestId:job.requestId,
        reason:error instanceof Error?error.message.slice(0,160):"Unable to process generated file",
        updatedAt:now(),
      });
      result.rejected++;
    }
  }
  await setCursor(bucket,(cursor+6)%keys.length);
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
    return Response.json({template:t,generated:ready.length,total:12,ready,
      active:env.CAN_TEMPLATE_PHOTOGRAPHY_GENERATE==="true"},{headers:{
      "Cache-Control":"public, max-age=30","X-Content-Type-Options":"nosniff",
    }});
  }catch{return unavailable();}
}
