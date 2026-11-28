import {handleCampaignUnsubscribe} from "./campaign-unsubscribe-http";
import {suppressCampaignRecipient} from "./campaign-store.server";
export function handlePublicCampaignUnsubscribe(request:Request):Promise<Response>{
 return handleCampaignUnsubscribe(request,suppressCampaignRecipient);
}
export {handleResendDeliveryWebhook} from "./resend-delivery-webhook.server";
