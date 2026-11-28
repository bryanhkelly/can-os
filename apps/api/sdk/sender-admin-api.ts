import type {BecomunaBrowserApi,paths} from './client';
import {requireApiReceipt as receipt,type QueryOf,type JsonBodyOf} from './operation';
/** Explicit typed operations; no generic RPC dispatch, retry or fallback. */
export function createSenderAdminApi(client:BecomunaBrowserApi){
 return {
  readSenderAdministration:async({data}:{data:{organizationId?:string|null}})=>receipt(await client.GET('/api/v1/communication-senders/current',{params:{query:{organizationId:data.organizationId??undefined}}})),
  listSenderOrganizationsPage:async({data}:{data:QueryOf<paths['/api/v1/communication-senders/organizations']['get']>})=>receipt(await client.GET('/api/v1/communication-senders/organizations',{params:{query:data}})),
  changeSenderAdministration:async({data}:{data:JsonBodyOf<paths['/api/v1/communication-sender-approvals']['post']>})=>receipt(await client.POST('/api/v1/communication-sender-approvals',{body:data})),
  revokeSenderAdministration:async({data}:{data:JsonBodyOf<paths['/api/v1/communication-sender-revocations']['post']>})=>receipt(await client.POST('/api/v1/communication-sender-revocations',{body:data})),
 };
}
