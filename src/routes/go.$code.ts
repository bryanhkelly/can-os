import { createFileRoute } from "@tanstack/react-router";
import { resolveGoExperience } from "@/modules/engagement/engagement-go.server";
import { renderEngagementPage } from "@/domain/engagement-page-renderer";

const headers={
  "Cache-Control":"private, no-store",
  "Referrer-Policy":"no-referrer",
  "X-Robots-Tag":"noindex, nofollow",
  "X-Content-Type-Options":"nosniff",
  "X-Frame-Options":"DENY",
};
function unavailable(status:number){
  return new Response(status===404?"This link is unavailable or has expired.":"This link is temporarily unavailable.",{
    status,headers:{...headers,"Content-Type":"text/plain; charset=utf-8"},
  });
}

/** One public code: either 302 to an existing service or render an immutable, safe landing. */
export const Route=createFileRoute("/go/$code")({
  server:{handlers:{
    GET:async({params})=>{
      try{
        const experience=await resolveGoExperience(params.code);
        if(!experience)return unavailable(404);
        if(experience.mode==="redirect"){
          return new Response(null,{status:302,headers:{...headers,Location:experience.href}});
        }
        return new Response(renderEngagementPage(experience),{
          status:200,headers:{
            ...headers,
            "Content-Type":"text/html; charset=utf-8",
            "Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
          },
        });
      }catch{
        console.error("Go link resolution unavailable",{kind:"unavailable"});
        return unavailable(503);
      }
    },
  }},
});
