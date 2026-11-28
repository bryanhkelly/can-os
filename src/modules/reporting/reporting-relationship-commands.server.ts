import {proposeReportingRelationship,decideReportingRelationship} from "./bottom-up-reporting-relationships.server";
/** Acknowledgements expose no participant facts or private reviewer identities. */
export async function requestReportingRelationshipService(request:Request,raw:unknown){
 const {id,status}=await proposeReportingRelationship(request,raw);return {id,status};
}
export async function decideRelationshipRequestService(request:Request,raw:unknown){
 const {id,status}=await decideReportingRelationship(request,raw);return {id,status};
}
