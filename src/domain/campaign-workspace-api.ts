import type {CampaignDeliveryMetrics} from "./campaign-metrics";
export type CampaignScope={engagementId:string;linkId:string};
export type CampaignDirectRecipients={raw:string;consentSource:string;attested:true};
export type CampaignQueueInput=CampaignScope&{requestId:string;scheduledAt:string;confirmed:true}&(
 {listId:string;raw?:never;consentSource?:never;attested?:never}|(CampaignDirectRecipients&{listId?:never})
);
export type CampaignWorkspace={
 lists:{id:string;name:string;recipients:number}[];
 campaigns:(CampaignDeliveryMetrics&{id:string;subject:string;scheduled_at:string;cancelled_at:string|null})[];
 senderReady:boolean;senderIssues:string[];senderLabel:string;
};
type CampaignMembers={members:{email:string;consent_source:string;consent_at:string;suppression:string|null}[];hasMore:boolean};
/** Transport-independent port for the existing V6.1 campaign workflow.
 * No authentication or domain policy belongs in this browser interface. */
export interface CampaignWorkspaceApi {
 prepareEngagementEmailDraft(input:{data:CampaignScope}):Promise<{subject:string;body:string;url:string}>;
 readEngagementCampaignWorkspace(input:{data:CampaignScope}):Promise<CampaignWorkspace>;
 saveCampaignRecipientList(input:{data:CampaignScope&CampaignDirectRecipients&{name:string}}):Promise<{id:string}>;
 queueEngagementCampaign(input:{data:CampaignQueueInput}):Promise<{id:string}>;
 cancelEngagementCampaign(input:{data:CampaignScope&{campaignId:string}}):Promise<{ok:boolean}>;
 readCampaignListMembers(input:{data:CampaignScope&{listId:string;offset:number}}):Promise<CampaignMembers>;
 updateCampaignListMember(input:{data:CampaignScope&{listId:string;email:string;operation:"remove"|"withdraw";confirmed:true}}):Promise<{changed:boolean}>;
}
export type CampaignTransport={kind:"legacy"|"nest";api:CampaignWorkspaceApi};
