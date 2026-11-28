import {campaignUnsubscribeToken,validateCampaignUnsubscribe} from "@/domain/campaign-unsubscribe";
const headers={"Cache-Control":"no-store","Referrer-Policy":"no-referrer","Content-Security-Policy":"default-src 'none'; form-action 'self'; frame-ancestors 'none'","X-Content-Type-Options":"nosniff","Content-Type":"text/html; charset=utf-8"};

/** Shared HTTP protocol adapter. Suppression remains in the canonical campaign store.
 * GET is intentionally read-only, including automated link scans. */
export async function handleCampaignUnsubscribe(request:Request,suppress:(token:string)=>Promise<unknown>):Promise<Response>{
 if(request.method==="GET"){

 const value=campaignUnsubscribeToken(request);if(!value)return new Response("Invalid link",{status:400,headers});
 return new Response('<!doctype html><html lang="en"><meta charset="utf-8"><title>Unsubscribe</title><h1>Unsubscribe from campaign emails</h1><p>Confirm to stop future campaign messages from this sender.</p><form method="post"><input type="hidden" name="List-Unsubscribe" value="One-Click"><button type="submit">Unsubscribe</button></form></html>',{headers});

 }
 if(request.method!=="POST")return new Response("Method not allowed",{status:405,headers:{...headers,Allow:"GET, POST"}});

 const value=campaignUnsubscribeToken(request);if(!value)return new Response("Invalid link",{status:400,headers});
 // No state change on GET: scanners and previews must not unsubscribe people.
 const result=await validateCampaignUnsubscribe(request);
 if(result!==200)return new Response("Invalid request",{status:result,headers});
 await suppress(value);
 return new Response("<!doctype html><html lang=\"en\"><title>Unsubscribed</title><h1>Unsubscribe request processed</h1><p>Future campaign emails from this sender will be suppressed. Messages already in transit may still arrive.</p></html>",{headers});

}
