import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {z} from "zod";
import {relationshipProposalSchema,relationshipScopeKinds} from "@/domain/bottom-up-reporting-relationships";
const uuid=z.string().uuid();
const noStore=()=>setResponseHeader("Cache-Control","private, no-store");
export const requestReportingRelationship=createServerFn({method:"POST"})
  .validator((value:unknown)=>relationshipProposalSchema.parse(value))
  .handler(async({data})=>{
    noStore();
    const {requestReportingRelationshipService}=await import("./reporting-relationship-commands.server");
    return requestReportingRelationshipService(getRequest(),data);
  });
export const decideRelationshipRequest=createServerFn({method:"POST"})
  .validator((value:unknown)=>z.object({agreementId:uuid,action:z.enum(["accept","decline","withdraw","revoke"])}).strict().parse(value))
  .handler(async({data})=>{
    noStore();
    const {decideRelationshipRequestService}=await import("./reporting-relationship-commands.server");
    return decideRelationshipRequestService(getRequest(),data);
  });
export const findRelationshipRecipients=createServerFn({method:"GET"})
  .validator((value:unknown)=>z.object({query:z.string().trim().min(2).max(80),after:uuid.optional()}).strict().parse(value))
  .handler(async({data})=>{
    noStore();
    const service=await import("./bottom-up-reporting-relationships.server");
    return service.searchRelationshipRecipients(getRequest(),data);
  });
export const getRelationshipRequests=createServerFn({method:"GET"})
  .validator((value:unknown)=>z.object({direction:z.enum(["incoming","outgoing"]),after:uuid.optional(),scope:relationshipProposalSchema.pick({scopeKind:true,scopeId:true}).optional()}).strict().parse(value))
  .handler(async({data})=>{
    noStore();
    const service=await import("./bottom-up-reporting-relationships.server");
    return service.listReportingRelationships(getRequest(),data);
  });
export const getRelationshipScopes=createServerFn({method:"GET"})
  .validator((value:unknown)=>z.object({kind:z.enum(relationshipScopeKinds),after:uuid.optional()}).strict().parse(value))
  .handler(async({data})=>{
    noStore();
    const service=await import("./bottom-up-reporting-relationships.server");
    return service.listRelationshipScopes(getRequest(),data);
  });

export const getRelationshipPortfolio=createServerFn({method:"GET"}).handler(async()=>{
  noStore();
  const service=await import("./bottom-up-reporting-relationships.server");
  return service.readRelationshipPortfolio(getRequest());
});
