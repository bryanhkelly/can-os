import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, eq, gte, inArray, lte, or, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  accessAccounts, accountPersonGrants, deliveryArrangements, people, programs, scheduleTemplatePeriods,
  scheduleTemplates, schoolYears, sections, sites, terms,
} from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import { assertOnsiteAttendanceScope } from "@/domain/onsite-attendance-access";
import { siteDate } from "@/domain/expected-attendance";
import { summarizeOnsiteSupervision, type SupervisionBlockInput } from "@/domain/onsite-supervision-coverage";
import { getCommandContext } from "@/modules/identity/command-context.server";

const inputSchema=z.object({date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)}).strict();

/** A staff-safe read of planned instruction coverage at ONE original grant site.
 * Names here are assigned adults, not student/counselor/custody information. */
export const getOnsiteSupervisionPlan = createServerFn({method:"GET"})
  .validator((input:unknown)=>inputSchema.parse(input))
  .handler(async ({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const actor=await getCommandContext(getRequest());
    assertOnsiteAttendanceScope(actor);
    const [site]=await db.select({id:sites.id,organizationId:sites.organizationId,
      timezone:sites.timezone}).from(sites).where(eq(sites.id,actor.grantSiteId!)).limit(1);
    if(!site || !actor.scope.organizationIds?.includes(site.organizationId))
      throw new AuthorizationError("site staffing organization");
    if (siteDate(new Date(data.date+"T12:00:00Z"),"UTC")!==data.date)
      throw new Error("Invalid school-local date");
    const today=siteDate(new Date(),site.timezone);
    const oldest=siteDate(new Date(Date.now()-30*86400_000),site.timezone);
    if(data.date>today || data.date<oldest)
      throw new AuthorizationError("onsite supervision day limited to last 30 days");

    const sectionsAtSite=await db.select({
      id:sections.id,title:sections.title,programId:sections.programId,
      programName:programs.name,deliveryModel:programs.deliveryModel,
      scheduleTemplateId:sections.scheduleTemplateId,
      schoolYearId:schoolYears.id,
    }).from(sections)
      .innerJoin(programs,eq(programs.id,sections.programId))
      .innerJoin(terms,eq(terms.id,sections.termId))
      .innerJoin(schoolYears,eq(schoolYears.id,terms.schoolYearId))
      .where(and(eq(sections.siteId,site.id),eq(programs.siteId,site.id),
        eq(programs.organizationId,site.organizationId),
        eq(schoolYears.siteId,site.id),eq(schoolYears.organizationId,site.organizationId),
        eq(schoolYears.status,"active"),eq(sections.active,true),
        eq(programs.status,"active"),
        lte(schoolYears.startsOn,data.date),gte(schoolYears.endsOn,data.date),
        lte(terms.startsOn,data.date),gte(terms.endsOn,data.date),
        inArray(sections.programId,actor.scope.programIds??[])))
      .limit(251);
    const projectionTruncated=sectionsAtSite.length>250;
    const onsiteSections=sectionsAtSite.slice(0,250).filter(row=>row.deliveryModel.onsite===true);
    if(!onsiteSections.length){
      return {date:data.date,siteId:site.id,projectionTruncated,
        ...summarizeOnsiteSupervision([])};
    }
    const ids=onsiteSections.map(row=>row.id);
    const templateIds=[...new Set(onsiteSections.map(r=>r.scheduleTemplateId)
      .filter((id):id is string=>!!id))];
    const day=new Date(data.date+"T12:00:00Z").getUTCDay();
    const [periodRows,arrangements]=await Promise.all([
      templateIds.length?db.select({
        templateId:scheduleTemplates.id,yearId:scheduleTemplates.schoolYearId,
        programId:scheduleTemplates.programId,siteId:scheduleTemplates.siteId,
        periodId:scheduleTemplatePeriods.id,label:scheduleTemplatePeriods.label,
        starts:scheduleTemplatePeriods.startsAtLocal,
        ends:scheduleTemplatePeriods.endsAtLocal,
      }).from(scheduleTemplatePeriods)
        .innerJoin(scheduleTemplates,eq(scheduleTemplates.id,scheduleTemplatePeriods.scheduleTemplateId))
        .where(and(inArray(scheduleTemplates.id,templateIds),
          eq(scheduleTemplates.siteId,site.id),eq(scheduleTemplates.active,true),
          lte(scheduleTemplates.effectiveFrom,data.date),
          or(isNull(scheduleTemplates.effectiveThrough),
            gte(scheduleTemplates.effectiveThrough,data.date)),
          eq(scheduleTemplatePeriods.dayOfWeek,day),
          eq(scheduleTemplatePeriods.type,"instruction"))):Promise.resolve([]),
      db.select({
        sectionId:deliveryArrangements.sectionId,
        facilitatorPersonId:deliveryArrangements.facilitatorPersonId,
        from:deliveryArrangements.effectiveFrom,
        through:deliveryArrangements.effectiveThrough,
        modality:deliveryArrangements.modality,
      }).from(deliveryArrangements)
        .where(and(inArray(deliveryArrangements.sectionId,ids),
          eq(deliveryArrangements.status,"active"))),
    ]);
    const candidates=arrangements.filter(row=>{
      if(!["onsite","hybrid"].includes(row.modality))return false;
      if(!row.facilitatorPersonId)return true;
      // Effective windows may start/end partway through the selected day;
      // such partial windows are NOT treated as full-day cover.
      const start=new Date(data.date+"T00:00:00Z").getTime()-86400_000;
      const end=new Date(data.date+"T00:00:00Z").getTime()+2*86400_000;
      return (!row.from || row.from.getTime()<=start) &&
        (!row.through || row.through.getTime()>=end);
    });
    const peopleIds=[...new Set(candidates.map(row=>row.facilitatorPersonId)
      .filter((id):id is string=>!!id))];
    const [activePeople,staffGrants]=await Promise.all([
      peopleIds.length?db.select({id:people.id,firstName:people.legalFirstName,
        lastName:people.legalLastName,active:people.active})
        .from(people).where(inArray(people.id,peopleIds)):Promise.resolve([]),
      peopleIds.length?db.select({personId:accountPersonGrants.personId,
        role:accountPersonGrants.role})
        .from(accountPersonGrants)
        .innerJoin(accessAccounts,eq(accessAccounts.id,accountPersonGrants.accountId))
        .where(and(eq(accessAccounts.disabled,false),eq(accountPersonGrants.isSynthetic,false),
          inArray(accountPersonGrants.personId,peopleIds),
          eq(accountPersonGrants.siteId,site.id),
          eq(accountPersonGrants.organizationId,site.organizationId),
          eq(accountPersonGrants.active,true),
          inArray(accountPersonGrants.role,["room_facilitator","site_staff","site_leader"]))):Promise.resolve([]),
    ]);
    const peopleById=new Map(activePeople.map(row=>[row.id,row]));
    const bySection=new Map<string,typeof candidates>();
    for(const entry of candidates){
      const items=bySection.get(entry.sectionId)??[];items.push(entry);
      bySection.set(entry.sectionId,items);
    }
    const result:SupervisionBlockInput[]=[];
    for(const section of onsiteSections){
      const templates=periodRows.filter(row=>
        row.templateId===section.scheduleTemplateId &&
        row.yearId===section.schoolYearId &&
        (row.programId===null||row.programId===section.programId));
      const assigned=bySection.get(section.id)??[];
      const uniqueIds=[...new Set(assigned.map(row=>row.facilitatorPersonId).filter(
        (id):id is string=>!!id))];
      const personId=uniqueIds.length===1?uniqueIds[0]!:null;
      const person=personId?peopleById.get(personId):null;
      const approved=!!person?.active && staffGrants.some(grant=>
        grant.personId===personId);
      for(const period of templates.length?templates:[null]){
        result.push({
          sectionId:section.id,sectionTitle:section.title,
          programId:section.programId,programName:section.programName,
          periodId:period?.periodId??null,periodLabel:period?.label??null,
          startsAtLocal:period?.starts??null,endsAtLocal:period?.ends??null,
          facilitatorPersonId:personId,
          facilitatorName:person?.active?person.firstName+" "+person.lastName:null,
          verifiedSiteStaffGrant:approved,
          overlappingFacilitatorAssignments:uniqueIds.length>1,
        });
      }
    }
    const projection=summarizeOnsiteSupervision(result);
    // Person IDs are needed for overlap detection, not for the client.
    const blocks=projection.blocks.map(({facilitatorPersonId:_id,...block})=>block);
    return {date:data.date,siteId:site.id,projectionTruncated,
      ...projection,blocks};
  });
