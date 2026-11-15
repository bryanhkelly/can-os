import {AsyncLocalStorage} from "node:async_hooks";
import {isIP} from "node:net";
import {classifySessionDevice,type SessionDeviceContext} from "@/domain/session-device";

/** A Cloudflare edge observation exists only inside the real Worker's request
 * scope. It is not taken from arbitrary application-layer HTTP headers. */
const trustedCloudflareIngress=new AsyncLocalStorage<{ip:string|null}>();

export function withTrustedCloudflareIngress<T>(ip:string|null,work:()=>Promise<T>):Promise<T>{
 return trustedCloudflareIngress.run({ip},work);
}

/** Only a verified runtime/ingress IP may be stored as session metadata.
 * This is never identity verification, academic evidence or device attestation.
 */
export async function readTrustedSessionDevice(request:Request):Promise<SessionDeviceContext>{
 if(process.env.CAN_SESSION_IP_COLLECTION_ENABLED!=="1")
  return classifySessionDevice(request);
 const ingress=trustedCloudflareIngress.getStore();
 if(ingress){
  const ip=ingress.ip;
  return classifySessionDevice(request,typeof ip==="string"&&isIP(ip)?ip:null);
 }
 // Legacy Netlify deployment: getContext() is trusted runtime metadata.
 // Do not fall back to forwarded headers if no verified runtime exists.
 try{
  const {getContext}=await import("@netlify/functions");
  const ip=getContext().ip;
  return classifySessionDevice(request,typeof ip==="string"&&isIP(ip)?ip:null);
 }catch{return classifySessionDevice(request);}
}
