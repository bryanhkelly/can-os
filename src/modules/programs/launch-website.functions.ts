import {createServerFn} from "@tanstack/react-start";
import {setResponseHeader} from "@tanstack/react-start/server";
import {eq} from "drizzle-orm";
import {z} from "zod";
import {db} from "@/db/client";
import {organizations,programs,sitePublications,sites} from "@/db/schema";
import {AuthorizationError} from "@/domain/command-context";
import {requireActor} from "@/modules/identity/actors.server";
import {publicSiteHost} from "@/domain/public-site-address";
import {renderPublicSiteHtml} from "@/domain/public-site-html";
import {isAcademicMarketingType,publicAcademicProgram} from "@/domain/academic-program-publication";
import {emptySiteLocalContent} from "@/domain/site-local-content";
import {launchOpeningDate} from "@/domain/launch-opening-date";
import {readAcademicProgramCatalog} from "@/modules/sites/academic-program-catalog.server";
import {readCurrentLocalContent} from "@/modules/sites/site-local-content.server";
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
  if(!address)return {...base,previewHtml:null,includesSuggestions:false};
  const [approved,local,enrichment]=await Promise.all([
   readAcademicProgramCatalog(school.siteId),readCurrentLocalContent(school.siteId),readEnrichmentCatalog(school.siteId),
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
  return {...base,includesSuggestions:needsPlanningCard||!local,
   previewHtml:renderPublicSiteHtml({host:base.host!,site:{name:school.siteName,organizationName:school.organizationName},
    offerings:enrichment.map(toPublicSiteEnrichment),academicPrograms:[...approved,...planning],localContent:local?.content??{
     ...emptySiteLocalContent,welcomeMessage:`Welcome to ${school.programName}.`,
     localDescription:`Our church is preparing a local learning community. Contact the church to learn more about plans for ${school.programName}.`,
    },
   }),
  };
 });
