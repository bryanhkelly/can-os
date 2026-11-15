import { createFileRoute } from "@tanstack/react-router";
import { embeddedSourceRevision } from "@/domain/build-source-revision";

/** Fixed, read-only production artifact identification.
 * The source SHA comes from Vite at build time, not user input.
 * Never returns secrets, database identifiers, account context or flags.
 */
export const Route=createFileRoute("/release-fingerprint")({
  server:{handlers:{
    GET:()=>new Response(JSON.stringify({
      application:"can-os",sourceRevision:embeddedSourceRevision(),
    }),{
      status:200,headers:{
        "Content-Type":"application/json; charset=utf-8",
        "Cache-Control":"no-store",
        "X-Content-Type-Options":"nosniff",
        "Referrer-Policy":"no-referrer",
        "X-Robots-Tag":"noindex, nofollow",
        "Access-Control-Allow-Origin":"none",
      },
    }),
  }},
});
