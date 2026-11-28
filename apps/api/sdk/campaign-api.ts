import type {BecomunaBrowserApi} from './client';
import type {CampaignWorkspaceApi,CampaignTransport,CampaignScope as Scope,CampaignDirectRecipients as Direct,CampaignQueueInput as Queue} from '../../../src/domain/campaign-workspace-api';
/** Typed campaign operations for the V6.1 workspace. No RPC fallback or
 * mutation replay; the caller retains its stable requestId on uncertainty. */
export function createCampaignApi(client:BecomunaBrowserApi):CampaignWorkspaceApi{
 function receipt<T>(result:{data?:T;error?:unknown;response:Response}):T{
  if(!result.response.ok||result.data===undefined)throw new Error('Campaign API operation could not be confirmed ('+result.response.status+')');
  return result.data;
 }
 return {
  prepareEngagementEmailDraft:async({data}:{data:Scope})=>receipt(await client.GET('/api/v1/engagement-email-draft',{params:{query:data}})),
  readEngagementCampaignWorkspace:async({data}: {data:Scope})=>receipt(await client.GET('/api/v1/engagement-campaigns/workspace',{params:{query:data}})),
  saveCampaignRecipientList:async({data}:{data:Scope&Direct&{name:string}})=>receipt(await client.POST('/api/v1/campaign-recipient-lists',{body:data})),
  queueEngagementCampaign:async({data}:{data:Queue})=>receipt(await client.POST('/api/v1/engagement-campaigns',{body:data})),
  cancelEngagementCampaign:async({data}:{data:Scope&{campaignId:string}})=>receipt(await client.POST('/api/v1/engagement-campaign-cancellations',{body:data})),
  readCampaignListMembers:async({data}:{data:Scope&{listId:string;offset:number}})=>receipt(await client.GET('/api/v1/campaign-recipient-lists/members',{params:{query:data}})),
  updateCampaignListMember:async({data}:{data:Scope&{listId:string;email:string;operation:'remove'|'withdraw';confirmed:true}})=>receipt(await client.POST('/api/v1/campaign-recipient-list-member-decisions',{body:data})),
 };
}

export function createNestCampaignTransport(client:BecomunaBrowserApi):CampaignTransport{
 return {kind:'nest',api:createCampaignApi(client)};
}
