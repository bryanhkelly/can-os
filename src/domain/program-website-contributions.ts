import {isExtendedLearningType,type ProgramType} from "./program-offerings";
import type {PublicSitePath} from "./public-site-paths";
import type {SiteContentBlockProjection} from "./site-content-channels";
import type {EnrollmentTargetKind,SiteEnrollmentOpportunity} from "./site-enrollment-opportunities";

/** Internal Program launch recipe; not an operator setting or approval.
 * Program types are canonical; native Offering/Course/Class contributions
 * are resolved from their independent public feeds. */
export function programWebsiteContribution(type:ProgramType){
 const extended=isExtendedLearningType(type);
 return {
  schemaVersion:1 as const,
  pages:(extended?["/programs","/student-life"]:["/academics","/school-day","/admissions","/tuition"]) as PublicSitePath[],
  homepageChannel:extended?"learning.enrichment" as const:"learning.academics" as const,
  contentRequirements:extended?["programOverview","learningExperience","communityInvitation"]:["programOverview","educationalPhilosophy","learningExperience","admissionsIntroduction"],
 };
}
const labels:Record<"course"|"class",{title:string;description:string}>={
 course:{title:"Explore learning Courses",description:"Discover published Courses. Registration depends on each authorized Offering."},
 class:{title:"Find a Class",description:"Explore current public Classes and scheduled learning opportunities."},
};
function coversKind(block:SiteContentBlockProjection,kind:EnrollmentTargetKind){
 return block.channel==="learning.opportunities"&&(!block.targetKinds?.length||block.targetKinds.includes(kind))||
  (kind==="course"&&block.channel==="learning.noncredit")||
  (kind==="class"&&block.channel==="learning.classes");
}
/** Homepage contribution for native Course/Class launches. Academic and
 * enrichment launch slots already exist in every governed visual template.
 * Consume only pre-authorized feeds, never Site intent or draft Program
 * metadata. Preserve authored channels and deduplicate by exact target ID.
 * No new public records or inferred enrollment rights are created. */
export function projectProgramLaunchWebsiteBlocks(
 existing:readonly SiteContentBlockProjection[],
 opportunities:readonly SiteEnrollmentOpportunity[],
 privatePreview:boolean,
):SiteContentBlockProjection[]{
 const homepage=existing.filter(block=>(block.page??"/")==="/"&&block.enabled);
 const added:SiteContentBlockProjection[]=[];
 for(const kind of ["course","class"] as const){
  const covered=new Set(homepage.filter(block=>coversKind(block,kind)).flatMap(block=>block.items.map(item=>item.id)));
  const seen=new Set<string>();
  const candidates=opportunities.filter(item=>{
   if(item.kind!==kind||covered.has(item.id)||covered.has(item.targetId)||seen.has(item.targetId))return false;
   seen.add(item.targetId);return true;
  }).slice(0,6);
  if(!candidates.length)continue;
  const id="launch-"+kind+"-home";
  if(existing.some(block=>block.id===id))continue;
  added.push({id,channel:"learning.opportunities",page:"/",placement:"learning",layout:"cards",enabled:true,
   targetKinds:[kind],eyebrow:"Learning opportunities",...labels[kind],
   items:candidates.map(item=>({id:item.id,title:item.title,description:item.description,startsAt:item.startsAt,
    label:item.status==="register"?"Registration available":item.status==="waitlist"?"Waitlist available":
     item.status==="closed"?"Registration unavailable":"Explore",
    ...(!privatePreview&&item.action?{link:item.action}:{})}))});
 }
 return [...existing,...added];
}
/** Exact Program launch preview only. No URL, public catalog entry or dates
 * are inferred from a planning record. */
export function pendingExtendedProgramWebsiteBlocks(input:{programId:string;name:string;type:ProgramType;status:string;hasPublishedOffering:boolean}):SiteContentBlockProjection[]{
 if(!isExtendedLearningType(input.type)||input.hasPublishedOffering||!["draft","launching","ready","active"].includes(input.status))return [];
 const item={id:input.programId,title:input.name,description:"This Program is being prepared. Offerings and registration require separate authorization.",label:"Private launch preview"};
 return (["/","/programs"] as const).map(page=>({
  id:page==="/"?"launch-planned-program-home":"launch-planned-program-page",channel:"learning.interests",page,placement:"learning",layout:"cards",enabled:true,
  eyebrow:"Program in preparation",title:"Learning opportunities in development",description:"Planning preview only. Not a published or enrollable Offering.",items:[item],
 }));
}
