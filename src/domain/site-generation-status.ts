export type GenerationAttempt = {status:string;attempts:number;errorCode:string|null;updatedAt:Date};
export type GenerationEligibility = {allowed:boolean;code:string;message:string;attempts:number;retryAt:string|null};
export function generationEligibility(input:{attempt:GenerationAttempt|null;activeUntil:Date|null;dailyCount:number;configured:boolean;now:Date}):GenerationEligibility {
 const {attempt,activeUntil,dailyCount,configured,now}=input;
 const state=(allowed:boolean,code:string,message:string,retryAt:Date|null=null):GenerationEligibility=>({allowed,code,message,attempts:attempt?.attempts??0,retryAt:retryAt?.toISOString()??null});
 if(attempt?.status==="ready")return state(true,"ready","Reuse the saved content package.");
 if(activeUntil&&activeUntil>now)return state(false,"processing","Content generation is in progress.",activeUntil);
 if(!attempt&&dailyCount>=5)return state(false,"daily_limit","Daily generation limit reached. Try again later.");
 if(!configured)return state(false,"provider_unavailable","AI generation is not configured for this deployment.");
 const recoverable=attempt?.status==="failed"&&/^gloo_http_(400|401|403|404|422)$/.test(attempt.errorCode??"");
 if(attempt&&attempt.attempts>=3&&!recoverable)return state(false,"retry_limit","Retry limit reached for this input. Contact support or edit content manually.");
 if(recoverable&&attempt){
  const until=new Date(attempt.updatedAt.getTime()+300000);
  if(until>now)return state(false,"retry_cooldown","Correct the provider configuration before retrying.",until);
 }
 return state(true,attempt?.status==="failed"?"retry":"available",attempt?.status==="failed"?"Retry generation.":"Generate content.");
}
export function generationOutcomeMessage(outcome:{status:"ready"|"reused"|"processing"}|{status:"failed";code:string;message:string}){
 if(outcome.status==="failed")return {success:false,message:outcome.message+" ("+outcome.code+")"};
 if(outcome.status==="processing")return {success:false,message:"Content generation is already in progress."};
 return {success:true,message:"Site Intelligence content is ready."};
}
