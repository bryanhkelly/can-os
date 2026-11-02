import { AuthorizationError } from "@/domain/command-context";

/** Permit only the current, server-computed, named-duty assignment. */
export type DutyAssignmentCandidate = {
  sectionId:string;
  periodId:string|null;
  programId:string;
  canRespond:boolean;
  canAccept:boolean;
  ownDutyRole?:"primary"|"backup"|null;
  planToken:string;
  /** Independently church-hosted blocks additionally require current named
   * facilitator safety evidence before an affirmative response. */
  requiresSectionDelegation?:boolean;
  /** Server-computed scheduled block times; both are non-null whenever
   * canRespond is true. */
  startsAtLocal:string|null;
  endsAtLocal:string|null;
};
export function selectAuthorizedOnsiteDuty(
  input:{
    siteMatches:boolean;
    projectionTruncated:boolean;
    scopedProgramIds:readonly string[];
    sectionId:string;
    periodId:string;
    response:"accepted"|"cannot_cover";
  },
  blocks:readonly DutyAssignmentCandidate[],
):DutyAssignmentCandidate {
  const block=blocks.find(row=>row.sectionId===input.sectionId&&
    row.periodId===input.periodId);
  if(!input.siteMatches||input.projectionTruncated||!block||
    !block.canRespond||!input.scopedProgramIds.includes(block.programId)||
    !block.planToken||(input.response==="accepted"&&!block.canAccept)) {
    throw new AuthorizationError("current named onsite duty assignment");
  }
  return block;
}

/** A changed room or schedule is not a substitution unless the named adult changed. */
export function isOnsiteDutySubstitution(current:{
  sectionId:string;periodId:string|null;planToken:string;facilitatorPersonId:string|null;
},prior:{
  sectionId:string|null;ownerPersonId:string|null;
  metadata:{periodId?:unknown;planToken?:unknown;dutyRole?:unknown};
}):boolean{
  return prior.metadata.dutyRole!=="backup"&&prior.sectionId===current.sectionId&&prior.metadata.periodId===current.periodId&&
    prior.metadata.planToken!==current.planToken&&!!prior.ownerPersonId&&
    prior.ownerPersonId!==current.facilitatorPersonId;
}

/** A prior response for the same immutable plan cannot be contradicted or
 * rewritten from another request. A new assignment gets a new plan token. */
export function resolveOnsiteDutyRetry(
  previous:{id:string;response:unknown;reason?:unknown}|null,
  requested:{response:"accepted"|"cannot_cover";reason?:string},
):{responseId:string;created:false;response:"accepted"|"cannot_cover"}|null {
  if(!previous)return null;
  if(previous.response!==requested.response||
     (previous.reason??null)!==(requested.reason??null))
    throw new AuthorizationError("duty already answered; contact the site leader");
  return {responseId:previous.id,created:false,response:requested.response};
}

/** Availability belongs to each named adult. One adult's response cannot
 * acknowledge the other adult's duty. Callers supply exact-block records. */
export function summarizeNamedDutyResponses(input:{
  primaryPersonId:string|null;backupPersonId:string|null;requiresBackup:boolean;actorPersonId:string|null;
},records:readonly {ownerPersonId:string|null;metadata:{response?:unknown}}[]){
  const response=(personId:string|null)=>{
    const record=personId?records.find(row=>row.ownerPersonId===personId):undefined;
    return record?.metadata.response==="accepted"?"accepted" as const:
      record?.metadata.response==="cannot_cover"?"cannot_cover" as const:"not_reported" as const;
  };
  const primaryStatus=response(input.primaryPersonId);
  const backupStatus=input.requiresBackup?response(input.backupPersonId):null;
  const status=primaryStatus==="cannot_cover"||backupStatus==="cannot_cover"?"cannot_cover" as const:
    primaryStatus==="accepted"&&(!input.requiresBackup||backupStatus==="accepted")?"accepted" as const:"not_reported" as const;
  const ownStatus=input.actorPersonId===input.primaryPersonId?primaryStatus:
    input.actorPersonId===input.backupPersonId?backupStatus??"not_reported" as const:"not_reported" as const;
  return {status,ownStatus,primaryStatus,backupStatus};
}
