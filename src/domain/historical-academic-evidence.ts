export type HistoricalAcademicPage={items:Array<{
 id:string;kind:"submission"|"section_grade";title:string;learnerName:string|null;
 status:string;attempt:number|null;response:string|null;feedback:string|null;score:string|null;
 maximum:string|null;letterGrade:string|null;submittedAt:string|null;finalizedAt:string|null
}>;nextBefore:string|null};
const obj=(x:unknown):Record<string,unknown>=>x&&typeof x==="object"&&!Array.isArray(x)?x as Record<string,unknown>:{};
const str=(x:unknown)=>typeof x==="string"?x:null;
const num=(x:unknown)=>typeof x==="number"&&Number.isFinite(x)?String(x):typeof x==="string"&&/^-?\d+(\.\d+)?$/.test(x)?x:null;
/** Explicit allowlist; never expose metadata, staff identifiers, draft feedback or raw JSON. */
export function projectHistoricalAcademicPage(rows:readonly Record<string,unknown>[],audience?:"guardian"):HistoricalAcademicPage{
 const items=rows.slice(0,20).map(row=>{
  const src=obj(row.source_record),grade=row.record_kind==="section_grade";
  const reviewed=src.status==="graded"||src.status==="returned";
  return {id:String(row.id),kind:grade?"section_grade" as const:"submission" as const,
   title:grade?"Historical finalized section grade":str(row.assignment_title)??"Historical assignment",
   learnerName:str(row.learner_name),status:str(src.status)??"unknown",
   attempt:!grade&&typeof src.attempt_number==="number"?src.attempt_number:null,
   response:grade||audience==="guardian"?null:str(obj(src.response).text),
   feedback:!grade&&reviewed?str(obj(src.feedback).comment):null,
   score:!grade&&reviewed?num(src.score):null,maximum:grade?null:num(row.points_possible),
   letterGrade:grade?str(src.letter_grade):null,submittedAt:grade?null:str(src.submitted_at),
   finalizedAt:grade?str(src.finalized_at):null};
 });
 return {items,nextBefore:rows.length>20?items.at(-1)?.id??null:null};
}
