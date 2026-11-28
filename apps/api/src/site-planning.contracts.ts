import {z} from 'zod';
const uuid=z.string().uuid(),str=z.string(),bool=z.boolean(),revision=str.datetime({offset:true});
const siteTypes=['church_community','faith_based_org','community_nonprofit','school_education','training_workforce','independent_initiative','other'] as const;
const traditions=['christian','muslim','jewish','hindu','buddhist','sikh','interfaith','other',''] as const;
const tax=['not_provided','recognized_501c3','qualifying_church','group_exemption','fiscal_sponsor','pending','not_tax_exempt','unsure'] as const;
const deliveries=['physical','digital','both'] as const;
const interests=['grades-6-8','grades-9-12','afterschool','summer','adult','senior'] as const;
const timings=['weekdays','weekends','daytime','evenings'] as const;
const audiences=['early_childhood','children','teens','college_students','young_adults','adults','older_adults','families','parents','single_parents','caregivers','foster_families','low_income_households','homelessness','housing_insecure','unemployed','immigrants','refugees','newcomers','english_language_learners','veterans','military_families','justice_impacted','foster_youth','disconnected_youth','disabilities','rural_communities','underserved_communities','digitally_underserved'] as const;
const identityBase={faithOrientation:z.enum(['faith_based','not_faith_based','undecided']),faithTradition:z.enum(traditions)};
const identity=z.object({siteType:z.enum(siteTypes),...identityBase}).strict();
const identityRead=z.object({siteType:z.union([z.enum(siteTypes),z.literal('')]),...identityBase}).strict();
const host=z.object({hostingMode:z.enum(['same','different','undecided']),separateHostName:str.max(160),separateHostType:z.enum(['church','community_nonprofit','education_provider','other','']),hostWebsiteUrl:str.max(2048).optional(),nonprofitStatus:z.enum(tax).optional(),nonprofitSubject:z.enum(['responsible','host','sponsor']).optional(),nonprofitOrganizationName:str.max(160).optional(),nonprofitEin:str.regex(/^(?:\d{2}-?\d{7})?$/).optional()}).strict();
const spaces=['owned_leased','shared_hosted','planned',''] as const;
const environment=z.object({delivery:z.enum(deliveries),physicalSpaceArrangement:z.enum(spaces)}).strict();
const story=z.object({motivations:z.array(z.enum(['access','belonging','personalized','practical','alternative','creative','character','need'])).max(3),communityNeed:str.max(1000),distinctives:z.array(z.enum(['flexible','community','personal','hands-on','faith','service','creative','technology'])).max(8),foundingStory:str.max(2000),values:z.array(z.enum(['belonging','curiosity','excellence','integrity','creativity','service','opportunity','family'])).max(8),experiences:z.array(z.enum(['known','confidence','interests','mastery','skills','purpose'])).max(6),futureVision:str.max(2000)}).strict();
const codes=z.array(str.min(3).max(128)).max(30);
const detail=z.object({id:str,activityIds:z.array(str).max(4),outcomeIds:z.array(str).max(3),audienceIds:z.array(z.enum(audiences)).max(audiences.length),programIds:z.array(z.enum(interests)).max(6),programCodes:codes.optional(),priority:z.enum(['featured','planned','exploring'])}).strict();
const intent=z.object({interestIds:z.array(z.enum(interests)).max(6),timingIds:z.array(z.enum(timings)).max(4),audienceIds:z.array(z.enum(audiences)).max(audiences.length),startingFocus:z.enum(interests).nullable(),programCodes:codes.optional(),startingProgramCode:str.min(3).max(128).nullable().optional(),experienceIds:z.array(str).optional(),customExperiences:z.array(str.min(2).max(100)).max(12).optional(),experienceDetails:z.array(detail).max(5).optional()}).strict();
const writeIntent=intent.superRefine((v,ctx)=>{if((v.experienceIds?.length??0)+(v.customExperiences?.length??0)>5)ctx.addIssue({code:'custom',message:'Choose at most five Experiences'});});
export const siteParams=z.object({siteId:uuid}).strict();
const base={expectedRevision:revision};
export const informationBody=z.discriminatedUnion('section',[
 z.object({...base,section:z.literal('identity'),identity}).strict(),
 z.object({...base,section:z.literal('hosting'),host}).strict(),
 z.object({...base,section:z.literal('environment'),environment}).strict(),
 z.object({...base,section:z.literal('story'),story}).strict()
]);
export const audiencesBody=z.object({...base,intent:writeIntent}).strict();
const range=z.object({min:str,max:str}).strict();
const deliveryModel=z.object({onsite:bool.optional(),asynchronous:bool.optional(),liveOnline:bool.optional(),onsiteDaysPerWeek:z.number().int().min(1).max(7).optional()}).strict();
const reference=z.object({itemId:uuid,versionId:uuid,code:str,kind:str,category:str,title:str,summary:str,versionNo:z.number().int().positive(),academicGradeRange:range.nullable().optional(),status:z.literal('reference_only')}).strict();
export const results={
 information:z.object({siteId:uuid,revision,identity:identityRead,identitySaved:bool,host,hostingSaved:bool,environment:environment.extend({delivery:z.enum(['physical','digital','both',''])}),environmentSaved:bool,story,storyRevision:revision.nullable()}).strict(),
 audiences:z.object({siteId:uuid,revision,intent,delivery:z.enum(deliveries).nullable(),schoolYearAvailability:z.object({'grades-6-8':bool,'grades-9-12':bool}).strict(),schoolYearAcademyPrograms:z.array(reference),saved:bool}).strict(),
 existing:z.object({siteId:uuid,programs:z.array(z.object({id:uuid,name:str,type:str,status:str,gradeRange:range,deliveryModel}).strict()),visibility:z.enum(['whole_site','assigned'])}).strict(),
 saved:z.object({siteId:uuid,revision,updated:bool}).strict()
};
const s={type:'string' as const},id={...s,format:'uuid'},dt={...s,format:'date-time'},b={type:'boolean' as const};
const en=(values:readonly string[])=>({...s,enum:[...values]});
const obj=(properties:Record<string,any>,required=Object.keys(properties))=>({type:'object' as const,additionalProperties:false,properties,required});
const arr=(items:Record<string,any>,maxItems?:number)=>({type:'array' as const,items,...(maxItems===undefined?{}:{maxItems})});
const max=(maxLength:number)=>({...s,maxLength});
const identityDoc=obj({siteType:en(siteTypes),faithOrientation:en(['faith_based','not_faith_based','undecided']),faithTradition:en(traditions)});
const hostDoc=obj({hostingMode:en(['same','different','undecided']),separateHostName:max(160),separateHostType:en(['church','community_nonprofit','education_provider','other','']),hostWebsiteUrl:max(2048),nonprofitStatus:en(tax),nonprofitSubject:en(['responsible','host','sponsor']),nonprofitOrganizationName:max(160),nonprofitEin:{...s,pattern:'^(?:[0-9]{2}-?[0-9]{7})?$'}},['hostingMode','separateHostName','separateHostType']);
const environmentDoc=obj({delivery:en(deliveries),physicalSpaceArrangement:en(spaces)});
const storyDoc=obj({motivations:arr(en(['access','belonging','personalized','practical','alternative','creative','character','need']),3),communityNeed:max(1000),distinctives:arr(en(['flexible','community','personal','hands-on','faith','service','creative','technology']),8),foundingStory:max(2000),values:arr(en(['belonging','curiosity','excellence','integrity','creativity','service','opportunity','family']),8),experiences:arr(en(['known','confidence','interests','mastery','skills','purpose']),6),futureVision:max(2000)});
const code={...s,minLength:3,maxLength:128};
const detailDoc=obj({id:s,activityIds:arr(s,4),outcomeIds:arr(s,3),audienceIds:arr(en(audiences),audiences.length),programIds:arr(en(interests),6),programCodes:arr(code,30),priority:en(['featured','planned','exploring'])},['id','activityIds','outcomeIds','audienceIds','programIds','priority']);
const intentFields={interestIds:arr(en(interests),6),timingIds:arr(en(timings),4),audienceIds:arr(en(audiences),audiences.length),startingFocus:{...en(interests),nullable:true},programCodes:arr(code,30),startingProgramCode:{...code,nullable:true},experienceIds:arr(s),customExperiences:arr({...s,minLength:2,maxLength:100},12),experienceDetails:arr(detailDoc,5)};
const intentRequired=['interestIds','timingIds','audienceIds','startingFocus'];
const intentDoc=obj(intentFields,intentRequired);
const rangeDoc=obj({min:s,max:s});
const referenceDoc=obj({itemId:id,versionId:id,code:s,kind:s,category:s,title:s,summary:s,versionNo:{type:'integer',minimum:1},academicGradeRange:{...rangeDoc,nullable:true},status:en(['reference_only'])},['itemId','versionId','code','kind','category','title','summary','versionNo','status']);
export const docs={
 informationBody:{oneOf:[obj({expectedRevision:dt,section:en(['identity']),identity:identityDoc}),obj({expectedRevision:dt,section:en(['hosting']),host:hostDoc}),obj({expectedRevision:dt,section:en(['environment']),environment:environmentDoc}),obj({expectedRevision:dt,section:en(['story']),story:storyDoc})],discriminator:{propertyName:'section'}},
 audiencesBody:obj({expectedRevision:dt,intent:obj({...intentFields,experienceIds:arr(s,5),customExperiences:arr({...s,minLength:2,maxLength:100},5)},intentRequired)}),
 information:obj({siteId:id,revision:dt,identity:obj({...identityDoc.properties,siteType:en([...siteTypes,''])}),identitySaved:b,host:hostDoc,hostingSaved:b,environment:obj({...environmentDoc.properties,delivery:en([...deliveries,''])}),environmentSaved:b,story:storyDoc,storyRevision:{...dt,nullable:true}}),
 audiences:obj({siteId:id,revision:dt,intent:intentDoc,delivery:{...en(deliveries),nullable:true},schoolYearAvailability:obj({'grades-6-8':b,'grades-9-12':b}),schoolYearAcademyPrograms:arr(referenceDoc),saved:b}),
 existing:obj({siteId:id,programs:arr(obj({id,name:s,type:s,status:s,gradeRange:rangeDoc,deliveryModel:obj({onsite:b,asynchronous:b,liveOnline:b,onsiteDaysPerWeek:{type:'integer',minimum:1,maximum:7}},[])})),visibility:en(['whole_site','assigned'])}),
 saved:obj({siteId:id,revision:dt,updated:b})
};

export {audiences as sitePlanningAudienceWireIds,identity as siteIdentityWireSchema,identityDoc as siteIdentityOpenApiSchema};
