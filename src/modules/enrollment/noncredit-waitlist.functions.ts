import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {z} from "zod";
import {waitlistInput,cancelInput,waitlistCursor,joinNoncreditWaitlistService,cancelMyNoncreditWaitlistService,readMyNoncreditWaitlistPage} from "./noncredit-waitlist.server";
function privateGuard(){
  setResponseHeader("Cache-Control","private, no-store");
  setResponseHeader("Referrer-Policy","no-referrer");
}
export const joinNoncreditWaitlist=createServerFn({method:"POST"}).validator((v:unknown)=>waitlistInput.parse(v)).handler(async({data})=>{
  privateGuard();return joinNoncreditWaitlistService(getRequest(),data);
});
export const cancelMyNoncreditWaitlist=createServerFn({method:"POST"}).validator((v:unknown)=>cancelInput.parse(v)).handler(async({data})=>{
  privateGuard();return cancelMyNoncreditWaitlistService(getRequest(),data);
});
export const getMyNoncreditWaitlistPage=createServerFn({method:"GET"}).validator((raw:unknown)=>z.object({cursor:waitlistCursor.nullable().default(null)}).strict().parse(raw)).handler(async({data})=>{
  privateGuard();return readMyNoncreditWaitlistPage(getRequest(),data.cursor);
});
export const getMyNoncreditWaitlistByRelease=createServerFn({method:"GET"}).validator((raw:unknown)=>cancelInput.parse(raw)).handler(async({data})=>{
  privateGuard();return (await readMyNoncreditWaitlistPage(getRequest(),null,data.releaseId)).items[0]??null;
});
export const getMyNoncreditWaitlist=createServerFn({method:"GET"}).handler(async()=>{
  privateGuard();const request=getRequest();const first=await readMyNoncreditWaitlistPage(request,null);
  if(!first.nextCursor)return first.items;
  const second=await readMyNoncreditWaitlistPage(request,first.nextCursor);
  return [...first.items,...second.items];
});
