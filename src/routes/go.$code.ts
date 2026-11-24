import { createFileRoute } from "@tanstack/react-router";
import { resolveGoExperience } from "@/modules/engagement/engagement-go.server";
import { renderEngagementPage } from "@/domain/engagement-page-renderer";

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
  const title=status===404?"This link is no longer available":"This link is temporarily unavailable";
  const detail=status===404
    ?"The invitation may have expired or the opportunity may no longer be shared."
    :"We could not open this invitation. You can explore other opportunities.";
  const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · Becomuna</title><style>
body{font:16px system-ui,sans-serif;background:#f8fafc;color:#152033;min-height:100vh;margin:0;display:grid;place-items:center}
main{max-width:36rem;background:#fff;border:1px solid #e2e8f0;padding:2.5rem;margin:2rem;border-radius:1rem}
h1{font-size:clamp(1.6rem,4vw,2.3rem)}p{line-height:1.7;color:#475569}
a{display:inline-block;margin-top:1rem;padding:.8rem 1.2rem;background:#162a47;color:#fff;border-radius:.45rem;text-decoration:none}
a:focus-visible{outline:3px solid #0284c7;outline-offset:3px}
</style></head><body><main><small>Becomuna · Shared link</small><h1>${title}</h1><p>${detail}</p><a href="/landing">Explore current opportunities</a></main></body></html>`;
  return new Response(html,{status,headers:{...headers,
    "Content-Type":"text/html; charset=utf-8"}});
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
          },
        });
      }catch{
        console.error("Go link resolution unavailable",{kind:"unavailable"});
        return unavailable(503);
      }
    },
  }},
});
