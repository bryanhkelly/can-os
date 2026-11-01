/**
 * Official transcript issuance must not accept evidence that changed between
 * the authorized registrar preview and the final source-locked DB transaction.
 * Query row order (especially W enrollment rows) is not a version signal.
 */
export function assertUnchangedTranscriptProjection<T extends {sectionGradeId:string}>(
 preview:readonly T[],current:readonly T[],
):void{
 const normalized=(rows:readonly T[])=>{
  const ids=new Set<string>();
  const normalizedRows=rows.map(row=>{
   if(!row||typeof row.sectionGradeId!=="string"||!row.sectionGradeId)
    throw new Error("Transcript source identity missing");
   if(ids.has(row.sectionGradeId))throw new Error("Duplicated transcript source identity");
   ids.add(row.sectionGradeId);
   return {id:row.sectionGradeId,serialized:JSON.stringify(row)};
  });
  normalizedRows.sort((a,b)=>a.id.localeCompare(b.id));
  return normalizedRows;
 };
 const before=normalized(preview);
 const after=normalized(current);
 if(before.length!==after.length||
    before.some((row,index)=>row.id!==after[index]?.id||
       row.serialized!==after[index]?.serialized))
   throw new Error("Academic evidence changed during transcript issuance");
}
