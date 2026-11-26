import { StatCard } from "@/components/workspace/stat-card";

export interface AdmissionsStageCount { stage: string; count: number }
export const ADMISSIONS_STAGES = ["inquiry","application","eligibility","accepted","declined","withdrawn"] as const;
export function countAdmissionsStages<T extends {stage:string}>(records: readonly T[]): AdmissionsStageCount[] {
 return ADMISSIONS_STAGES.map(stage=>({stage,count:records.filter(row=>row.stage===stage).length}));
}
export function AdmissionsPipelineSummary({counts}:{counts:readonly AdmissionsStageCount[]}) {
 return <div className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="Admissions stage counts">
  {ADMISSIONS_STAGES.map(stage=>({stage,count:counts.find(row=>row.stage===stage)?.count??0})).map(({stage,count})=><StatCard key={stage} label={<span className="capitalize">{stage}</span>} value={count}/>)}
 </div>;
}
