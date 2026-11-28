import * as legacy from "./sender-registry.functions";
import type {z} from "zod";
import type {changeInput,revokeInput} from "./sender-registry.inputs";
type Data<T>={data:T};
type Organization={id:string;name:string};
type Cursor={afterName:string;afterId:string};
export interface SenderWorkspaceApi{
 readSenderAdministration(input:Data<{organizationId:string|null}>):ReturnType<typeof legacy.readSenderAdministration>;
 changeSenderAdministration(input:Data<z.input<typeof changeInput>>):Promise<unknown>;
 revokeSenderAdministration(input:Data<z.input<typeof revokeInput>>):Promise<unknown>;
 listSenderOrganizationsPage(input:Data<{limit:number;afterName?:string;afterId?:string}>):Promise<{items:Organization[];nextCursor:Cursor|null}>;
}
export type SenderWorkspaceTransport={kind:"legacy"|"nest";api:SenderWorkspaceApi};
export const legacySenderTransport:SenderWorkspaceTransport={kind:"legacy",api:{
 ...legacy,
 // Compatibility adapter only; the Nest endpoint uses native keyset pagination.
 async listSenderOrganizationsPage({data}){
  const all=await legacy.listSenderOrganizations();
  const index=data.afterId===undefined?-1:all.findIndex(row=>row.id===data.afterId&&row.name===data.afterName);
  if(data.afterId!==undefined&&index<0)throw new Error("Organization directory changed. Refresh.");
  const items=all.slice(index+1,index+1+data.limit),last=items.at(-1);
  return {items,nextCursor:index+1+items.length<all.length&&last?{afterName:last.name,afterId:last.id}:null};
 }
}};
