export type AdmissionsStage="lead"|"inquiry"|"application"|"eligibility"|"accepted"|"declined"|"withdrawn";
export type AdmissionsPipelineItem={id:string;program:string;stage:AdmissionsStage;submittedAt:string|null;outstandingRequirements:number};
export const pipelineStages:AdmissionsStage[]=["lead","inquiry","application","eligibility","accepted","declined","withdrawn"];
export function admissionsPipelineSummary(items:AdmissionsPipelineItem[]){return {total:items.length,byStage:pipelineStages.map(stage=>({stage,count:items.filter(x=>x.stage===stage).length})),awaitingDecision:items.filter(x=>x.stage==="application"||x.stage==="eligibility").length,missingRequirements:items.reduce((n,x)=>n+x.outstandingRequirements,0)};}
