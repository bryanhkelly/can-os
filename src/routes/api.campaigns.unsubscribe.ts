import {createFileRoute} from "@tanstack/react-router";
import {campaignUnsubscribeToken,validateCampaignUnsubscribe} from "@/domain/campaign-unsubscribe";
import {suppressCampaignRecipient} from "@/modules/communication/campaign-store.server";
const headers={"Cache-Control":"no-store","Referrer-Policy":"no-referrer","Content-Security-Policy":"default-src 'none'; form-action 'self'; frame-ancestors 'none'","X-Content-Type-Options":"nosniff","Content-Type":"text/html; charset=utf-8"};

export const Route=createFileRoute("/api/campaigns/unsubscribe")({server:{handlers:{
 GET:({request})=>{
 const value=campaignUnsubscribeToken(request);if(!value)return new Response("Invalid link",{status:400,headers});
 return new Response('<!doctype html><html lang="en"><meta charset="utf-8"><title>Unsubscribe</title><h1>Unsubscribe from campaign emails</h1><p>Confirm to stop future campaign messages from this sender.</p><form method="post"><input type="hidden" name="List-Unsubscribe" value="One-Click"><button type="submit">Unsubscribe</button></form></html>',{headers});
 },
 POST:async({request})=>{
 const value=campaignUnsubscribeToken(request);if(!value)return new Response("Invalid link",{status:400,headers});
 // No state change on GET: scanners and previews must not unsubscribe people.
 const result=await validateCampaignUnsubscribe(request);
 if(result!==200)return new Response("Invalid request",{status:result,headers});
 await suppressCampaignRecipient(value);
 return new Response("<!doctype html><html lang=\"en\"><title>Unsubscribed</title><h1>Unsubscribe request processed</h1><p>Future campaign emails from this sender will be suppressed. Messages already in transit may still arrive.</p></html>",{headers});
 },
}}});
