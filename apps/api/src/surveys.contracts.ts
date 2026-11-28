import {z} from 'zod';
const id=z.string().uuid(),s=z.string(),n=z.number().int().nonnegative(),b=z.boolean();
const audiences=['learner','guardian','professional','operator','any'] as const;
const types=['single_choice','multiple_choice','rating','likert','nps','text','matrix'] as const;
const reviews=['privacy','accessibility','safeguarding'] as const;
const decisions=['approved','rejected'] as const;
export const empty=z.object({}).strict();
export const course=z.object({courseAttemptId:id}).strict();
export const scope=course.extend({campaignId:id}).strict();
const draft=z.object({surveyId:id,versionId:id,code:s,title:s,purposeCode:s,versionNo:n,questionCount:n}).strict();
const approval=z.object({kind:z.enum(reviews),decision:s.nullable(),independent:b,evidenceCurrent:b}).strict();
const questionPreview=z.object({id,ordinal:n,prompt:s,type:z.enum(types),required:b,safetyTriage:b,options:z.array(s)}).strict();
const version=z.object({id,surveyId:id,title:s,code:s,purposeCode:s,audience:z.enum(audiences),versionNo:n,ownDraft:b,questionCount:n,publicationReady:b,approvals:z.array(approval),reviewPreviewComplete:b,questions:z.array(questionPreview)}).strict();
const learnerQuestion=z.object({id,prompt:s,type:z.enum(types),required:b,min:z.number().nullable(),max:z.number().nullable(),options:z.array(z.object({id,label:s}).strict())}).strict();
export const results={
 drafts:z.object({organizationId:id,surveyPublicationEnabled:z.literal(true),limit:z.literal(50),drafts:z.array(draft).max(50)}).strict(),
 draftReceipt:z.object({surveyId:id,surveyVersionId:id,lifecycle:z.literal('draft'),questionCount:n}).strict(),
 queue:z.object({organizationId:id,currentRole:z.enum(['reviewer','publisher']),limit:z.literal(50),evidence:z.array(z.object({id,kind:s}).strict()).max(1000),evidenceInventoryComplete:b,versions:z.array(version).max(50)}).strict(),
 reviewReceipt:z.object({reviewId:id,kind:z.enum(reviews),decision:z.enum(decisions)}).strict(),
 publication:z.object({surveyVersionId:id,lifecycle:z.literal('published')}).strict(),
 courseList:z.array(z.object({campaignId:id,title:s}).strict()).max(30),
 courseSurvey:z.object({campaignId:id,surveyVersionId:id,title:s,submitted:b,questions:z.array(learnerQuestion).max(100)}).strict(),
 response:z.object({responseId:id,alreadySubmitted:b}).strict()
};
const str={type:'string' as const},uuid={...str,format:'uuid'},integer={type:'integer' as const,minimum:0},bool={type:'boolean' as const};
const en=(values:readonly string[])=>({...str,enum:[...values]});
const txt=(minLength:number,maxLength:number)=>({...str,minLength,maxLength});
const obj=(properties:Record<string,any>,required=Object.keys(properties))=>({type:'object' as const,additionalProperties:false,properties,required});
const arr=(items:Record<string,any>,maxItems?:number)=>({type:'array' as const,items,...(maxItems===undefined?{}:{maxItems})});
const question=obj({prompt:txt(5,1000),type:en(types.filter(t=>t!=='matrix')),required:bool,options:arr(txt(1,250),12),ratingMin:{...integer,maximum:100,nullable:true},ratingMax:{...integer,minimum:1,maximum:100,nullable:true}});
const review=obj({surveyVersionId:uuid,kind:en(reviews),decision:en(decisions),evidenceVersionId:{...uuid,nullable:true},rationale:txt(20,1500)});
const answer=obj({questionId:uuid,text:{...str,maxLength:4000},number:{type:'number'},optionIds:arr(uuid,100)},['questionId']);
export const inputs={draft:obj({code:{...str,pattern:'^[a-z][a-z0-9_-]{2,63}$'},title:txt(5,160),purposeCode:{...str,pattern:'^[a-z][a-z0-9_-]{1,79}$'},intendedAudience:en(audiences),questions:{...arr(question,20),minItems:1}}),review,publish:obj({surveyVersionId:uuid}),submission:obj({courseAttemptId:uuid,campaignId:uuid,answers:arr(answer,100)})};
const draftDoc=obj({surveyId:uuid,versionId:uuid,code:str,title:str,purposeCode:str,versionNo:integer,questionCount:integer});
const approvalDoc=obj({kind:en(reviews),decision:{...str,nullable:true},independent:bool,evidenceCurrent:bool});
const qPreview=obj({id:uuid,ordinal:integer,prompt:str,type:en(types),required:bool,safetyTriage:bool,options:arr(str)});
const versionDoc=obj({id:uuid,surveyId:uuid,title:str,code:str,purposeCode:str,audience:en(audiences),versionNo:integer,ownDraft:bool,questionCount:integer,publicationReady:bool,approvals:arr(approvalDoc,3),reviewPreviewComplete:bool,questions:arr(qPreview,1000)});
const learnerDoc=obj({id:uuid,prompt:str,type:en(types),required:bool,min:{type:'number',nullable:true},max:{type:'number',nullable:true},options:arr(obj({id:uuid,label:str}))});
export const docs={drafts:obj({organizationId:uuid,surveyPublicationEnabled:{...bool,enum:[true]},limit:{...integer,enum:[50]},drafts:arr(draftDoc,50)}),draftReceipt:obj({surveyId:uuid,surveyVersionId:uuid,lifecycle:en(['draft']),questionCount:integer}),queue:obj({organizationId:uuid,currentRole:en(['reviewer','publisher']),limit:{...integer,enum:[50]},evidence:arr(obj({id:uuid,kind:str}),1000),evidenceInventoryComplete:bool,versions:arr(versionDoc,50)}),reviewReceipt:obj({reviewId:uuid,kind:en(reviews),decision:en(decisions)}),publication:obj({surveyVersionId:uuid,lifecycle:en(['published'])}),courseList:arr(obj({campaignId:uuid,title:str}),30),courseSurvey:obj({campaignId:uuid,surveyVersionId:uuid,title:str,submitted:bool,questions:arr(learnerDoc,100)}),response:obj({responseId:uuid,alreadySubmitted:bool})};
