import {createFileRoute} from "@tanstack/react-router";
import {slugForPublicSiteOrigin} from "@/domain/public-site-host-routing";
import {publicSiteMediaPathPattern} from "@/domain/public-site-paths";
import {siteMediaKeyPattern,readPublishedSchoolSitePhoto}
  from "@/modules/sites/site-media-folder.server";
import {signPrivateObjectUrl} from "@/platform/storage/r2";

const unavailable=(status=404)=>new Response(status===404?"Not found":"Media unavailable",{
  status,headers:{"Content-Type":"text/plain; charset=utf-8",
    "Cache-Control":"no-store","X-Content-Type-Options":"nosniff",
    "X-Robots-Tag":"noindex, nofollow"},
});

/** A tenant-scoped public proxy. The private R2 bucket remains private; no
 * signed URLs, evidence keys or unapproved image data reach the browser. */
export const Route=createFileRoute("/published-site/media/$assetId")({
  server:{handlers:{GET:async({request})=>{
    const slug=slugForPublicSiteOrigin(request,
      process.env.CAN_PUBLIC_SITE_HOSTING_ENABLED==="true",
      process.env.CAN_PUBLIC_SITE_LOCAL_PREVIEW_ENABLED==="true");
    if(!slug)return unavailable();
    const url=new URL(request.url);
    const path=url.pathname.slice("/published-site".length);
    if(!publicSiteMediaPathPattern.test(path))return unavailable();
    const assetId=path.slice("/media/".length);
    try{
      const published=await readPublishedSchoolSitePhoto(slug,assetId);
      if(!published)return unavailable();
      const response=await fetch(signPrivateObjectUrl({
        method:"GET",key:published.storageKey,
        keyPattern:siteMediaKeyPattern,expiresSeconds:30,
      }),{method:"GET",redirect:"error"});
      if(!response.ok||!response.body)return unavailable(503);
      return new Response(response.body,{status:200,headers:{
        "Content-Type":published.mimeType,
        "Cache-Control":"private, no-store",
        "X-Content-Type-Options":"nosniff",
        "X-Robots-Tag":"noindex, nofollow",
        "Referrer-Policy":"no-referrer",
        "Content-Disposition":"inline",
        "Content-Security-Policy":"default-src 'none'; sandbox",
      }});
    }catch{return unavailable(503);}
  }}},
});
