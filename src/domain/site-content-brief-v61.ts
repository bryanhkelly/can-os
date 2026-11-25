import { projectSiteAudienceIntent, sitePlanningAudienceIds } from "./site-audiences";
import { z } from "zod";
import {editorialCommunityProfileSchema} from "./editorial-community-profile";
import { siteIdentityV61Schema } from "./site-identity-v61";
import { siteHostingV61Schema, siteEnvironmentV61Schema, siteStorySourceV61Schema, siteStoryV61Schema } from "./site-information-v61";
import { readSiteProgramsAudiencesV61, siteProgramsAudiencesV61Schema, type SiteProgramsAudiencesV61 } from "./site-launch-preferences";
import { siteExperienceById, siteExperienceOutcomes, describeSiteExperience } from "./site-experience-interests";

/** Canonical Site facts projected into one private, consent-gated editorial contract.
 * Never a duplicate CMS, public approval, or authority to offer enrollment. */
const experienceSchema=z.object({
  id:z.string(),title:z.string(),priority:z.enum(["featured","planned","exploring"]),
  proposed:z.literal(true),activities:z.array(z.string()),outcomes:z.array(z.string()),
  audiences:z.array(z.string()),programs:z.array(z.string()),programCodes:z.array(z.string()),
  summary:z.string(),
}).strict();
export type SiteContentExperienceV61=z.infer<typeof experienceSchema>;

export const siteContentBriefV61Schema=z.object({
  schemaVersion:z.literal(1),
  site:z.object({id:z.string().uuid(),name:z.string().min(1),timezone:z.string().nullable()}).strict(),
  sourceRevisions:z.object({
    site:z.string().datetime({offset:true}),story:z.string().datetime({offset:true}).nullable(),
    brandVersionId:z.string().uuid().nullable(),brandRevision:z.number().int().nonnegative().nullable(),
    websiteContentRevision:z.number().int().nonnegative().nullable(),
  }).strict(),
  identity:siteIdentityV61Schema.nullable(),
  hosting:siteHostingV61Schema.nullable(),
  environment:siteEnvironmentV61Schema.nullable(),
  planning:siteProgramsAudiencesV61Schema.nullable(),
  audienceIntent:z.object({classification:z.literal("declared_desire"),
    audiences:z.array(z.object({id:z.enum(sitePlanningAudienceIds),label:z.string(),category:z.string()}).strict()),
    deliveryCapacityVerified:z.literal(false)}).strict().optional(),
  experiences:z.array(experienceSchema),
  story:siteStoryV61Schema.nullable(),
  leadership:z.array(z.object({
    name:z.string(),title:z.string(),biography:z.string(),linkedinUrl:z.string().nullable(),
  }).strict()),
  websiteCopy:z.object({
    heroHeadline:z.string(),welcomeMessage:z.string(),
    schoolVision:z.string(),communityOutreach:z.string(),
  }).strict().nullable(),
  communityProfiles:z.array(editorialCommunityProfileSchema).max(2).optional(),
  consent:z.object({contentReuseAllowed:z.boolean()}).strict(),
}).strict();
export type SiteContentBriefV61=z.infer<typeof siteContentBriefV61Schema>;

export function projectSiteExperienceBriefV61(intent:SiteProgramsAudiencesV61|null):SiteContentExperienceV61[]{
  if(!intent)return [];
  const details=new Map((intent.experienceDetails??[]).map(item=>[item.id,item] as const));
  const curated=(intent.experienceIds??[]).flatMap(id=>{
    const topic=siteExperienceById.get(id);
    if(!topic)return [];
    const detail=details.get(id);
    return [{
      id,title:topic.title,priority:detail?.priority??"planned" as const,proposed:true as const,
      activities:topic.activities.filter(item=>detail?.activityIds.includes(item.id)).map(item=>item.label),
      outcomes:siteExperienceOutcomes.filter(item=>detail?.outcomeIds.includes(item.id)).map(item=>item.copy),
      audiences:detail?.audienceIds??[],programs:detail?.programIds??[],
      programCodes:detail?.programCodes??[],
      summary:describeSiteExperience(topic,detail),
    }];
  });
  return [...curated,...(intent.customExperiences??[]).map(title=>({
    id:"custom:"+title,title,priority:"exploring" as const,proposed:true as const,
    activities:[],outcomes:[],audiences:[],programs:[],programCodes:[],
    summary:"A locally proposed Experience.",
  }))];
}
type WebsiteSource={
  contentReuseConsent?:"unselected"|"granted"|"denied";
  heroHeadline?:string;welcomeMessage?:string;schoolVision?:string;communityOutreach?:string;
  leadershipMembers?:readonly {
    name:string;title:string;biography:string;linkedinUrl?:string;
    consentConfirmed:boolean;
  }[];
}|null;
/** The caller supplies server-authorized Site records, never untrusted client fields.
 * A denied/unselected consent excludes private Story and saved website copy. */
export function projectSiteContentBriefV61(input:{
  siteId:string;siteName:string;timezone?:string|null;siteRevision:string;
  metadata:Record<string,unknown>;websiteContent?:WebsiteSource;
  websiteContentRevision?:number|null;brandVersionId?:string|null;brandRevision?:number|null;
}):SiteContentBriefV61{
  const parse=<T>(schema:z.ZodType<T>,raw:unknown,label:string):T|null=>{
    if(raw==null)return null;
    const value=schema.safeParse(raw);
    if(!value.success)throw new Error("Stored "+label+" requires review before content generation.");
    return value.data;
  };
  const {metadata}=input;
  const identity=parse(siteIdentityV61Schema,metadata.siteIdentityV61,"Site Identity");
  const hosting=parse(siteHostingV61Schema,metadata.siteHostingV61,"Site Hosting");
  const environment=parse(siteEnvironmentV61Schema,metadata.siteEnvironmentV61,"Site Environment");
  const story=parse(siteStorySourceV61Schema,metadata.siteStoryV61,"Site Story");
  const planning=metadata.launchPreferences==null?null:
    readSiteProgramsAudiencesV61(metadata.launchPreferences);
  const consent=input.websiteContent?.contentReuseConsent==="granted";
  const leadership=consent?input.websiteContent?.leadershipMembers
    ?.filter(person=>person.consentConfirmed===true&&Boolean(person.name.trim()))
    .map(person=>({
      name:person.name,title:person.title,biography:person.biography,
      linkedinUrl:person.linkedinUrl?.trim()||null,
    }))??[]:[];
  const websiteCopy=consent&&input.websiteContent?{
    heroHeadline:input.websiteContent.heroHeadline??"",
    welcomeMessage:input.websiteContent.welcomeMessage??"",
    schoolVision:input.websiteContent.schoolVision??"",
    communityOutreach:input.websiteContent.communityOutreach??"",
  }:null;
  return siteContentBriefV61Schema.parse({
    schemaVersion:1,
    site:{id:input.siteId,name:input.siteName,timezone:input.timezone??null},
    sourceRevisions:{
      site:input.siteRevision,story:story?.revision??null,
      brandVersionId:input.brandVersionId??null,brandRevision:input.brandRevision??null,
      websiteContentRevision:input.websiteContentRevision??null,
    },
    identity,hosting,environment,planning,audienceIntent:projectSiteAudienceIntent(planning?.audienceIds??[]),experiences:projectSiteExperienceBriefV61(planning),
    story:consent?story?.answers??null:null,leadership,websiteCopy,
    consent:{contentReuseAllowed:consent},
  });
}
