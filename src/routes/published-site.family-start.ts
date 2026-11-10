import { createFileRoute } from "@tanstack/react-router";
import { slugForPublicSiteOrigin } from "@/domain/public-site-host-routing";
import { publicSiteDomain } from "@/domain/public-site-address";
import { parsePublicFamilyStart } from "@/domain/public-family-start";
import { readSmallUrlEncodedBody } from "@/domain/public-admissions-interest";
import { isSyntheticSandboxMailRuntime } from "@/modules/identity/resend-access-mail.server";

const headers={
 "Cache-Control":"private, no-store","Vary":"Host",
 "X-Content-Type-Options":"nosniff","X-Frame-Options":"DENY",
 "Referrer-Policy":"no-referrer","X-Robots-Tag":"noindex, nofollow",
 "Content-Type":"text/html; charset=utf-8",
 "Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
};

export const Route=createFileRoute("/published-site/family-start")({
 server:{handlers:{POST:async({request})=>{
  const slug=slugForPublicSiteOrigin(
    request,
    process.env.CAN_PUBLIC_SITE_HOSTING_ENABLED==="true",
    process.env.CAN_PUBLIC_SITE_LOCAL_PREVIEW_ENABLED==="true",
    publicSiteDomain(),
    process.env.CAN_PUBLIC_SITE_LOCAL_PREVIEW_WRITES_ENABLED==="true",
  );
  const origin=request.headers.get("origin");
  const sameOrigin=origin===new URL(request.url).origin;
  // Chromium may serialize a same-origin form submission's Origin as `null`
  // under the no-referrer policy. Permit that opaque origin only in the
  // isolated synthetic sandbox, whose access mail is a local outbox and
  // whose demo-family recipient must be a `.test` address.
  const sandboxOpaqueOrigin=origin==="null"&&isSyntheticSandboxMailRuntime();
  if(!slug || (!sameOrigin&&!sandboxOpaqueOrigin))
    return new Response("Not found",{status:404,headers:{"Cache-Control":"no-store"}});
  try{
    const {admitPublicAdmissionsInterest}=await import("@/modules/enrollment/public-admissions-interest.server");
    const budget=await admitPublicAdmissionsInterest("public_site_family_start",slug);
    if(!budget.allowed)return new Response("Too many requests. Try again later.",{
      status:429,headers:{"Cache-Control":"no-store","Retry-After":String(budget.retryAfterSeconds)}});
  }catch{
    return new Response("Requests temporarily unavailable.",{
      status:503,headers:{"Cache-Control":"no-store","Retry-After":"30"}});
  }
  let payload;
  try{payload=parsePublicFamilyStart(await readSmallUrlEncodedBody(request));}
  catch{return new Response("Review your contact details and try again.",{
    status:400,headers:{"Cache-Control":"no-store"}});}
  try{
    const {requestPublicFamilyStart}=await import("@/modules/enrollment/public-family-start.server");
    await requestPublicFamilyStart(slug,payload);
  }catch{
    // Never disclose account presence or approval details to an anonymous caller.
    // Operational failures must be observed in server telemetry, not exposed here.
    return new Response("We could not send a verification link right now.",{
      status:503,headers:{"Cache-Control":"no-store","Retry-After":"30"}});
  }
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="robots" content="noindex,nofollow"><title>Check your email</title>
    </head><body style="font-family:system-ui,sans-serif;max-width:44rem;margin:4rem auto;padding:1rem">
    <h1>Check your email</h1>
    <p>If eligible, a verification link has been sent. Open it on your device to
      confirm your email and start or resume a school application.</p>
    <p>This is not admission, a child identity verification or an enrollment confirmation.</p>
    <p><a href="${new URL(request.url).searchParams.has("site")
      ? `/published-site?site=${encodeURIComponent(slug)}`
      : "/"}">Return to school programs</a></p>
    </body></html>`,{status:200,headers});
 }}},
});
