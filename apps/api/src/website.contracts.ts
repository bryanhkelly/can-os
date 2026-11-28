import {z} from 'zod';
import {bodies as brandBodies,results as brandResults,docs as brandDocs} from './brand.contracts';
const id=z.string().uuid(),s=z.string(),b=z.boolean(),n=z.number().int().nonnegative();
const date=s.datetime({offset:true});
const pagePaths=['/','/about','/leadership','/academics','/student-life','/school-day','/admissions','/tuition','/families','/faq','/contact','/programs','/experiences','/courses','/classes'] as const;
const sections=['hero','vision','story','explore','academics','enrichment','channelsLearning','channelsCommunity','closing','channelsClosing','contact'] as const;
const composition=z.object({schemaVersion:z.literal(1),navigation:z.array(z.enum(pagePaths)).min(1).max(pagePaths.length),homeSections:z.array(z.enum(sections)).min(1).max(sections.length)}).strict().superRefine((v,ctx)=>{if(v.navigation[0]!=='/'||v.homeSections[0]!=='hero'||new Set(v.navigation).size!==v.navigation.length||new Set(v.homeSections).size!==v.homeSections.length)ctx.addIssue({code:'custom',message:'Invalid composition order'});});
const localImage=z.object({dataUrl:s.max(218492),altText:s.max(180),rightsConfirmed:b,childImageConsent:z.enum(['unconfirmed','no_identifiable_children','guardian_consent_confirmed'])}).strict();
const fields={heroHeadline:s.max(120).optional(),welcomeMessage:s.max(240),localDescription:s.max(1400),denomination:s.max(120),statementOfFaith:s.max(2600),spiritualFormation:s.max(1200),churchHistory:s.max(1600).optional(),communityOutreach:s.max(1200).optional(),schoolVision:s.max(1200).optional(),leadershipWelcome:s.max(800).optional(),localTraditions:s.max(800).optional()};
const leader=z.object({id:s.regex(/^[a-zA-Z0-9-]{8,64}$/),name:s.max(120),title:s.max(120),biography:s.max(1600),linkedinUrl:s.max(240).optional(),consentConfirmed:b,photo:localImage.nullable().optional()}).strict();
const baseline=z.object({version:z.literal(1),fields:z.object({heroHeadline:s.max(120),welcomeMessage:s.max(240),localDescription:s.max(1400),schoolVision:s.max(1200),communityOutreach:s.max(1200)}).strict()}).strict();
const branding=z.object({theme:z.enum(['classic','warm','light']),brandDirectionId:z.enum(['belonging','excellence','innovation','classical','creative','leadership']).optional(),paletteId:s.optional(),typographyId:z.enum(['editorial','traditional','contemporary']).optional(),templateId:z.enum(['heritage','community','modern','bright-futures','summit','classic','campus']).optional(),headingFontId:s.optional(),bodyFontId:s.optional(),sharedHeroPhoto:z.object({template:s,role:s,revision:s}).strict().nullable().optional(),heroImage:localImage.nullable(),logoImage:localImage.nullable().optional()}).strict();
const content=z.object({...fields,contentReuseConsent:z.enum(['unselected','granted','denied']).optional(),websiteComposition:composition.optional(),leadershipMembers:z.array(leader).max(16).optional(),editorialBaseline:baseline.optional(),branding}).strict();
export const params=z.object({siteId:id}).strict(),empty=z.object({}).strict();
export const bodies={
 preview:z.object({content}).strict(),
 save:z.object({operation:z.enum(['draft','save']),expectedRevision:n,expectedBrandVersionId:id.nullable(),brand:brandBodies.save.shape.configuration,content}).strict(),
 restore:z.object({expectedRevision:n,restoreRevision:n.min(1)}).strict(),empty
};
const pages=z.record(z.enum(pagePaths),s);
const preview=z.object({previewHtml:s.nullable(),previewPages:pages}).strict();
const receipt=z.object({changed:b,revision:n,status:z.enum(['draft','published','review_required']),flaggedFields:z.array(s)}).strict();
export const results={
 preview,savedPreview:preview.extend({siteId:id,siteConfigurationRevision:date,currentRevision:n,currentBrandVersionId:id.nullable()}),
 saved:z.object({website:receipt,brand:brandResults.saved}).strict(),
 restored:receipt.extend({restoredContent:content}),prepared:z.object({slug:s,host:s,status:z.enum(['draft','published']),created:b}).strict()
};
const str={type:'string' as const},uuid={...str,format:'uuid'},bool={type:'boolean' as const},count={type:'integer' as const,minimum:0},dt={...str,format:'date-time'};
const en=(values:readonly string[])=>({...str,enum:[...values]});
const obj=(properties:Record<string,any>,required=Object.keys(properties))=>({type:'object' as const,additionalProperties:false,properties,required});
const arr=(items:Record<string,any>,maxItems?:number)=>({type:'array' as const,items,...(maxItems===undefined?{}:{maxItems})});
const max=(maxLength:number)=>({...str,maxLength});
const imageDoc=obj({dataUrl:max(218492),altText:max(180),rightsConfirmed:bool,childImageConsent:en(['unconfirmed','no_identifiable_children','guardian_consent_confirmed'])});
const brandDoc=obj({theme:en(['classic','warm','light']),brandDirectionId:en(['belonging','excellence','innovation','classical','creative','leadership']),paletteId:str,typographyId:en(['editorial','traditional','contemporary']),templateId:en(['heritage','community','modern','bright-futures','summit','classic','campus']),headingFontId:str,bodyFontId:str,sharedHeroPhoto:{...obj({template:str,role:str,revision:str}),nullable:true},heroImage:{...imageDoc,nullable:true},logoImage:{...imageDoc,nullable:true}},['theme','heroImage']);
const contentDoc=obj({heroHeadline:max(120),welcomeMessage:max(240),localDescription:max(1400),denomination:max(120),statementOfFaith:max(2600),spiritualFormation:max(1200),churchHistory:max(1600),communityOutreach:max(1200),schoolVision:max(1200),leadershipWelcome:max(800),localTraditions:max(800),contentReuseConsent:en(['unselected','granted','denied']),websiteComposition:obj({schemaVersion:{type:'integer',enum:[1]},navigation:{...arr(en(pagePaths),pagePaths.length),minItems:1,uniqueItems:true},homeSections:{...arr(en(sections),sections.length),minItems:1,uniqueItems:true}}),leadershipMembers:arr(obj({id:{...str,pattern:'^[a-zA-Z0-9-]{8,64}$'},name:max(120),title:max(120),biography:max(1600),linkedinUrl:max(240),consentConfirmed:bool,photo:{...imageDoc,nullable:true}},['id','name','title','biography','consentConfirmed']),16),editorialBaseline:obj({version:{type:'integer',enum:[1]},fields:obj({heroHeadline:max(120),welcomeMessage:max(240),localDescription:max(1400),schoolVision:max(1200),communityOutreach:max(1200)})}),branding:brandDoc},['welcomeMessage','localDescription','denomination','statementOfFaith','spiritualFormation','branding']);
const previewFields={previewHtml:{...str,nullable:true},previewPages:{type:'object' as const,additionalProperties:str,description:'Canonical rendered pages; render only in an origin-isolated sandboxed frame.'}};
const receiptDoc=obj({changed:bool,revision:count,status:en(['draft','published','review_required']),flaggedFields:arr(str)});
export const inputs={preview:obj({content:contentDoc}),save:obj({operation:en(['draft','save']),expectedRevision:count,expectedBrandVersionId:{...uuid,nullable:true},brand:brandDocs.saved.properties.configuration,content:contentDoc}),restore:obj({expectedRevision:count,restoreRevision:{...count,minimum:1}}),empty:obj({})};
export const docs={preview:obj(previewFields),savedPreview:obj({...previewFields,siteId:uuid,siteConfigurationRevision:dt,currentRevision:count,currentBrandVersionId:{...uuid,nullable:true}}),saved:obj({website:receiptDoc,brand:brandDocs.saved}),restored:obj({...receiptDoc.properties,restoredContent:contentDoc}),prepared:obj({slug:str,host:str,status:en(['draft','published']),created:bool})};
