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
const metricChoice=metricTerm.extend({label:text});
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
 scopes:z.object({items:z.array(named).max(25),next:uuid.nullable(),metrics:z.array(metricChoice).max(50)}).strict(),
 requests:z.object({items:z.array(z.object({agreement,allowedActions:z.array(action),organizationName:text,scopeName:text,metricLabels:z.array(text),inherited:z.boolean()}).strict()).max(25),next:uuid.nullable(),canAuthorize:z.boolean(),metrics:z.array(metricChoice).max(50)}).strict(),
};
const namedDoc=obj({id,name:s});
const metricChoiceDoc=obj({metricKey:{...s,minLength:1,maxLength:128},definitionVersion:{...s,minLength:1,maxLength:64},label:s});
const countDoc=obj(Object.fromEntries(Object.keys(setupCounts.shape).map(k=>[k,n])));
const agreementDoc=obj({id,dataPopulation:en(population.options),ownerOrganizationId:id,recipientOrganizationId:id,scopeKind:en(scopeKind.options),scopeId:id,relationshipKind:en(relationshipKinds),metrics:arr(metric,50),coverageMode:en(coverageMode.options),coverageFrom:{...dt,nullable:true},supersedesId:{...id,nullable:true},validThrough:{...dt,nullable:true},proposedAt:dt,status:en(status.options),acceptedAt:{...dt,nullable:true}},['id','dataPopulation','ownerOrganizationId','recipientOrganizationId','scopeKind','scopeId','relationshipKind','metrics','validThrough','proposedAt','status','acceptedAt']);
export const intelligenceDocs={
 readiness:obj({networkOrganizationId:id,asOf:dt,counts:countDoc,blockers:arr(s),classification:en(['private_setup_inventory'])}),
 geography:arr(obj({code:s,name:s,kind:en(geographyKind.options)}),1000),
 sites:arr(obj({id,label:s}),1000),
 recipients:obj({items:arr(namedDoc,25),next:{...id,nullable:true}}),
 scopes:obj({items:arr(namedDoc,25),next:{...id,nullable:true},metrics:arr(metricChoiceDoc,50)}),
 requests:obj({items:arr(obj({agreement:agreementDoc,allowedActions:arr(en(action.options)),organizationName:s,scopeName:s,metricLabels:arr(s),inherited:b}),25),next:{...id,nullable:true},canAuthorize:b,metrics:arr(metricChoiceDoc,50)}),
};

const nonblank=z.string().min(1);
const sourceDomain=z.enum(['native_class','noncredit_pilot','go_link','campaign_delivery']);
const definition=z.object({metricKey:nonblank,definitionVersion:nonblank,sourceDomain,sourceMetricKey:nonblank,label:nonblank,source:nonblank,denominator:nonblank,rule:nonblank,timeBasis:nonblank,disclosure:z.literal('private_operational')}).strict();
const definitionDoc=obj({metricKey:s,definitionVersion:s,sourceDomain:en(sourceDomain.options),sourceMetricKey:s,label:s,source:s,denominator:s,rule:s,timeBasis:s,disclosure:en(['private_operational'])});
const countRecord=<K extends string>(keys:readonly K[])=>z.object(Object.fromEntries(keys.map(key=>[key,count])) as Record<K,typeof count>).strict();
const countRecordDoc=(keys:readonly string[])=>obj(Object.fromEntries(keys.map(key=>[key,n])));
const healthKeys=['eligible','accepted','duplicate','legacy','retryPending','deadLetter','missing','normalizedMissing','dueRetries'] as const;
const healthStatus=z.enum(['unavailable','disabled','unreconciled','attention','reconciled','no_evidence']);
const campaignKeys=['total','pending','accepted','delivered','bounced','complained','failed','unconfirmed','suppressed','cancelled'] as const;
const coverageKeys=['legacyEvents','duplicateEvents','retryPendingEvents','deadLetterEvents','unprojectedEvents','unresolvedCorrections'] as const;
const coverageStatus=z.enum(['no_source_evidence','source_unreconciled','source_normalized']);
const classification={dataClassification:population,classificationBasis:z.literal('current_operating_organization_domain')};
const classificationDoc={dataClassification:en(population.options),classificationBasis:en(['current_operating_organization_domain'])};
const periodFields={siteId:uuid,from:time,to:time,asOf:time};
const periodDoc={siteId:id,from:dt,to:dt,asOf:dt};
const allGeoKinds=z.enum(['country','state','region','county','place','tract','metro','micro','csa','congressional_district','state_legislative_upper','state_legislative_lower','school_district','urban_area']);
const area=z.object({code:text,name:text,kind:allGeoKinds,sourceId:text}).strict();
const areaDoc=obj({code:s,name:s,kind:en(allGeoKinds.options),sourceId:s});
const communityKeys=['population','medianHouseholdIncome','povertyUniverse','populationBelowPoverty','households','householdsWithBroadband','populationUnder18','civilianLaborForce','unemployed','languageUniverse','englishOnly','educationUniverse','bachelors','masters','professionalDegree','doctorate'] as const;
const indicator=z.object({estimate:count.nullable(),marginOfError:count.nullable(),variable:text}).strict();
const indicatorDoc=obj({estimate:{...n,nullable:true},marginOfError:{...n,nullable:true},variable:s});
const indicators=z.object(Object.fromEntries(communityKeys.map(key=>[key,indicator])) as Record<typeof communityKeys[number],typeof indicator>).strict();
const geoVersion=z.object({id:uuid,market_status:text,source:text,benchmark:text,vintage:text,resolved_at:z.union([text,z.date()]).transform(value=>new Date(value).toISOString())}).strict();
const geo=z.object({status:text,market:area.nullable(),areas:z.array(area),communityProfiles:z.array(z.object({areaCode:text,source:z.literal('acs5'),year:count,indicators}).strict()),version:geoVersion.nullable()}).strict();
const geoDoc=obj({status:s,market:{...areaDoc,nullable:true},areas:arr(areaDoc),communityProfiles:arr(obj({areaCode:s,source:en(['acs5']),year:n,indicators:obj(Object.fromEntries(communityKeys.map(key=>[key,indicatorDoc])))})),version:{...obj({id,market_status:s,source:s,benchmark:s,vintage:s,resolved_at:dt}),nullable:true}});
export const siteEvidenceParams=z.object({siteId:uuid}).strict();
export const snapshotParams=z.object({snapshotId:uuid}).strict();
export const evidencePeriodQuery=z.object({from:time,to:time}).strict().refine(v=>Date.parse(v.from)<Date.parse(v.to)&&Date.parse(v.to)<=Date.now()&&Date.parse(v.to)-Date.parse(v.from)<=90*86400000,'Choose a closed positive period up to 90 days');
export const evidenceResults={
 definitions:z.object({contractVersion:z.literal('1.0.0'),definitions:z.array(definition)}).strict(),
 health:z.object({asOf:time,enabled:z.boolean(),snapshotsEnabled:z.boolean(),storageReady:z.boolean(),counts:countRecord(healthKeys).nullable(),status:healthStatus,oldestMissingAt:time.nullable()}).strict(),
 coverage:z.object({...periodFields,...classification,geography:geo,observedCounts:z.record(count),observedEvents:count,sourceCoverage:countRecord(coverageKeys).extend({status:coverageStatus,lifecycleCompletenessVerified:z.literal(false)}),outcomeMetricsAvailable:z.literal(false)}).strict(),
 campaign:z.object({...periodFields,...classification,timeBasis:z.literal('campaign_creation_cohort_current_state'),counts:countRecord(campaignKeys),uniquePeople:z.null(),conversionAttribution:z.null(),includesOrganizationOwnedCampaigns:z.literal(false)}).strict(),
 snapshot:z.object({...periodFields,snapshotId:uuid,sourceCount:count.min(1).max(2000),manifestDigest:z.string().regex(/^[a-f0-9]{64}$/),status:z.literal('private_source_snapshot'),lifecycleCompletenessVerified:z.literal(false)}).strict(),
};
const falseDoc={...b,enum:[false]};
const nullDoc={type:'string' as const,nullable:true,enum:[null]};
export const evidenceDocs={
 definitions:obj({contractVersion:en(['1.0.0']),definitions:arr(definitionDoc)}),
 health:obj({asOf:dt,enabled:b,snapshotsEnabled:b,storageReady:b,counts:{...countRecordDoc(healthKeys),nullable:true},status:en(healthStatus.options),oldestMissingAt:{...dt,nullable:true}}),
 coverage:obj({...periodDoc,...classificationDoc,geography:geoDoc,observedCounts:{type:'object' as const,additionalProperties:n},observedEvents:n,sourceCoverage:obj({...countRecordDoc(coverageKeys).properties,status:en(coverageStatus.options),lifecycleCompletenessVerified:falseDoc}),outcomeMetricsAvailable:falseDoc}),
 campaign:obj({...periodDoc,...classificationDoc,timeBasis:en(['campaign_creation_cohort_current_state']),counts:countRecordDoc(campaignKeys),uniquePeople:nullDoc,conversionAttribution:nullDoc,includesOrganizationOwnedCampaigns:falseDoc}),
 snapshot:obj({...periodDoc,snapshotId:id,sourceCount:{...n,minimum:1,maximum:2000},manifestDigest:{...s,pattern:'^[a-f0-9]{64}$'},status:en(['private_source_snapshot']),lifecycleCompletenessVerified:falseDoc}),
};
