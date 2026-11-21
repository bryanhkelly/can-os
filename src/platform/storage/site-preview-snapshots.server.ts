import { createHash } from "node:crypto";
import { liveCloudflarePhotoEnv } from "@/platform/photography/cloudflare-runtime.server";
import { isPublicSitePagePath, type PublicSitePath } from "@/domain/public-site-paths";

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
  if(!keys.length||keys.length>14||!keys.includes("/")||
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
  if(!bucket)throw new Error("Private Cloudflare R2 snapshot storage is not available");
  const snapshot=encodeSitePreviewSnapshot(pages);
  const created=await bucket.put(key,snapshot.text,{
    onlyIf:{etagDoesNotMatch:"*"},
    httpMetadata:{contentType:"application/json"},
  });
  if(!created)throw new Error("An immutable website snapshot already exists");
  return {key,digest:snapshot.digest,paths:snapshot.paths};
}
export async function readSitePreviewSnapshot(key:string,digest:string):
  Promise<Partial<Record<PublicSitePath,string>>|null>{
  if(!keyPattern.test(key)||!/^[0-9a-f]{64}$/.test(digest))return null;
  const bucket=(await liveCloudflarePhotoEnv())?.TEMPLATE_PHOTO_BUCKET;
  if(!bucket)return null;
  const head=await bucket.head(key);
  if(!head||head.size>maxBytes)return null;
  const object=await bucket.get(key);
  if(!object)return null;
  const text=await object.text();
  if(new TextEncoder().encode(text).byteLength!==head.size||
     sitePreviewSnapshotDigest(text)!==digest)return null;
  try {
    const document=JSON.parse(text) as {version?:number;pages?:Record<string,unknown>};
    if(document.version!==2 || !document.pages ||
      Object.keys(document.pages).length>14 || !document.pages["/"])return null;
    if(Object.entries(document.pages).some(([path,html])=>
      !isPublicSitePagePath(path)||typeof html!=="string"))return null;
    return document.pages as Partial<Record<PublicSitePath,string>>;
  }catch{return null;}
}
