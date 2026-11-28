import {classifyOwnedData,isDemoAccountEmail,isEligiblePrivilegedMailbox} from "./domain-classification";
import type {SessionAuthenticationMethod} from "./session-credential-policy";

export type RelationshipPopulation="real"|"synthetic";
export function relationshipPopulation(domain:string|null):RelationshipPopulation|null{
  const value=classifyOwnedData(domain);
  return value==="unknown"?null:value;
}
export function canConnectRelationshipPopulations(owner:string|null,recipient:string|null):boolean{
  const population=relationshipPopulation(owner);
  return population!==null&&population===relationshipPopulation(recipient);
}
/** Applied only after the ordinary session and direct grant have been verified.
 * Synthetic identities can exercise the same business logic but never attest
 * real disclosure. Unknown ownership classification fails closed. */
export function relationshipIdentityEligible(input:{
  organizationDomain:string|null;email:string;mailboxVerified:boolean;
  authenticationMethod?:SessionAuthenticationMethod|null;
}):boolean{
  const population=relationshipPopulation(input.organizationDomain);
  if(population==="real")return input.mailboxVerified&&
    input.authenticationMethod==="email_link"&&isEligiblePrivilegedMailbox(input.email);
  return population==="synthetic"&&isDemoAccountEmail(input.email)&&
    (input.authenticationMethod==="local_demo_code"||input.authenticationMethod==="private_access_code");
}
