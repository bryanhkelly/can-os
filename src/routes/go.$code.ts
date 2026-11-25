import { createFileRoute } from "@tanstack/react-router";
import { resolveGoExperience } from "@/modules/engagement/engagement-go.server";
import { sitePreviewShareHeaders } from "@/domain/site-preview-sharing";
import { renderEngagementPage, renderUnavailableEngagementPage } from "@/domain/engagement-page-renderer";

const headers={
  "Cache-Control":"private, no-store",
  "Referrer-Policy":"no-referrer",
  "X-Robots-Tag":"noindex, nofollow",
  "X-Content-Type-Options":"nosniff",
  "X-Frame-Options":"DENY",
  "Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};
function unavailable(status:404|503){
  // Do not reveal Site identity, unpublished destinations or reason for denial.
  return new Response(renderUnavailableEngagementPage(status),{status,headers:{...headers,
    "Content-Type":"text/html; charset=utf-8"}});
}

/** One public code: either 302 to an existing service or render an immutable, safe landing. */
export const Route=createFileRoute("/go/$code")({
  server:{handlers:{
    GET:async({params,request})=>{
      try{
        const query=new URL(request.url).searchParams;
        if(query.getAll("page").length>1)return unavailable(404);
        const experience=await resolveGoExperience(params.code,query.get("page")??"/",true,!query.has("page"));
        if(!experience)return unavailable(404);
        if(experience.mode==="website-preview")return new Response(experience.html,{status:200,headers:sitePreviewShareHeaders});
        if(experience.mode==="redirect"){
          return new Response(null,{status:302,headers:{...headers,Location:experience.href}});
        }
        return new Response(renderEngagementPage(experience),{
          status:200,headers:{
            ...headers,
            "Content-Type":"text/html; charset=utf-8",
          },
        });
      }catch{
        console.error("Go link resolution unavailable",{kind:"unavailable"});
        return unavailable(503);
      }
    },
  }},
});
