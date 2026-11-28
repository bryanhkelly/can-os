import {z} from 'zod';
const id=z.string().uuid(),s=z.string(),b=z.boolean(),v=z.number().int().positive();
const kinds=['program_model','community','experience','club','activity'] as const;
const delivery=['remote','onsite','hybrid'] as const;
const availability=['possible','conditional','unavailable','requires_research'] as const;
const catalogStatus=['supported','conditional','unavailable','review_required'] as const;
const named=z.object({id,name:s}).strict();
const component=z.object({id,key:s,kind:s,requirementMode:s,description:s.max(500).nullable(),requiresIndependentReview:b}).strict();
const template=z.object({blueprintId:id,title:s,blueprintVersionId:id,versionNo:v,programCode:s.nullable(),offeringCode:s.nullable(),linkedPublishedOffering:z.object({code:s,title:s,offeringVersionId:id,versionNo:v}).strict().nullable(),components:z.array(component)}).strict();
const configuration=z.object({configurationId:id,name:s,versionId:id,blueprintVersionId:id,revision:v,lifecycle:z.enum(['draft','frozen'])}).strict();
const reference=z.object({itemId:id,versionId:id,code:s,kind:z.enum(kinds),category:s,title:s,summary:s,versionNo:v,academicGradeRange:z.object({min:s,max:s}).strict().optional(),status:z.literal('reference_only')}).strict();
const offering=z.object({offeringId:id,offeringVersionId:id,code:s,title:s,versionNo:v}).strict();
const policy=z.object({policyVersionId:id,offeringVersionId:id,providerSupport:z.enum(availability),regulatoryStatus:z.enum(availability),catalogStatus:z.enum(catalogStatus),explanation:s}).strict();
const reviewItem=z.object({componentId:id,title:s,kind:s,summary:s}).strict();
export const params={site:z.object({siteId:id}).strict(),organization:z.object({organizationId:id}).strict()};
export const queries={empty:z.object({}).strict(),offerings:z.object({deliveryContext:z.enum(delivery)}).strict()};
export const results={
 references:z.array(reference),
 offerings:z.array(z.object({offering,availability:z.array(policy),activationEligible:z.literal(false)}).strict()),
 workspace:z.object({siteId:id,organizationId:id,canConfigure:b,canReview:b,canExecute:b,affiliations:z.array(z.object({code:s,label:s}).strict()),operations:z.array(named),templates:z.array(template),configurations:z.array(configuration)}).strict().superRefine((value,ctx)=>{if(!value.canConfigure&&(value.configurations.length||value.operations.length||value.affiliations.length||value.canReview||value.canExecute))ctx.addIssue({code:'custom',message:'Read-only workspace contains private planning data'});}),
 queue:z.array(z.object({configurationId:id,configurationVersionId:id,owningOrganizationId:id,name:s,blueprintTitle:s,revision:v,siteId:id.nullable(),editorialIdentity:s, religiousAffiliationCode:s.nullable(),latestDecision:s,references:z.array(reviewItem),offeringIntents:z.array(z.object({componentId:id,title:s,code:s,offeringVersionNo:v}).strict()),localExperiences:z.array(reviewItem),selectedComponents:z.array(z.object({componentId:id,key:s,kind:s}).strict())}).strict()),
 evidence:z.array(z.object({id,title:s,kind:s}).strict())
};
const str={type:'string' as const},uuid={...str,format:'uuid'},bool={type:'boolean' as const},version={type:'integer' as const,minimum:1};
const en=(values:readonly string[])=>({...str,enum:[...values]});
const obj=(properties:Record<string,any>,required=Object.keys(properties))=>({type:'object' as const,additionalProperties:false,properties,required});
const arr=(items:Record<string,any>)=>({type:'array' as const,items});
const nullable={...str,nullable:true};
const componentDoc=obj({id:uuid,key:str,kind:str,requirementMode:str,description:{...nullable,maxLength:500},requiresIndependentReview:bool});
const productDoc=obj({code:str,title:str,offeringVersionId:uuid,versionNo:version});
const reviewItemDoc=obj({componentId:uuid,title:str,kind:str,summary:str});
export const docs={
 references:arr(obj({itemId:uuid,versionId:uuid,code:str,kind:en(kinds),category:str,title:str,summary:str,versionNo:version,academicGradeRange:obj({min:str,max:str}),status:en(['reference_only'])},['itemId','versionId','code','kind','category','title','summary','versionNo','status'])),
 offerings:arr(obj({offering:obj({offeringId:uuid,offeringVersionId:uuid,code:str,title:str,versionNo:version}),availability:arr(obj({policyVersionId:uuid,offeringVersionId:uuid,providerSupport:en(availability),regulatoryStatus:en(availability),catalogStatus:en(catalogStatus),explanation:str})),activationEligible:{...bool,enum:[false]}})),
 workspace:obj({siteId:uuid,organizationId:uuid,canConfigure:bool,canReview:bool,canExecute:bool,affiliations:arr(obj({code:str,label:str})),operations:arr(obj({id:uuid,name:str})),templates:arr(obj({blueprintId:uuid,title:str,blueprintVersionId:uuid,versionNo:version,programCode:nullable,offeringCode:nullable,linkedPublishedOffering:{...productDoc,nullable:true},components:arr(componentDoc)})),configurations:arr(obj({configurationId:uuid,name:str,versionId:uuid,blueprintVersionId:uuid,revision:version,lifecycle:en(['draft','frozen'])}))}),
 queue:arr(obj({configurationId:uuid,configurationVersionId:uuid,owningOrganizationId:uuid,name:str,blueprintTitle:str,revision:version,siteId:{...uuid,nullable:true},editorialIdentity:str,religiousAffiliationCode:nullable,latestDecision:str,references:arr(reviewItemDoc),offeringIntents:arr(obj({componentId:uuid,title:str,code:str,offeringVersionNo:version})),localExperiences:arr(reviewItemDoc),selectedComponents:arr(obj({componentId:uuid,key:str,kind:str}))})),
 evidence:arr(obj({id:uuid,title:str,kind:str}))
};
