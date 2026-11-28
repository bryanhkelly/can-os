import {createFileRoute} from "@tanstack/react-router";
import {handleCampaignUnsubscribe} from "@/modules/communication/campaign-unsubscribe-http";
import {suppressCampaignRecipient} from "@/modules/communication/campaign-store.server";
const handle=(request:Request)=>handleCampaignUnsubscribe(request,suppressCampaignRecipient);
export const Route=createFileRoute("/api/campaigns/unsubscribe")({server:{handlers:{
 GET:({request})=>handle(request),
 POST:({request})=>handle(request),
}}});
