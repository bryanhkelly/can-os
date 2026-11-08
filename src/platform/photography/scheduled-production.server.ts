import {schoolPhotographyBrief,templatePhotographyRoles} from "@/domain/template-photography-production";
import {siteTemplateIds} from "@/domain/site-theme";
import {submitSchoolPhoto,schoolPhotoStatus,schoolPhotoResult} from "./fal-generation.server";
import {signPrivateObjectUrl} from "@/platform/storage/r2";

const photoKeyPattern=/^school-template-previews\/v3\/(?:heritage|community|modern|bright|summit|classic|campus)\/(?:hero|story_0[12]|program_0[123]|community_0[12]|admissions|portrait_0[123])\.jpg$/;
const stateKeyPattern=/^school-template-production\/v1\/(?:(?:heritage|community|modern|bright-futures|summit|classic|campus)\/(?:hero|story_0[12]|program_0[123]|community_0[12]|admissions|portrait_0[123])|cursor)\.json$/;
const family={heritage:"heritage",community:"community",modern:"modern","bright-futures":"bright",
  summit:"summit",classic:"classic",campus:"campus"} as const;
type State={status:"reserved"|"submitted"|"completed"|"rejected";requestId?:string;reason?:string};
const requestHeaders={"Cache-Control":"no-store"};
const keyFor=(template:keyof typeof family,role:string)=>
  `school-template-previews/v3/${family[template]}/${role}.jpg`;
const stateFor=(template:string,role:string)=>
  `school-template-production/v1/${template}/${role}.json`;

async function r2Read(key:string,pattern:RegExp):Promise<Response>{
  return fetch(signPrivateObjectUrl({method:"GET",key,keyPattern:pattern,expiresSeconds:60}),
    {redirect:"error",headers:requestHeaders});
}
async function r2Head(key:string):Promise<boolean>{
  const res=await fetch(signPrivateObjectUrl({method:"HEAD",key,keyPattern:photoKeyPattern,
    expiresSeconds:60}),{method:"HEAD",redirect:"error"});
  if(res.status===404)return false;
  if(!res.ok)throw Error("R2 availability verification failed");
  return true;
}
async function r2Write(key:string,pattern:RegExp,contents:Uint8Array,type:string,createOnly=false){
  const signed=signPrivateObjectUrl({method:"PUT",key,keyPattern:pattern,
    contentType:type,expiresSeconds:120,preventOverwrite:createOnly});
  const response=await fetch(signed,{method:"PUT",redirect:"error",
    headers:{"Content-Type":type,...(createOnly?{"If-None-Match":"*"}:{})},
    body:contents});
  if(createOnly&&[409,412].includes(response.status))return false;
  if(!response.ok)throw Error(`R2 write failure ${response.status}`);
  return true;
}
const jsonBytes=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value));
const cursorKey="school-template-production/v1/cursor.json";
async function getCursor():Promise<number>{
  const response=await r2Read(cursorKey,stateKeyPattern);
  if(response.status===404)return 0;
  if(!response.ok)throw Error("R2 photography cursor unavailable");
  const value=await response.json() as {index?:number};
  return Number.isInteger(value.index)&&value.index!>=0&&value.index!<84?value.index!:0;
}
async function saveCursor(index:number){
  await r2Write(cursorKey,stateKeyPattern,jsonBytes({index}),"application/json");
}

async function setState(key:string,value:State,createOnly=false){
  return r2Write(key,stateKeyPattern,jsonBytes(value),"application/json",createOnly);
}
async function getState(key:string):Promise<State|null>{
  const response=await r2Read(key,stateKeyPattern);
  if(response.status===404)return null;
  if(!response.ok)throw Error("R2 production-state read failed");
  const value=await response.json() as State;
  if(!["reserved","submitted","completed","rejected"].includes(value.status))
    throw Error("Invalid persisted photography job");
  return value;
}
/** Bounded JPEG dimensions parser; no decoding or unsupported formats. */
export function jpegDimensions(bytes:Uint8Array):{width:number;height:number}|null {
  if(bytes.length<12||bytes[0]!==255||bytes[1]!==216)return null;
  let pos=2;
  while(pos+4<bytes.length){
    if(bytes[pos]!==255){pos++;continue;}
    while(bytes[pos]===255)pos++;
    const marker=bytes[pos++];
    if(marker===216||marker===217||marker===1)continue;
    if(marker===218)break;
    if(pos+2>bytes.length)return null;
    const size=(bytes[pos]<<8)|bytes[pos+1];
    if(size<2||pos+size>bytes.length)return null;
    if([192,193,194,195,198,199,201,202].includes(marker)){
      if(size<7)return null;
      const height=(bytes[pos+3]<<8)|bytes[pos+4];
      const width=(bytes[pos+5]<<8)|bytes[pos+6];
      return width>0&&height>0?{width,height}:null;
    }
    pos+=size;
  }
  return null;
}
async function downloadImage(urlText:string,minimum:{width:number;height:number}){
  const url=new URL(urlText);
  if(url.protocol!=="https:"||!(url.hostname==="fal.media"||url.hostname.endsWith(".fal.media")))
    throw Error("Image host not allowlisted");
  const response=await fetch(url.toString(),{redirect:"error"});
  if(!response.ok||Number(response.headers.get("content-length")||0)>25_000_000)
    throw Error("Generated media unavailable or too large");
  const image=new Uint8Array(await response.arrayBuffer());
  if(image.byteLength>25_000_000)throw Error("Generated media too large");
  const dimensions=jpegDimensions(image);
  if(!dimensions||dimensions.width<minimum.width||dimensions.height<minimum.height)
    throw Error("Generated JPEG does not meet requested dimensions");
  return image;
}
export type ProductionOutcome={
  inspected:number;queued:number;completed:number;pending:number;rejected:number;
  status:"disabled"|"active";
};
/**
 * Worker cron entry point. No public route. Max 2 new billable jobs per tick,
 * once per template/role, with a persistent R2 reservation made BEFORE billing.
 * Rejected jobs never retry automatically; there is no accidental spend loop.
 */
export async function runScheduledTemplatePhotography():Promise<ProductionOutcome>{
  if(process.env.CAN_TEMPLATE_PHOTOGRAPHY_GENERATE!=="true")
    return {status:"disabled",inspected:0,queued:0,completed:0,pending:0,rejected:0};
  if(!process.env.FAL_KEY)throw Error("fal.ai production key missing");
  const outcome:ProductionOutcome={status:"active",inspected:0,queued:0,
    completed:0,pending:0,rejected:0};
  // Bound each cron tick to six candidates. A durable cursor guarantees
  // coverage without hitting Workers' subrequest budget on 84-image libraries.
  // Hero roles are processed first across all seven designs.
  const jobs=templatePhotographyRoles.flatMap(role=>
    siteTemplateIds.map(template=>({template,role})));
  const cursor=await getCursor();
  for(let offset=0;offset<6;offset++){
    const {template,role}=jobs[(cursor+offset)%jobs.length]!;
    const fileKey=keyFor(template,role),jobKey=stateFor(template,role);
    outcome.inspected++;
    if(await r2Head(fileKey))continue;
    const state=await getState(jobKey);
    if(!state){
      if(outcome.queued>=4)continue;
      // Reserve exactly once before initiating a billable generation.
      if(!await setState(jobKey,{status:"reserved"},true))continue;
      const submitted=await submitSchoolPhoto(template,role);
      await setState(jobKey,{status:"submitted",requestId:submitted.requestId});
      outcome.queued++;
      continue;
    }
    if(state.status==="rejected"){outcome.rejected++;continue;}
    if(state.status!=="submitted"||!state.requestId)continue;
    if(outcome.completed>=4)continue;
    const status=await schoolPhotoStatus(state.requestId);
    if(status!=="COMPLETED"){outcome.pending++;continue;}
    const brief=schoolPhotographyBrief(template,role);
    try{
      const result=await schoolPhotoResult(state.requestId);
      const image=await downloadImage(result.imageUrl,brief.minimum);
      const uploaded=await r2Write(fileKey,photoKeyPattern,image,"image/jpeg",true);
      if(!uploaded&&!await r2Head(fileKey))throw Error("Concurrent image upload missing");
      await setState(jobKey,{status:"completed",requestId:state.requestId});
      outcome.completed++;
    }catch(error){
      // No automatic paid retry; leave a durable review state.
      await setState(jobKey,{status:"rejected",requestId:state.requestId,
        reason:error instanceof Error?error.message.slice(0,100):"Image verification failed"});
      outcome.rejected++;
    }
  }
  await saveCursor((cursor+6)%jobs.length);
  return outcome;
}
