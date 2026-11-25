/** Public projection of authorized revision rows. Never transport raw response JSON. */
export type SubmissionRevisionPage={
 items:Array<{revisionNo:number;status:string;responseText:string;practiceFeedback:string|null;
   practiceScore:number|null;practiceScoreMax:number|null;submittedAt:string|null;recordedAt:string;source:string}>;
 nextBefore:number|null;
};
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
const numberOrNull=(value:unknown)=>typeof value==="number"&&Number.isFinite(value)?value:null;
export function projectSubmissionRevisionPage(rows:readonly Record<string,unknown>[]):SubmissionRevisionPage{
 const items=rows.slice(0,20).map(row=>{
   const response=record(row.response);
   const practice=response.practiceResponse===true;
   return {revisionNo:Number(row.revision_no),status:String(row.status),
     responseText:typeof response.text==="string"?response.text:"",
     practiceFeedback:practice&&typeof response.teacherFeedback==="string"?response.teacherFeedback:null,
     practiceScore:practice?numberOrNull(response.practiceScore??response.demoScore):null,
     practiceScoreMax:practice?numberOrNull(response.practiceScoreMax??response.maxDemoScore):null,
     submittedAt:row.submitted_at==null?null:new Date(String(row.submitted_at)).toISOString(),
     recordedAt:new Date(String(row.recorded_at)).toISOString(),source:String(row.source)};
 });
 return {items,nextBefore:rows.length>20?items.at(-1)?.revisionNo??null:null};
}
