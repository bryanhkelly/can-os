import { z } from "zod";
import { noncreditEnrollmentOrigin } from "@/domain/site-noncredit-public";

const fingerprint=z.object({
  application:z.literal("can-os"),
  sourceRevision:z.string().regex(/^[a-f0-9]{40}$/i).nullable(),
}).strict();
export type EnrollmentAppCheck={
  status:"unconfigured"|"unreachable"|"revision_unknown"|"revision_mismatch"|
    "route_unavailable"|"revision_unverified"|"verified";
  origin:string|null;
  deployedSourceRevision:string|null;
  routeStatus:"available"|"login_required"|"unavailable";
  diagnostic:string;
};
async function boundedJson(response:Response):Promise<unknown> {
  const body=response.body;
  if(!body)throw new Error("no body");
  const reader=body.getReader();
  const chunks:Uint8Array[]=[];
  let bytes=0;
  try{
    while(true){
      const result=await reader.read();
      if(result.done)break;
      bytes+=result.value.byteLength;
      if(bytes>2048){await reader.cancel();throw new Error("fingerprint too large");}
      chunks.push(result.value);
    }
  }finally{reader.releaseLock();}
  const buf=new Uint8Array(bytes);let pos=0;
  for(const chunk of chunks){buf.set(chunk,pos);pos+=chunk.byteLength;}
  return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(buf));
}

/** Read-only external HTTPS probe. Does not follow redirects, invent a live
 * published Site or trust an origin passed from the browser.
 * Exact-SHA matching requires a user-supplied, verified source SHA.
 */
export async function checkEnrollmentAppReachability(input:{
  configuredOrigin:string|undefined|null;
  expectedSourceRevision?:string|null;
  fetcher?:typeof fetch;
}):Promise<EnrollmentAppCheck> {
  const origin=noncreditEnrollmentOrigin(input.configuredOrigin);
  const unavailable=(status:EnrollmentAppCheck["status"],diagnostic:string,
    revision:string|null=null,routeStatus:EnrollmentAppCheck["routeStatus"]="unavailable"):EnrollmentAppCheck=>
      ({status,origin,deployedSourceRevision:revision,routeStatus,diagnostic});
  if(!origin)return unavailable("unconfigured",
    "Set a valid HTTPS CAN application origin before offering registration links.");
  const request=input.fetcher??fetch;
  try{
    const fingerprintResponse=await request(origin+"/release-fingerprint",{
      method:"GET",redirect:"manual",headers:{Accept:"application/json"},
      signal:AbortSignal.timeout(5000),
    });
    if(fingerprintResponse.status!==200 ||
       !fingerprintResponse.headers.get("content-type")?.toLowerCase().includes("application/json")){
      await fingerprintResponse.body?.cancel();
      return unavailable("unreachable","Application deployment fingerprint is not reachable.");
    }
    const parsed=fingerprint.safeParse(await boundedJson(fingerprintResponse));
    if(!parsed.success)return unavailable("unreachable","Application deployment identity could not be verified.");
    const revision=parsed.data.sourceRevision;
    if(!revision)return unavailable("revision_unknown",
      "The deployed application did not report a verified source commit.");
    let routeStatus:EnrollmentAppCheck["routeStatus"]="unavailable";
    const response=await request(origin+"/learn/enroll",{
      method:"GET",redirect:"manual",headers:{Accept:"text/html"},
      signal:AbortSignal.timeout(5000),
    });
    if(response.status===200&&response.headers.get("content-type")?.toLowerCase().includes("text/html"))
      routeStatus="available";
    if([301,302,303,307,308].includes(response.status)){
      const location=response.headers.get("location");
      if(location){
        const destination=new URL(location,origin);
        if(destination.origin===origin&&destination.pathname.startsWith("/access"))
          routeStatus="login_required";
      }
    }
    await response.body?.cancel();
    if(routeStatus==="unavailable")
      return unavailable("route_unavailable","The deployed registration route did not pass the live HTTPS check.",revision);
    const expected=input.expectedSourceRevision?.trim().toLowerCase();
    if(expected&&(!/^[a-f0-9]{40}$/.test(expected)||expected!==revision))
      return unavailable("revision_mismatch",
        "Deployed application revision does not match the requested source commit.",
        revision,routeStatus);
    if(!expected)return unavailable("revision_unverified",
      "Registration route responded, but the deployed SHA has not been compared to the intended source commit.",
      revision,routeStatus);
    return unavailable("verified",
      "HTTPS app origin, registration route and exact deployed source revision verified.",
      revision,routeStatus);
  }catch{
    return unavailable("unreachable",
      "The application HTTPS probe failed. Check origin routing, access and the deployed revision.");
  }
}
