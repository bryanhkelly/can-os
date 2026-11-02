/** Only an interruption against the exact still-current planned adults can
 * invalidate this block's prior arrival witness. Historical or unrelated
 * Section events must not contaminate another school's supervision status.
 */
export function hasOnsiteCoverageInterruption(input:{
 sectionId:string;periodId:string|null;planToken:string|null;
 primaryPersonId:string|null;backupPersonId:string|null;
},events:ReadonlyArray<{
 sectionId:string|null;personId:string|null;
 metadata:Record<string,unknown>;
}>):boolean{
 if(!input.periodId||!input.planToken)return false;
 return events.some(row=>row.sectionId===input.sectionId&&
  row.metadata.periodId===input.periodId&&
  row.metadata.planToken===input.planToken&&
  !!row.personId&&
  (row.personId===input.primaryPersonId||row.personId===input.backupPersonId));
}
