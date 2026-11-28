import {z} from 'zod';
const uuid=z.string().uuid(),text=z.string(),count=z.number().int().nonnegative(),time=z.string().datetime({offset:true});
export const metricKeys=['publishedOpportunities','registrations','uniquePeople','active','withdrawn','waitlisted','sessionsScheduled','sessionsDelivered','verifiedAttendance','verifiedAttendees','assessmentsSubmitted','assessmentsFinalized','recordedCompletionOutcomes','formalCompletions','awardsIssued','awardsRevoked'] as const;
const metricShape=Object.fromEntries(metricKeys.map(key=>[key,count.nullable()])) as Record<typeof metricKeys[number],z.ZodNullable<typeof count>>;
export const reportParams=z.object({classId:uuid}).strict();
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const reportQuery=z.object({from:date,to:date}).strict();
export const recipientQuery=z.object({query:z.string().trim().min(2).max(80),after:uuid.optional()}).strict();
export const emptyQuery=z.object({}).strict();
const population=z.enum(['real','synthetic','unknown']);
const relationshipKinds=['affiliation','sponsorship','funding','provider','host','accreditation','endorsement','operator','partnership'] as const;
const kind=z.enum(relationshipKinds);
const status=z.enum(['pending','accepted','declined','withdrawn','revoked']);
export const reportResult=z.object({contractVersion:z.literal('0.1.0'),asOf:time,classId:uuid,period:z.object({from:time,to:time}).strict(),metrics:z.object(metricShape).strict(),definitions:z.array(z.object({key:z.enum(metricKeys),label:text,source:text,denominator:text,rule:text,timeBasis:text}).strict()).length(metricKeys.length),limitations:z.array(text),title:text,courseVersionId:uuid,deliverySiteId:uuid.nullable(),operatorOrganizationId:uuid,dataClassification:population,classificationBasis:z.literal('current_operating_organization_domain'),visibility:z.literal('authorized_provider_private'),publicationApproved:z.literal(false)}).strict();
export const receipt=z.object({id:uuid,status}).strict();
export const portfolio=z.object({population,asOf:time,connectedOrganizations:count,acceptedRelationships:count,acceptedWithReportingTerms:count,awaitingOurResponse:count,awaitingPartnerResponse:count,taggedPrograms:count,excludedUnclassifiedOrChanged:count,byKind:z.array(z.object({kind,count}).strict()).max(9)}).strict();
const s={type:'string' as const},id={...s,format:'uuid'},dt={...s,format:'date-time'},n={type:'integer' as const,minimum:0},b={type:'boolean' as const};
const obj=(properties:Record<string,any>,required=Object.keys(properties))=>({type:'object' as const,additionalProperties:false,properties,required});
const arr=(items:Record<string,any>,maxItems?:number)=>({type:'array' as const,items,...(maxItems?{maxItems}:{})});
const en=(values:readonly string[])=>({...s,enum:[...values]});
const metric=obj({metricKey:{...s,minLength:1,maxLength:128},definitionVersion:{...s,minLength:1,maxLength:64}});
export const inputs={
 proposal:obj({recipientOrganizationId:id,scopeKind:en(['organization','site','program','offering','class']),scopeId:id,relationshipKind:en(relationshipKinds),metrics:arr(metric,50),coverageMode:en(['prospective','from_date','all_history']),coverageFrom:{...dt,nullable:true},supersedesId:{...id,nullable:true},validThrough:{...dt,nullable:true}},['recipientOrganizationId','scopeKind','scopeId','relationshipKind','metrics','validThrough']),
 decision:obj({agreementId:id,action:en(['accept','decline','withdraw','revoke'])})
};
export const docs={
 report:obj({contractVersion:en(['0.1.0']),asOf:dt,classId:id,period:obj({from:dt,to:dt}),metrics:obj(Object.fromEntries(metricKeys.map(key=>[key,{...n,nullable:true}]))),definitions:arr(obj({key:en(metricKeys),label:s,source:s,denominator:s,rule:s,timeBasis:s}),16),limitations:arr(s),title:s,courseVersionId:id,deliverySiteId:{...id,nullable:true},operatorOrganizationId:id,dataClassification:en(population.options),classificationBasis:en(['current_operating_organization_domain']),visibility:en(['authorized_provider_private']),publicationApproved:{...b,enum:[false]}}),
 receipt:obj({id,status:en(status.options)}),
 portfolio:obj({population:en(population.options),asOf:dt,connectedOrganizations:n,acceptedRelationships:n,acceptedWithReportingTerms:n,awaitingOurResponse:n,awaitingPartnerResponse:n,taggedPrograms:n,excludedUnclassifiedOrChanged:n,byKind:arr(obj({kind:en(relationshipKinds),count:n}),9)})
};

const scopeKind=z.enum(['organization','site','program','offering','class']);
const geographyKind=z.enum(['region','state','county','metro','micro','csa']);
const coverageMode=z.enum(['prospective','from_date','all_history']);
const action=z.enum(['accept','decline','withdraw','revoke']);
const metricTerm=z.object({metricKey:text.min(1).max(128),definitionVersion:text.min(1).max(64)}).strict();
const named=z.object({id:uuid,name:text}).strict();
export const geographyQuery=z.object({basis:z.enum(['current','historical'])}).strict();
export const scopeQuery=z.object({kind:scopeKind,after:uuid.optional()}).strict();
export const requestQuery=z.object({direction:z.enum(['incoming','outgoing']),after:uuid.optional(),scopeKind:scopeKind.optional(),scopeId:uuid.optional()}).strict().refine(v=>(v.scopeKind===undefined)===(v.scopeId===undefined),'Both scopeKind and scopeId are required together');
const agreement=z.object({id:uuid,dataPopulation:population,ownerOrganizationId:uuid,recipientOrganizationId:uuid,scopeKind,scopeId:uuid,relationshipKind:kind,metrics:z.array(metricTerm).max(50),coverageMode:coverageMode.optional(),coverageFrom:time.nullable().optional(),supersedesId:uuid.nullable().optional(),validThrough:time.nullable(),proposedAt:time,status,acceptedAt:time.nullable()}).strict();
const setupCounts=z.object({configuredUnits:count,activeUnits:count,configuredMemberships:count,currentMemberships:count,configuredGrants:count,currentGrants:count,currentGrantHosts:count}).strict();
export const intelligenceResults={
 readiness:z.object({networkOrganizationId:uuid,asOf:time,counts:setupCounts,blockers:z.array(text),classification:z.literal('private_setup_inventory')}).strict(),
 geography:z.array(z.object({code:text,name:text,kind:geographyKind}).strict()).max(1000),
 sites:z.array(z.object({id:uuid,label:text}).strict()).max(1000),
 recipients:z.object({items:z.array(named).max(25),next:uuid.nullable()}).strict(),
 scopes:z.object({items:z.array(named).max(25),next:uuid.nullable(),metrics:z.array(metricTerm).max(50)}).strict(),
 requests:z.object({items:z.array(z.object({agreement,allowedActions:z.array(action),organizationName:text,scopeName:text,metricLabels:z.array(text),inherited:z.boolean()}).strict()).max(25),next:uuid.nullable(),canAuthorize:z.boolean(),metrics:z.array(metricTerm).max(50)}).strict(),
};
const namedDoc=obj({id,name:s});
const countDoc=obj(Object.fromEntries(Object.keys(setupCounts.shape).map(k=>[k,n])));
const agreementDoc=obj({id,dataPopulation:en(population.options),ownerOrganizationId:id,recipientOrganizationId:id,scopeKind:en(scopeKind.options),scopeId:id,relationshipKind:en(relationshipKinds),metrics:arr(metric,50),coverageMode:en(coverageMode.options),coverageFrom:{...dt,nullable:true},supersedesId:{...id,nullable:true},validThrough:{...dt,nullable:true},proposedAt:dt,status:en(status.options),acceptedAt:{...dt,nullable:true}},['id','dataPopulation','ownerOrganizationId','recipientOrganizationId','scopeKind','scopeId','relationshipKind','metrics','validThrough','proposedAt','status','acceptedAt']);
export const intelligenceDocs={
 readiness:obj({networkOrganizationId:id,asOf:dt,counts:countDoc,blockers:arr(s),classification:en(['private_setup_inventory'])}),
 geography:arr(obj({code:s,name:s,kind:en(geographyKind.options)}),1000),
 sites:arr(obj({id,label:s}),1000),
 recipients:obj({items:arr(namedDoc,25),next:{...id,nullable:true}}),
 scopes:obj({items:arr(namedDoc,25),next:{...id,nullable:true},metrics:arr(metric,50)}),
 requests:obj({items:arr(obj({agreement:agreementDoc,allowedActions:arr(en(action.options)),organizationName:s,scopeName:s,metricLabels:arr(s),inherited:b}),25),next:{...id,nullable:true},canAuthorize:b,metrics:arr(metric,50)}),
};
