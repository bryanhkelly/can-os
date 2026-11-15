import {isIP} from "node:net";
import {classifySessionDevice,type SessionDeviceContext} from "@/domain/session-device";

/** Use trusted Netlify function runtime metadata. Never inspect inbound IP headers. */
export async function readTrustedSessionDevice(request:Request):Promise<SessionDeviceContext>{
 if(process.env.CAN_SESSION_IP_COLLECTION_ENABLED!=="1")
  return classifySessionDevice(request);
 try{
  const {getContext}=await import("@netlify/functions");
  const ip=getContext().ip;
  return classifySessionDevice(request,typeof ip==="string"&&isIP(ip)?ip:null);
 }catch{
  // Outside the Netlify runtime there is no verified address.
  return classifySessionDevice(request);
 }
}
