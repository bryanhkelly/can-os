import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {getIdentityContext} from "./command-context.server";
import {requestCanonicalCredentialIssuerApprovalService,getMyCredentialIssuerApprovalService,listActiveCredentialIssuerApprovalsService,listPendingCredentialIssuerApprovalsService,reviewCanonicalCredentialIssuerApprovalService,revokeCanonicalCredentialIssuerApprovalService,requestSchema,reviewSchema,revokeSchema} from "./canonical-sensitive-approvals.server";
function protect(){setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");}

export const requestCanonicalCredentialIssuerApproval=createServerFn({method:"POST"})
  .validator((raw:unknown)=>requestSchema.parse(raw))
  .handler(async({data})=>{
    protect();const request=getRequest();const actor=await getIdentityContext(request);
    return requestCanonicalCredentialIssuerApprovalService(actor,request,data);
  });

export const getMyCredentialIssuerApproval=createServerFn({method:"GET"})
  .handler(async()=>{
    protect();const request=getRequest();const actor=await getIdentityContext(request);
    return getMyCredentialIssuerApprovalService(actor);
  });

export const listActiveCredentialIssuerApprovals=createServerFn({method:"GET"})
  .handler(async()=>{
    protect();const request=getRequest();const actor=await getIdentityContext(request);
    return listActiveCredentialIssuerApprovalsService(actor);
  });

export const listPendingCredentialIssuerApprovals=createServerFn({method:"GET"})
  .handler(async()=>{
    protect();const request=getRequest();const actor=await getIdentityContext(request);
    return listPendingCredentialIssuerApprovalsService(actor);
  });

export const reviewCanonicalCredentialIssuerApproval=createServerFn({method:"POST"})
  .validator((raw:unknown)=>reviewSchema.parse(raw))
  .handler(async({data})=>{
    protect();const request=getRequest();const actor=await getIdentityContext(request);
    return reviewCanonicalCredentialIssuerApprovalService(actor,request,data);
  });

export const revokeCanonicalCredentialIssuerApproval=createServerFn({method:"POST"})
  .validator((raw:unknown)=>revokeSchema.parse(raw))
  .handler(async({data})=>{
    protect();const request=getRequest();const actor=await getIdentityContext(request);
    return revokeCanonicalCredentialIssuerApprovalService(actor,request,data);
  });
