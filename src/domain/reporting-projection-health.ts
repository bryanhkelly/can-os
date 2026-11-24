export type ProjectionHealthCounts={
 eligible:number;accepted:number;duplicate:number;legacy:number;retryPending:number;deadLetter:number;missing:number;normalizedMissing:number;dueRetries:number;
};
export function assessProjectionHealth(input:{enabled:boolean;storageReady:boolean;counts:ProjectionHealthCounts|null}){
 const {enabled,storageReady,counts}=input;
 if(!storageReady||!counts)return "unavailable" as const;
 if(!enabled)return "disabled" as const;
 if(Object.values(counts).some(n=>!Number.isSafeInteger(n)||n<0)||
   counts.eligible!==counts.accepted+counts.duplicate+counts.legacy+counts.retryPending+counts.deadLetter+counts.missing||
   counts.normalizedMissing>counts.missing||counts.dueRetries>counts.retryPending)
   return "unreconciled" as const;
 if(counts.missing||counts.retryPending||counts.deadLetter||counts.legacy)return "attention" as const;
 return counts.eligible?"reconciled" as const:"no_evidence" as const;
}
