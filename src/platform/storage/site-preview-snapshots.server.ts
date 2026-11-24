import { createHash } from "node:crypto";
import { signPrivateObjectUrl } from "./r2";
import { liveCloudflarePhotoEnv } from "@/platform/photography/cloudflare-runtime.server";
import { isPublicSitePagePath, publicSitePagePaths, type PublicSitePath } from "@/domain/public-site-paths";

/** Immutable, private Cloudflare R2 snapshots; the same CAN OS bucket already
 * bound at deployment, under a separate scoped prefix. No public object URLs.
 * Site metadata stores only the opaque key and content checksum.
 */
const keyPattern=/^site-website-preview-snapshots\/v2\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.json$/;
const maxBytes=24*1024*1024;
export function sitePreviewSnapshotKey(siteId:string,shareId:string):string{
  if(!/^[0-9a-f-]{36}$/i.test(siteId)||!/^[0-9a-f-]{36}$/i.test(shareId))
    throw new Error("Invalid website preview scope");
  return `site-website-preview-snapshots/v2/${siteId}/${shareId}.json`;
}
export function sitePreviewSnapshotDigest(text:string){
  return createHash("sha256").update(text,"utf8").digest("hex");
}
export function encodeSitePreviewSnapshot(pages:Partial<Record<PublicSitePath,string>>){
  const keys=Object.keys(pages);
  if(!keys.length||keys.length>publicSitePagePaths.length||!keys.includes("/")||
    keys.some(key=>!isPublicSitePagePath(key)||typeof pages[key as PublicSitePath]!=="string"))
    throw new Error("Invalid preview pages");
  const text=JSON.stringify({version:2,pages});
  const bytes=new TextEncoder().encode(text).byteLength;
  if(bytes>maxBytes)throw new Error("Website preview exceeds 24 MB");
  return {text,bytes,digest:sitePreviewSnapshotDigest(text),paths:keys as PublicSitePath[]};
}
export async function writeSitePreviewSnapshot(key:string,pages:Partial<Record<PublicSitePath,string>>){
  if(!keyPattern.test(key))throw new Error("Invalid preview object key");
  const bucket=(await liveCloudflarePhotoEnv())?.TEMPLATE_PHOTO_BUCKET;
  const snapshot=encodeSitePreviewSnapshot(pages);
  if(bucket){
    const created=await bucket.put(key,snapshot.text,{
      onlyIf:{etagDoesNotMatch:"*"},
      httpMetadata:{contentType:"application/json"},
    });
    if(!created)throw new Error("An immutable website snapshot already exists");
  }else{
    // Netlify and other Node deployments use the existing private R2 signer.
    // No public URL, inline HTML in Site metadata, or overwrite fallback.
    const result=await fetch(signPrivateObjectUrl({method:"PUT",key,keyPattern,
      contentType:"application/json",preventOverwrite:true}),{
      method:"PUT",headers:{"Content-Type":"application/json","If-None-Match":"*"},
      body:snapshot.text,redirect:"error",
    });
    if(!result.ok)throw new Error("Private website snapshot upload failed");
  }
  return {key,digest:snapshot.digest,paths:snapshot.paths};
}
export async function readSitePreviewSnapshot(key:string,digest:string):
  Promise<Partial<Record<PublicSitePath,string>>|null>{
  if(!keyPattern.test(key)||!/^[0-9a-f]{64}$/.test(digest))return null;
  const bucket=(await liveCloudflarePhotoEnv())?.TEMPLATE_PHOTO_BUCKET;
  let text:string;
  let size:number;
  if(bucket){
    const head=await bucket.head(key);
    if(!head||head.size>maxBytes)return null;
    const object=await bucket.get(key);
    if(!object)return null;
    size=head.size;
    text=await object.text();
  }else{
    const response=await fetch(signPrivateObjectUrl({method:"GET",key,keyPattern}),{redirect:"error"});
    if(!response.ok||!response.body)return null;
    size=Number(response.headers.get("content-length"));
    if(!Number.isSafeInteger(size)||size<1||size>maxBytes){await response.body.cancel();return null;}
    const reader=response.body.getReader();
    const decoder=new TextDecoder("utf-8",{fatal:true});
    let total=0;
    const parts:string[]=[];
    try{
      while(true){
        const {done,value}=await reader.read();
        if(done)break;
        total+=value.byteLength;
        if(total>size)return null;
        parts.push(decoder.decode(value,{stream:true}));
      }
      if(total!==size)return null;
      parts.push(decoder.decode());
      text=parts.join("");
    }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  }
  if(new TextEncoder().encode(text).byteLength!==size||
     sitePreviewSnapshotDigest(text)!==digest)return null;
  try {
    const document=JSON.parse(text) as {version?:number;pages?:Record<string,unknown>};
    if(document.version!==2 || !document.pages ||
      Object.keys(document.pages).length>publicSitePagePaths.length || !document.pages["/"])return null;
    if(Object.entries(document.pages).some(([path,html])=>
      !isPublicSitePagePath(path)||typeof html!=="string"))return null;
    return document.pages as Partial<Record<PublicSitePath,string>>;
  }catch{return null;}
}
