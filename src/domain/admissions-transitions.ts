export type ApplicationStage="lead"|"inquiry"|"application"|"eligibility"|"accepted"|"declined"|"withdrawn";
export function assertApplicationAcceptance(stage:ApplicationStage):void{
 if(stage==="accepted")return;
 if(stage!=="application"&&stage!=="eligibility")throw new Error("Only submitted or eligibility-reviewed applications can be accepted");
}
export function assertApplicationRetryOwnership(found:{submittedByPersonId:string;programId:string},actorPersonId:string,requestedProgramId:string):void{
 if(found.submittedByPersonId!==actorPersonId||found.programId!==requestedProgramId)throw new Error("Idempotency key belongs to another application context");
}
