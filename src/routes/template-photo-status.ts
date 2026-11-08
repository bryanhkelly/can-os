import {liveCloudflarePhotoEnv} from "@/platform/photography/cloudflare-runtime.server";
import {readBoundTemplatePhotoStatus} from "@/platform/photography/cloudflare-production.server";
import {createFileRoute} from "@tanstack/react-router";
import {siteTemplateIds,type SiteTemplateId} from "@/domain/site-theme";
import {templatePhotographyRoles} from "@/domain/template-photography-production";
import {signPrivateObjectUrl} from "@/platform/storage/r2";

const family:Record<SiteTemplateId,string>={
  heritage:"heritage",community:"community",modern:"modern",
  "bright-futures":"bright",summit:"summit",classic:"classic",campus:"campus",
};
const keyPattern=/^school-template-previews\/v3\/(?:heritage|community|modern|bright|summit|classic|campus)\/(?:hero|story_0[12]|program_0[123]|community_0[12]|admissions|portrait_0[123])\.jpg$/;
const unavailable=(code:number)=>Response.json({error:code===404?"Unknown template":"Status unavailable"},{
  status:code,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"},
});
/** Only public, fictional photo availability. No job IDs, R2 keys or secrets. */
export const Route=createFileRoute("/template-photo-status")({
  server:{handlers:{GET:async({request})=>{
    const nativeEnv=await liveCloudflarePhotoEnv();
    if(nativeEnv)return readBoundTemplatePhotoStatus(request,nativeEnv);

    const url=new URL(request.url),name=url.searchParams.get("template");
    if(!name||!siteTemplateIds.includes(name as SiteTemplateId))return unavailable(404);
    const template=name as SiteTemplateId;
    if(process.env.CAN_TEMPLATE_PHOTOGRAPHY_GENERATE!=="true")
      return Response.json({template,generated:0,total:12,active:false},{
        headers:{"Cache-Control":"public, max-age=60"}});
    try{
      let generated=0;
      const ready:string[]=[];
      for(const role of templatePhotographyRoles){
        const key=`school-template-previews/v3/${family[template]}/${role}.jpg`;
        const response=await fetch(signPrivateObjectUrl({
          method:"HEAD",key,keyPattern,expiresSeconds:30,
        }),{method:"HEAD",redirect:"error"});
        if(response.ok){generated++;ready.push(role);}
        else if(response.status!==404)return unavailable(503);
      }
      return Response.json({template,generated,total:12,ready,active:true},{
        headers:{"Cache-Control":"public, max-age=60","X-Content-Type-Options":"nosniff"}});
    }catch{return unavailable(503);}
  }}},
});
