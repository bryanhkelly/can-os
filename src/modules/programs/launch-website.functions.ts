import {createServerFn} from "@tanstack/react-start";
import {setResponseHeader} from "@tanstack/react-start/server";
import {eq} from "drizzle-orm";
import {z} from "zod";
import {db} from "@/db/client";
import {organizations,programs,siteAffiliations,sitePublications,sites} from "@/db/schema";
import {AuthorizationError} from "@/domain/command-context";
import {requireActor} from "@/modules/identity/actors.server";
import {publicSiteHost} from "@/domain/public-site-address";
import {availablePublicSitePaths,renderPublicSiteHtml} from "@/domain/public-site-html";
import {safeReadSiteContentChannelConfig,resolveSiteContentBlocks} from "@/domain/site-content-channels";
import {schoolPlanningLocationSchema} from "@/domain/site-setup-configuration";
import {readOptionalSitePublishedClasses} from "@/modules/sites/site-published-classes.server";
import {siteLaunchPreferencesSchema} from "@/domain/site-launch-preferences";
import {isAcademicMarketingType,publicAcademicProgram} from "@/domain/academic-program-publication";
import {createIllustrativeSchoolContent,emptySiteLocalContent} from "@/domain/site-local-content";
import {launchOpeningDate} from "@/domain/launch-opening-date";
import {readAcademicProgramCatalog} from "@/modules/sites/academic-program-catalog.server";
import {readApprovedPublicParentExtras} from "@/modules/sites/public-parent-extras.server";
import {projectApprovedParentInformation,withVerifiedPublicApplications} from "@/domain/parent-information";
import {readCurrentLocalContent} from "@/modules/sites/site-local-content.server";
import {readApprovedSchoolSitePhotos} from "@/modules/sites/site-media-folder.server";
import {projectApprovedSchoolSiteMedia} from "@/domain/school-site-media-public";
import {readEnrichmentCatalog} from "@/modules/activities/enrichment-catalog.server";
import {toPublicSiteEnrichment} from "@/domain/public-site-catalog";
import {checkPublishedSiteReachability} from "@/modules/sites/public-host-reachability";

/** Launch owners can inspect their own safe planning preview. This grants no
 * access to editorial history, protected evidence or publication commands. */
export const getLaunchWebsitePreparation=createServerFn({method:"GET"})
 .validator((value:unknown)=>z.object({programId:z.string().uuid()}).strict().parse(value))
 .handler(async({data})=>{
  setResponseHeader("Cache-Control","private, no-store");
  const actor=await requireActor(["registrar"],"program.launch.start");
  const [school]=await db.select({programId:programs.id,programName:programs.name,
   organizationId:programs.organizationId,siteId:sites.id,siteOrganizationId:sites.organizationId,
   siteName:sites.name,organizationName:organizations.name,type:programs.type,
   gradeRange:programs.gradeRange,deliveryModel:programs.deliveryModel,metadata:programs.metadata,
  }).from(programs).innerJoin(sites,eq(sites.id,programs.siteId))
   .innerJoin(organizations,eq(organizations.id,sites.organizationId))
   .where(eq(programs.id,data.programId)).limit(1);
  if(!school||school.organizationId!==school.siteOrganizationId||
   !actor.scope.organizationIds?.includes(school.organizationId)||
   !actor.scope.siteIds?.includes(school.siteId)||!actor.scope.programIds?.includes(school.programId))
   throw new AuthorizationError("school launch website scope");
  const [address]=await db.select({slug:sitePublications.slug,status:sitePublications.status})
   .from(sitePublications).where(eq(sitePublications.siteId,school.siteId)).limit(1);
  const host=address?publicSiteHost(address.slug):null;
  const hostingConfigured=process.env.CAN_PUBLIC_SITE_HOSTING_ENABLED==="true";
  const availability=await checkPublishedSiteReachability({
   host,published:address?.status==="published",hostingConfigured,
  });
  const {status:publicAvailability,checkedAt,diagnostic:hostingDiagnostic}=availability;
  const base={siteId:school.siteId,programId:school.programId,programName:school.programName,
   host,status:address?.status??null,hostingConfigured,publicAvailability,checkedAt,hostingDiagnostic};
  if(!address)return {...base,previewHtml:null,previewPages:{} as Record<string,string>,includesSuggestions:false};
  const [approved,local,enrichment,photos]=await Promise.all([
   readAcademicProgramCatalog(school.siteId),readCurrentLocalContent(school.siteId),readEnrichmentCatalog(school.siteId),readApprovedSchoolSitePhotos(school.siteId),
  ]);
  const targetOpeningDate=launchOpeningDate(school.metadata);
  const needsPlanningCard=isAcademicMarketingType(school.type)&&!approved.some(program=>program.programId===school.programId);
  const planning=needsPlanningCard?[publicAcademicProgram({
   programId:school.programId,title:school.programName,type:school.type,status:"launching",
   summary:`${school.programName} is preparing to welcome families.${targetOpeningDate?` Target opening: ${targetOpeningDate}.`:""} This is a planning preview. School opening and academic services require their own approvals.`,
   gradeRange:school.gradeRange,deliveryModel:{onsite:school.deliveryModel.onsite===true,
    asynchronous:school.deliveryModel.asynchronous===true,liveOnline:school.deliveryModel.liveOnline===true,
    onsiteDaysPerWeek:school.deliveryModel.onsiteDaysPerWeek??null},
  })]:[];
  const [siteFlags] = await db.select({metadata:sites.metadata,timezone:sites.timezone}).from(sites)
    .where(eq(sites.id,school.siteId)).limit(1);
  // Use the same independently approved parent-data adapter as the public
  // school website. A private planning preview must not invent tuition,
  // authorization, schedules, or family services from draft Site metadata.
  const parentExtras=await readApprovedPublicParentExtras(school.siteId,
    approved.map(program=>program.programId),siteFlags?.metadata??null);
  const approvedPrograms=withVerifiedPublicApplications(approved,parentExtras.admissions);
  const offerings=enrichment.map(toPublicSiteEnrichment);
  const localContent=local?.content??(siteFlags?.metadata?.synthetic===true

      ? createIllustrativeSchoolContent(school.siteName)
      : {
        ...emptySiteLocalContent,welcomeMessage:`Welcome to ${school.programName}.`,
        localDescription:`Our church is preparing a local learning community. Contact the church to learn more about plans for ${school.programName}.`,
      });
  const site={name:school.siteName,organizationName:school.organizationName};
  const academicPrograms=[...approvedPrograms,...planning];
  const config=safeReadSiteContentChannelConfig(siteFlags?.metadata?.websiteContentChannels);
  const launchPrefs=siteLaunchPreferencesSchema.safeParse(siteFlags?.metadata?.launchPreferences);
  const plannedLocation=schoolPlanningLocationSchema.safeParse(siteFlags?.metadata?.schoolPlanningLocation);
  // Exact-Site network decisions are private and require a separate grant.
  const networkRows=actor.capabilities.has("network.affiliations.read")
    ? await db.select({name:organizations.name,status:siteAffiliations.status})
        .from(siteAffiliations)
        .innerJoin(organizations,eq(organizations.id,siteAffiliations.denominationOrganizationId))
        .where(eq(siteAffiliations.siteId,school.siteId)).limit(20)
    : null;
  const networkAffiliations=networkRows?.flatMap(row=>
    (["pending","approved","rejected","revoked"] as const).includes(
      row.status as "pending"|"approved"|"rejected"|"revoked")
      ? [{name:row.name,status:row.status as "pending"|"approved"|"rejected"|"revoked"}] : []) ?? null;
  const classes=await readOptionalSitePublishedClasses(school.siteId);
  const contentBlocks=resolveSiteContentBlocks(
    config,{
      mode:"private",preferences:launchPrefs.success?launchPrefs.data:null,
      siteSetup:{name:school.siteName,organizationName:school.organizationName,
        city:plannedLocation.success?plannedLocation.data.city:null,
        state:plannedLocation.success?plannedLocation.data.state:null,
        timezone:siteFlags?.timezone??null},
      networkAffiliations,networkStatusKnown:networkRows!==null,
      academicPrograms,enrichment:offerings,classes,classTimezone:siteFlags?.timezone??null,
    });
  const page={host:base.host!,demonstration:siteFlags?.metadata?.synthetic===true,
    site,offerings,academicPrograms,localContent,media:projectApprovedSchoolSiteMedia(school.siteId,base.host!,photos),
    parentInformation:projectApprovedParentInformation({
      site,academicPrograms,offerings,localContent,...parentExtras,
    }),contentBlocks,
  };
  // The launch preview is private and intentionally form-inactive, even if
  // the school has other programs with independently authorized applications.
  const previewPages = Object.fromEntries(availablePublicSitePaths(page).map(path => [
    path, renderPublicSiteHtml(page,{path,localPreview:true,
      ...(page.demonstration && address.slug === "valorschool"
        ? {sampleTemplate:localContent.branding.templateId ?? "heritage" as const} : {}),
    }),
  ]));
  return {...base,includesSuggestions:needsPlanningCard||!local,
    previewHtml:previewPages["/"] ?? null, previewPages,
  };
 });
