import {z} from 'zod';
const uuid=z.string().uuid(),s=z.string(),bool=z.boolean(),revision=z.number().int().positive(),count=z.number().int().nonnegative(),date=s.datetime({offset:true});
const nil=uuid.nullable();
const direction=z.enum(['belonging','excellence','innovation','classical','creative','leadership']).nullable();
const photo=z.object({template:z.enum(['heritage','community','modern','bright-futures','summit','classic','campus']),role:s,revision:s}).strict();
const config=z.object({directionId:direction,paletteId:s,typographyId:z.enum(['editorial','traditional','contemporary']),headingFontId:s.nullable(),bodyFontId:s.nullable(),displayName:s.trim().min(1).max(120),logoAssetId:nil,heroAssetId:nil,sharedHeroPhoto:photo.nullable().optional()}).strict();
const childConsent=z.enum(['unconfirmed','no_identifiable_children','guardian_consent_confirmed']);
const image=z.object({dataUrl:s.max(220000).regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/),altText:s.trim().max(180),rightsConfirmed:bool,childImageConsent:childConsent}).strict();
const asset=image.extend({id:uuid,siteId:uuid,checksum:s,revokedAt:date.nullable()}).strict();
const theme=z.object({paletteId:s,typographyId:s,ink:s,canvas:s,accent:s,secondary:s,muted:s,surface:s.optional(),label:s.optional(),displayFont:s,bodyFont:s,onDark:z.literal('#ffffff')}).strict();
const savedVersion=z.object({id:uuid,siteId:uuid,revision,configuration:config,fingerprint:s,createdAt:date}).strict();
const resolved=z.object({siteId:uuid,brandVersionId:uuid,revision,displayName:s,directionId:direction,paletteId:s,typographyId:s,headingFontId:s.nullable(),bodyFontId:s.nullable(),theme,logo:asset.nullable(),hero:asset.nullable(),sharedHeroPhoto:photo.nullable().optional()}).strict();
export const siteParams=z.object({siteId:uuid}).strict();
export const assetParams=siteParams.extend({assetId:uuid}).strict();
export const brandQuery=z.object({versionId:uuid.optional()}).strict();
export const emptyQuery=z.object({}).strict();
export const bodies={save:z.object({expectedBrandVersionId:nil,configuration:config,logoImage:image.nullable().optional(),heroImage:image.nullable().optional()}).strict(),revoke:z.object({reason:s.trim().min(8).max(500)}).strict(),review:z.object({expectedRevision:count,contentReviewed:z.literal(true)}).strict()};
export const results={
 brand:z.object({siteId:uuid,siteName:s,current:z.object({version:savedVersion,resolved}).strict().nullable(),initial:config}).strict(),
 saved:z.object({changed:bool,brandVersionId:uuid,revision,configuration:config}).strict(),
 revoked:z.object({changed:bool,revokedAt:date}).strict(),
 readiness:z.object({siteId:uuid,siteName:s,address:z.object({host:s,status:s,revision:date,publishedAt:date.nullable()}).strict().nullable(),approvedAcademicCount:count,currentBrandVersionId:nil,publishedBrandVersionId:nil,canRepublish:bool,approvedEnrichmentCount:count,reviewedLocalContentAvailable:bool,canReviewWebsiteCopy:bool,canPublishSite:bool,latestWebsiteRevision:count,latestWebsiteStatus:s.nullable(),publishingPrerequisitesPresent:bool,hostingConfigured:bool}).strict(),
 reviewed:z.object({changed:bool,revision:count,status:s}).strict()
};
const str={type:'string' as const},id={...str,format:'uuid'},ni={...id,nullable:true},dt={...str,format:'date-time'},b={type:'boolean' as const},n={type:'integer' as const,minimum:0},pos={...n,minimum:1};
const en=(values:readonly string[])=>({...str,enum:[...values]});
const obj=(properties:Record<string,any>,required=Object.keys(properties))=>({type:'object' as const,additionalProperties:false,properties,required});
const photoDoc=obj({template:en(['heritage','community','modern','bright-futures','summit','classic','campus']),role:str,revision:str});
const configDoc=obj({directionId:{...en(['belonging','excellence','innovation','classical','creative','leadership']),nullable:true},paletteId:str,typographyId:en(['editorial','traditional','contemporary']),headingFontId:{...str,nullable:true},bodyFontId:{...str,nullable:true},displayName:{...str,minLength:1,maxLength:120},logoAssetId:ni,heroAssetId:ni,sharedHeroPhoto:{...photoDoc,nullable:true}},['directionId','paletteId','typographyId','headingFontId','bodyFontId','displayName','logoAssetId','heroAssetId']);
const imageDoc=obj({dataUrl:{...str,maxLength:220000,pattern:'^data:image/png;base64,[A-Za-z0-9+/=]+$'},altText:{...str,maxLength:180},rightsConfirmed:b,childImageConsent:en(childConsent.options)});
const assetDoc=obj({...imageDoc.properties,id,siteId:id,checksum:str,revokedAt:{...dt,nullable:true}});
const themeDoc=obj({paletteId:str,typographyId:str,ink:str,canvas:str,accent:str,secondary:str,muted:str,surface:str,label:str,displayFont:str,bodyFont:str,onDark:en(['#ffffff'])},['paletteId','typographyId','ink','canvas','accent','secondary','muted','displayFont','bodyFont','onDark']);
const versionDoc=obj({id,siteId:id,revision:pos,configuration:configDoc,fingerprint:str,createdAt:dt});
const resolvedDoc=obj({siteId:id,brandVersionId:id,revision:pos,displayName:str,directionId:configDoc.properties.directionId,paletteId:str,typographyId:str,headingFontId:{...str,nullable:true},bodyFontId:{...str,nullable:true},theme:themeDoc,logo:{...assetDoc,nullable:true},hero:{...assetDoc,nullable:true},sharedHeroPhoto:{...photoDoc,nullable:true}},['siteId','brandVersionId','revision','displayName','directionId','paletteId','typographyId','headingFontId','bodyFontId','theme','logo','hero']);
export const inputs={save:obj({expectedBrandVersionId:ni,configuration:configDoc,logoImage:{...imageDoc,nullable:true},heroImage:{...imageDoc,nullable:true}},['expectedBrandVersionId','configuration']),revoke:obj({reason:{...str,minLength:8,maxLength:500}}),review:obj({expectedRevision:n,contentReviewed:{...b,enum:[true]}})};
export const docs={
 brand:obj({siteId:id,siteName:str,current:{...obj({version:versionDoc,resolved:resolvedDoc}),nullable:true},initial:configDoc}),
 saved:obj({changed:b,brandVersionId:id,revision:pos,configuration:configDoc}),
 revoked:obj({changed:b,revokedAt:dt}),
 readiness:obj({siteId:id,siteName:str,address:{...obj({host:str,status:str,revision:dt,publishedAt:{...dt,nullable:true}}),nullable:true},approvedAcademicCount:n,currentBrandVersionId:ni,publishedBrandVersionId:ni,canRepublish:b,approvedEnrichmentCount:n,reviewedLocalContentAvailable:b,canReviewWebsiteCopy:b,canPublishSite:b,latestWebsiteRevision:n,latestWebsiteStatus:{...str,nullable:true},publishingPrerequisitesPresent:b,hostingConfigured:b}),
 reviewed:obj({changed:b,revision:n,status:str})
};
