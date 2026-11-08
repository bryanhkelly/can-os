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
const allowedKey=/^school-template-previews\/v(?:1|2)\/(?:heritage|community|modern|bright|summit|campus)\/(?:hero|story_0[12]|program_0[123]|community_0[12]|admissions|portrait_0[123])\.jpg$/;
const notFound=()=>new Response("Not found",{status:404,headers:{"Cache-Control":"no-store"}});
/** Serve an exact public fictional sample from private R2; never expose credentials.
 * Only manifest-listed images are allowed, and v2 is gated until uploads pass QA.
 */
export const Route=createFileRoute("/template-photo/$template/$role")({
  server:{handlers:{GET:async({params})=>{
    if(!templateIds.has(params.template)||!roles.has(params.role))return notFound();
    const template=params.template as SiteTemplateId;
    const role=params.role as TemplatePhotographyRole;
    const staged=process.env.CAN_TEMPLATE_PHOTOS_V2_ENABLED==="true"
      ? stagedManifest.files.find(f=>f.template===family[template]&&f.role===role)
      : undefined;
    const fallback=role==="hero"||role==="story_01"
      ? legacyManifest.files.find(f=>"template" in f &&
          f.template===legacyFamily[template] && f.role===role &&
          f.preview_only==="no" && "width" in f && f.width>=1000)
      : undefined;
    const asset=staged ?? ((template==="classic"||template==="campus") &&
      process.env.CAN_TEMPLATE_PHOTOS_V2_ENABLED==="true" ? undefined : fallback);
    if(!asset||!allowedKey.test(asset.key))return notFound();
    try{
      const upstream=await fetch(signPrivateObjectUrl({
        method:"GET",key:asset.key,keyPattern:allowedKey,expiresSeconds:30,
      }),{method:"GET",redirect:"error"});
      if(!upstream.ok || !upstream.body)return notFound();
      return new Response(upstream.body,{status:200,headers:{
        "Content-Type":"image/jpeg",
        "Cache-Control":"public, max-age=3600",
        "X-Content-Type-Options":"nosniff",
        "Content-Disposition":"inline",
        "Referrer-Policy":"no-referrer",
      }});
    }catch{return notFound();}
  }}},
});
