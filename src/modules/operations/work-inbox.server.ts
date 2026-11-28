import {getIdentityContext} from "@/modules/identity/command-context.server";
import {AuthorizationError} from "@/domain/command-context";
import {hasRegistrarAuthority} from "@/domain/school-roles";
import {parseCommandInput} from "@/domain/command-input";
import {getOperationsActionsService} from "./action-workspace.server";
import {getMyCredentialIssuerApprovalService,listPendingCredentialIssuerApprovalsService} from "@/modules/identity/canonical-sensitive-approvals.server";
import {workInboxSchema} from "./manual-work.inputs";

type InboxItem={id:string;title:string;status:string;priority:"critical"|"high"|"normal";siteId:string|null;programId:string|null;dueAt:string|null;createdAt:string;href:string};
type InboxSource={source:"operations"|"credential_request"|"credential_review";items:InboxItem[];possiblyTruncated:boolean;limit:number;href:string};
/** An inbox is a projection of existing authorized queues, not a second work store.
 * No caller-controlled role or source dispatch. Unknown grants fail closed. */
export async function getWorkInboxService(request:Request,raw:unknown){
 parseCommandInput(workInboxSchema,raw);
 const actor=await getIdentityContext(request);
 if(!actor.actorPersonId)throw new AuthorizationError("verified Person");
 const sources:InboxSource[]=[];
 if(hasRegistrarAuthority(actor.role)){
  const queue=await getOperationsActionsService(request,{});
  sources.push({source:"operations",items:queue.items.map(row=>({id:row.id,
   title:row.type==="operational_task"?row.title:"Operational follow-up: "+row.type.replaceAll("_"," "),
   status:row.status,priority:row.priority,siteId:row.siteId,programId:row.programId,dueAt:row.dueAt,createdAt:row.createdAt,href:"/home"})),possiblyTruncated:queue.items.length===250,limit:250,href:"/home"});
  // Independent credential status is only available for the original exact Site grant.
  if(actor.grantSiteId&&actor.scope.siteIds?.length===1&&actor.scope.organizationIds?.length===1&&!actor.sessionAccountId&&!actor.delegatedByPlatformOwner){
   const own=await getMyCredentialIssuerApprovalService(request);
   sources.push({source:"credential_request",items:own?[{id:own.id,title:"Credential issuer authority",status:own.status,priority:"normal",siteId:actor.grantSiteId,programId:null,dueAt:null,createdAt:own.requestedAt.toISOString(),href:"/canonical/issuer-access"}]:[],possiblyTruncated:false,limit:1,href:"/canonical/issuer-access"});
  }
 }else if(actor.role==="can_credential_reviewer"){
  const pending=await listPendingCredentialIssuerApprovalsService(request);
  sources.push({source:"credential_review",items:pending.slice(0,100).map(row=>({id:row.id,title:"Independent credential issuer review",status:"pending",priority:"normal",siteId:row.siteId,programId:null,dueAt:null,createdAt:row.requestedAt.toISOString(),href:"/canonical/issuer-access"})),possiblyTruncated:pending.length>100,limit:100,href:"/canonical/issuer-access"});
 }else throw new AuthorizationError("supported work inbox appointment");
 return {sources};
}
