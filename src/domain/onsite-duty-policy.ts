import { AuthorizationError } from "@/domain/command-context";

/** Permit only the current, server-computed, named-duty assignment. */
export type DutyAssignmentCandidate = {
  sectionId:string;
  periodId:string|null;
  programId:string;
  canRespond:boolean;
  canAccept:boolean;
  planToken:string;
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
