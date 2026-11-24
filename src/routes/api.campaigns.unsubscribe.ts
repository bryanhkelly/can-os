import {createFileRoute} from "@tanstack/react-router";
import {suppressCampaignRecipient} from "@/modules/communication/campaign-store.server";
const headers={"Cache-Control":"no-store","Referrer-Policy":"no-referrer","Content-Security-Policy":"default-src 'none'; form-action 'self'; frame-ancestors 'none'","X-Content-Type-Options":"nosniff","Content-Type":"text/html; charset=utf-8"};
function token(request:Request){const value=new URL(request.url).searchParams.get("token");return value&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)?value:null;}
export const Route=createFileRoute("/api/campaigns/unsubscribe")({server:{handlers:{
 GET:({request})=>{
 const value=token(request);if(!value)return new Response("Invalid link",{status:400,headers});
 return new Response('<!doctype html><html lang="en"><meta charset="utf-8"><title>Unsubscribe</title><h1>Unsubscribe from campaign emails</h1><p>Confirm to stop future campaign messages from this sender.</p><form method="post"><input type="hidden" name="List-Unsubscribe" value="One-Click"><button type="submit">Unsubscribe</button></form></html>',{headers});
 },
 POST:async({request})=>{
 const value=token(request);if(!value)return new Response("Invalid link",{status:400,headers});
 // No state change on GET: scanners and previews must not unsubscribe people.
 const type=request.headers.get("content-type")??"";
 if(!type.startsWith("application/x-www-form-urlencoded")||Number(request.headers.get("content-length")??0)>1024)return new Response("Invalid request",{status:400,headers});
 const reader=request.body?.getReader();if(!reader)return new Response("Invalid request",{status:400,headers});
 let body="",bytes=0;const decoder=new TextDecoder();
 try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>1024){await reader.cancel();return new Response("Invalid request",{status:413,headers});}body+=decoder.decode(part.value,{stream:true});}body+=decoder.decode();}finally{reader.releaseLock();}
 if(new URLSearchParams(body).get("List-Unsubscribe")!=="One-Click")return new Response("Invalid request",{status:400,headers});
 await suppressCampaignRecipient(value);
 return new Response("<!doctype html><html lang=\"en\"><title>Unsubscribed</title><h1>Unsubscribe request processed</h1><p>Future campaign emails from this sender will be suppressed. Messages already in transit may still arrive.</p></html>",{headers});
 },
}}});
