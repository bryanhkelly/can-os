import type {BecomunaBrowserApi,paths} from './client';
type Base='/api/v1/me/course-attempts/{courseAttemptId}';
type Body<S extends string>=S extends keyof paths?paths[S] extends {post:{requestBody:{content:{'application/json':infer B}}}}?B:never:never;
type Select=Body<`${Base}/instructor-selections`>;
type Complete=Body<`${Base}/recorded-lesson-completions`>;
type Practice=Body<`${Base}/practice-attempts`>;
type Download=Body<`${Base}/instruction-asset-access`>;
const problemCodes:Readonly<Record<number,string>>={400:'VALIDATION_FAILED',401:'AUTHENTICATION_REQUIRED',403:'FORBIDDEN',409:'CONFLICT',413:'PAYLOAD_TOO_LARGE',503:'UNAVAILABLE'};
export class RecordedInstructionApiError extends Error{
 readonly code:string;
 readonly status:number;
 constructor(status:number){
  super(status===413?'Practice exceeds the 1 MiB request limit. Shorten responses before retrying.':'Recorded instruction request failed.');
  this.name='RecordedInstructionApiError';
  this.status=status;
  this.code=problemCodes[status]??'UNEXPECTED';
 }
}
function result<T>(value:{data?:T;response:Response}):T{
 if(!value.response.ok||value.data===undefined)throw new RecordedInstructionApiError(value.response.status);
 return value.data;
}
/** Consumer adapter for the generated SDK. No source RPC, implicit role,
 * automatic retries or fallback. All private reads and commands use the
 * same course attempt path and ordinary browser session. */
export function recordedInstructionApi(client:BecomunaBrowserApi){
 const params=(courseAttemptId:string)=>({path:{courseAttemptId}});
 return {
  choices:async(id:string)=>result(await client.GET('/api/v1/me/course-attempts/{courseAttemptId}/instructors',{params:params(id)})),
  selected:async(id:string)=>result(await client.GET('/api/v1/me/course-attempts/{courseAttemptId}/instruction',{params:params(id)})),
  history:async(id:string,beforeId?:string)=>result(await client.GET('/api/v1/me/course-attempts/{courseAttemptId}/practice-history',{params:{...params(id),query:beforeId?{beforeId}:{}}})),
  select:async(id:string,body:Select)=>result(await client.POST('/api/v1/me/course-attempts/{courseAttemptId}/instructor-selections',{params:params(id),body})),
  complete:async(id:string,body:Complete)=>result(await client.POST('/api/v1/me/course-attempts/{courseAttemptId}/recorded-lesson-completions',{params:params(id),body})),
  download:async(id:string,body:Download)=>result(await client.POST('/api/v1/me/course-attempts/{courseAttemptId}/instruction-asset-access',{params:params(id),body})),
  practice:async(id:string,body:Practice)=>{
   if(new TextEncoder().encode(JSON.stringify(body)).byteLength>1024*1024)throw new RecordedInstructionApiError(413);
   return result(await client.POST('/api/v1/me/course-attempts/{courseAttemptId}/practice-attempts',{params:params(id),body}));
  },
 };
}
