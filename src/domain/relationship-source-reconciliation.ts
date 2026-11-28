/** Internal coverage diagnostic. A complete join is necessary, not sufficient
 * for report disclosure. Never use owner-wide counts as a recipient metric. */
export type RegistrationSourceCoverage={status:"no_source_evidence"|"source_join_incomplete"|"source_join_reconciled";candidateRecords:number;joinedRecords:number;unmatchedRecords:number;sourceCompletenessVerified:false};
export function reconcileRegistrationSource(candidateRecords:number,joinedRecords:number):RegistrationSourceCoverage{
 if(!Number.isSafeInteger(candidateRecords)||!Number.isSafeInteger(joinedRecords)||candidateRecords<0||joinedRecords<0||joinedRecords>candidateRecords)throw Error("Registration source counts do not reconcile");
 return {status:candidateRecords===0?"no_source_evidence":joinedRecords===candidateRecords?"source_join_reconciled":"source_join_incomplete",candidateRecords,joinedRecords,unmatchedRecords:candidateRecords-joinedRecords,sourceCompletenessVerified:false};
}
