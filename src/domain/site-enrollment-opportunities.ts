import type { PublicAcademicProgram } from "./academic-program-publication";
import type { SiteNoncreditListing } from "./site-noncredit-public";
import { noncreditEnrollmentOrigin } from "./site-noncredit-public";
import type { SitePublishedClassListing } from "./site-content-channels";

/** Public discovery is a read model, not another enrollment write system.
 * The precise domain service remains authoritative at the final action. */
export type EnrollmentTargetKind="school"|"program"|"course"|"class";
export type EnrollmentOpportunityStatus="apply"|"register"|"waitlist"|"explore"|"closed";
export type SiteEnrollmentOpportunity={
  id:string;kind:EnrollmentTargetKind;targetId:string;
  title:string;description:string;status:EnrollmentOpportunityStatus;
  delivery?:string;startsAt?:string|null;
  action?:{label:string;href:string};
};
type PublicEnrichment={
  seasonId:string;title:string;programName:string;registrationOpen:boolean;
};
export type SiteEnrollmentOpportunityFeeds={
  academicPrograms?:readonly PublicAcademicProgram[];
  enrichment?:readonly PublicEnrichment[];
  noncredit?:readonly SiteNoncreditListing[];
  classes?:readonly SitePublishedClassListing[];
  enrollmentOrigin?:string|null;
};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** A Course is not a Class: the same Course may support an independent
 * training release and multiple facilitated Classes, each with its own
 * enrollment terms and lifecycle. */
export function projectSiteEnrollmentOpportunities(
  feeds:SiteEnrollmentOpportunityFeeds,
):SiteEnrollmentOpportunity[]{
  const origin=noncreditEnrollmentOrigin(feeds.enrollmentOrigin);
  const academic=(feeds.academicPrograms??[]).map(program=>({
    id:"school:"+program.programId,kind:"school" as const,
    targetId:program.programId,title:program.title,description:program.summary,
    status:program.applicationOpen===true?"apply" as const:"explore" as const,
    action:{href:"/academics",label:"Explore program"},
    ...(program.applicationOpen===true?{action:{href:"/admissions",label:"Apply for admission"}}:{}),
  }));
  const enrichment=(feeds.enrichment??[]).map(program=>({
    id:"program:"+program.seasonId,kind:"program" as const,
    targetId:program.seasonId,title:program.title,description:program.programName,
    // Publishing a marketing listing is not proof that the website has a
    // direct, authorized Program registration endpoint.
    status:"explore" as const,
    action:{href:"/student-life",label:"View program information"},
  }));
  const courses=(feeds.noncredit??[]).filter(item=>uuid.test(item.releaseId)).map(item=>{
    const canRegister=Boolean(origin)&&item.seatsRemaining>0;
    const canWaitlist=Boolean(origin)&&!canRegister&&item.waitlistAvailable;
    return {
      id:"course:"+item.releaseId,kind:"course" as const,
      targetId:item.releaseId,title:item.title,description:item.siteName,
      status:canRegister?"register" as const:canWaitlist?"waitlist" as const:
        !origin?"explore" as const:"closed" as const,
      ...(canRegister||canWaitlist?{action:{
        href:origin!+"/learn/enroll?release="+encodeURIComponent(item.releaseId),
        label:canRegister?"Register for Course":"Join Course waitlist",
      }}:{}),
    };
  });
  const classes=(feeds.classes??[]).map(item=>({
    id:"class:"+item.classId,kind:"class" as const,
    targetId:item.classId,title:item.title,
    description:item.deliveryMode.replaceAll("_"," ")+(item.nextStartsAt?" · Upcoming Session":""),
    delivery:item.deliveryMode,startsAt:item.nextStartsAt,
    // A published Class can be assignment- or approval-only. The public
    // Class directory rechecks the current Offering's enrollment methods,
    // capacity, consent and actor identity. Do not invent an "Enroll" CTA.
    status:"explore" as const,
    ...(origin?{action:{href:origin+"/learn/classes",label:"Explore Class enrollment"}}:{}),
  }));
  return [...academic,...enrichment,...courses,...classes];
}
export function enrollmentOpportunityKinds(items:readonly SiteEnrollmentOpportunity[]) {
  return {
    school:items.some(item=>item.kind==="school"),
    program:items.some(item=>item.kind==="program"),
    course:items.some(item=>item.kind==="course"),
    class:items.some(item=>item.kind==="class"),
  };
}
