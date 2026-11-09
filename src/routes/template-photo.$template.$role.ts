import {liveCloudflarePhotoEnv} from "@/platform/photography/cloudflare-runtime.server";
import {readBoundTemplatePhoto} from "@/platform/photography/cloudflare-production.server";
import {createFileRoute} from "@tanstack/react-router";
import legacyManifest from "@/domain/template-sample-assets.json";
import stagedManifest from "@/domain/template-photography-v2.json";
import {type SiteTemplateId} from "@/domain/site-theme";
import type {TemplatePhotographyRole} from "@/domain/template-sample-images";
import {signPrivateObjectUrl} from "@/platform/storage/r2";

const templateIds = new Set(["heritage","community","modern","bright-futures","summit","classic","campus"]);
const roles = new Set(["hero","story_01","story_02","program_01","program_02","program_03",
  "community_01","community_02","admissions","portrait_01","portrait_02","portrait_03"]);
const family:Record<SiteTemplateId,string> = {
  heritage:"heritage",community:"community",modern:"modern",
  "bright-futures":"bright",summit:"summit",classic:"classic",campus:"campus",
};
const legacyFamily:Record<SiteTemplateId,string> = {
  ...family,classic:"heritage",campus:"community",
};
const allowedKey=/^school-template-previews\/v(?:1|2|3)\/(?:heritage|community|modern|bright|summit|classic|campus)\/(?:hero|story_0[12]|program_0[123]|community_0[12]|admissions|portrait_0[123])\.jpg$/;
const notFound=()=>new Response("Not found",{status:404,headers:{"Cache-Control":"no-store"}});
/** Serve an exact public fictional sample from private R2; never expose credentials.
 * Only manifest-listed images are allowed, and v2 is gated until uploads pass QA.
 */
export const Route=createFileRoute("/template-photo/$template/$role")({
  server:{handlers:{GET:async({params,request})=>{
    const nativeEnv=await liveCloudflarePhotoEnv();
    if(nativeEnv)return readBoundTemplatePhoto(request,nativeEnv);
    if(!templateIds.has(params.template)||!roles.has(params.role))return notFound();
    const template=params.template as SiteTemplateId;
    const role=params.role as TemplatePhotographyRole;
    // Both Cloudflare and Netlify must reference only the fresh v3 master.
    // This does not submit or generate images; it only serves stored R2 bytes.
    const generated=`school-template-previews/v3/${family[template]}/${role}.jpg`;
    const staged=process.env.CAN_TEMPLATE_PHOTOS_V2_ENABLED==="true"
      ? stagedManifest.files.find(f=>f.template===family[template]&&f.role===role)?.key
      : undefined;
    // Do not substitute the Heritage/Community family for the two unique designs.
    const fallback=(template==="classic"||template==="campus") ? undefined :
      role==="hero"||role==="story_01"
        ? legacyManifest.files.find(f=>"template" in f &&
          f.template===legacyFamily[template] && f.role===role &&
          f.preview_only==="no" && "width" in f && f.width>=1000)?.key
        : undefined;
    try{
      let upstream:Response|null=null;
      // An explicit development-only switch can still inspect legacy
      // preview media; production defaults to fresh v3 only on both hosts.
      const allowLegacy=process.env.CAN_TEMPLATE_PHOTO_ALLOW_LEGACY_FALLBACK==="true";
      for(const key of allowLegacy?[generated,staged,fallback]:[generated]){
        if(!key||!allowedKey.test(key))continue;
        const candidate=await fetch(signPrivateObjectUrl({
          method:"GET",key,keyPattern:allowedKey,expiresSeconds:30,
        }),{method:"GET",redirect:"error"});
        if(candidate.ok&&candidate.body){upstream=candidate;break;}
        if(candidate.status!==404)return notFound();
      }
      if(!upstream||!upstream.body)return notFound();
      const candidateType=upstream.headers.get("Content-Type");
      const contentType=["image/jpeg","image/png","image/webp"].includes(
        candidateType??"") ? candidateType! : "image/jpeg";
      return new Response(upstream.body,{status:200,headers:{
        "Content-Type":contentType,
        "Cache-Control":"public, max-age=900",
        "X-Content-Type-Options":"nosniff",
        "Content-Disposition":"inline",
        "Referrer-Policy":"no-referrer",
      }});
    }catch{return notFound();}
  }}},
});
