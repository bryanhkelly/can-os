import { createFileRoute } from "@tanstack/react-router";
import { resolveSiteGoLink } from "@/modules/engagement/site-go-links.server";

/** A generic unavailable state protects private Site and link lifecycle.
 * No code, Site name, registration state or external redirect is reflected.
 * No scripts, tracking pixels or third-party assets are loaded.
 */
const headers = {
  "Cache-Control": "no-store, private",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy":
    "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};
function unavailable(status:404|503):Response {
  const title=status===404?"This link is no longer available":"This link is temporarily unavailable";
  const details=status===404
    ?"The invitation may have expired, the program may have closed, or this link may no longer be shared."
    :"We could not check this invitation right now. You can explore other opportunities.";
  const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · Becomuna</title>
<style>
:root{color-scheme:light}body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#152033;background:#f8fafc;min-height:100vh;display:grid;place-items:center}
main{max-width:35rem;margin:2rem;padding:2.5rem;background:white;border:1px solid #e2e8f0;border-radius:1rem}
small{font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#475569}
h1{font-size:clamp(1.65rem,4vw,2.35rem);line-height:1.17;margin:1.2rem 0}p{color:#475569;line-height:1.7}
a{display:inline-block;background:#162a47;color:white;border-radius:.5rem;padding:.85rem 1.25rem;margin-top:1.3rem;font-weight:600;text-decoration:none}
a:focus-visible{outline:3px solid #0284c7;outline-offset:3px}
</style></head><body><main><small>Becomuna · Shared link</small><h1>${title}</h1><p>${details}</p>
<a href="/landing">Explore current opportunities</a></main></body></html>`;
  return new Response(html,{status,headers:{
    ...headers,"Content-Type":"text/html; charset=utf-8",
  }});
}

/** GET only. A non-cacheable 302 ensures pause/revocation takes effect. */
export const Route=createFileRoute("/go/$code")({
  server:{handlers:{
    GET:async({params})=>{
      try{
        const destination=await resolveSiteGoLink(params.code);
        if(!destination)return unavailable(404);
        return new Response(null,{status:302,headers:{...headers,Location:destination}});
      }catch{
        // Do not log codes or visitor-request details.
        console.error("Go Link resolution failed",{component:"go_resolver",result:"unavailable"});
        return unavailable(503);
      }
    },
  }},
});
