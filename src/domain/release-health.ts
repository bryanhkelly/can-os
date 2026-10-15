export type ReleaseHealth={buildId:string;schemaStatus:"unknown"|"aligned"|"missing_tables";demoWritesEnabled:boolean;details:string};
export function classifySchema(requiredTables:string[],existingTables:string[]):ReleaseHealth["schemaStatus"]{if(!existingTables.length)return "unknown";return requiredTables.every(t=>existingTables.includes(t))?"aligned":"missing_tables";}
export const requiredProfileTables=["qualification_claims","qualification_definitions","compliance_frameworks","qualification_verification_events"] as const;
