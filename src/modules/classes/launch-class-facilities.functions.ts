import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, asc, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db/client";
import { accessAccounts, accountPersonGrants, people, sites } from "@/db/schema";
import { canonicalClasses, canonicalClassStaffAssignments, siteSpaces } from "@/db/canonical-v301";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { DomainError } from "@/domain/errors";
import { verifiedStaffIdentityPredicate } from "@/modules/identity/verified-staff-identity.server";
import {
  readSiteSpacesV61Schema, parseSitePlanningResourcesV61,
  roomPlanningFitsClass, saveClassPhysicalPlanV61Schema,
} from "@/domain/launch-facilities-v61";
import { getCanonicalCommandContext } from "@/modules/identity/canonical-command-context.server";
import { assertCurrentCanonicalStaffForMutation } from "@/modules/identity/canonical-transaction-authorization.server";
import { writeCanonicalAudit, emitCanonicalDomainEvent } from "@/platform/canonical-mutation.server";
import { validateClassAuthority } from "./unified-class-authority.server";

type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
type Actor=Awaited<ReturnType<typeof getCanonicalCommandContext>>;
async function classManager(siteId:string){
  const actor=await getCanonicalCommandContext(getRequest());
  if(!actor.actorPersonId||!["site_admin","registrar"].includes(actor.role??""))
    throw new AuthorizationError("current canonical Class manager");
  assertCapability(actor,"class.manage");
  if(actor.scope.organizationIds?.length!==1 ||
     !actor.scope.siteIds?.includes(siteId))
    throw new AuthorizationError("exact Class Site and Organization");
  return actor;
}
async function ownedSite(tx:Tx,actor:Actor,siteId:string){
  const [site]=await tx.select({id:sites.id,organizationId:sites.organizationId})
    .from(sites).where(eq(sites.id,siteId)).limit(1);
  if(!site||site.organizationId!==actor.scope.organizationIds?.[0])
    throw new AuthorizationError("exact owned Class Site");
  return site;
}

export const readLaunchClassFacilitiesV61=createServerFn({method:"GET"})
  .validator((raw:unknown)=>readSiteSpacesV61Schema.parse(raw))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const actor=await classManager(data.siteId);
    return db.transaction(async tx=>{
      const site=await ownedSite(tx,actor,data.siteId);
      const classes=await tx.select({
        id:canonicalClasses.id,title:canonicalClasses.title,
        capacity:canonicalClasses.capacity,state:canonicalClasses.state,
        updatedAt:canonicalClasses.updatedAt,
        physicalSpaceId:canonicalClasses.physicalSpaceId,
        primaryFacilitatorAssignmentId:canonicalClasses.primaryFacilitatorAssignmentId,
        revision:canonicalClasses.physicalPlanningRevision,
      }).from(canonicalClasses)
        .where(and(eq(canonicalClasses.siteId,site.id),
          eq(canonicalClasses.operatingOrganizationId,site.organizationId)))
        .orderBy(asc(canonicalClasses.title)).limit(501);
      if(classes.length>500)throw new DomainError("UNAVAILABLE","Class directory too large");
      const ids=classes.map(x=>x.id);
      const assignments=ids.length?await tx.select({
        id:canonicalClassStaffAssignments.id,
        classId:canonicalClassStaffAssignments.classId,
        personId:canonicalClassStaffAssignments.personId,
        roleCode:canonicalClassStaffAssignments.roleCode,
        nameFirst:people.legalFirstName,
        nameLast:people.legalLastName,
      }).from(canonicalClassStaffAssignments)
        .innerJoin(people,eq(people.id,canonicalClassStaffAssignments.personId))
        .where(and(inArray(canonicalClassStaffAssignments.classId,ids),
          eq(canonicalClassStaffAssignments.state,"approved"),
          lte(canonicalClassStaffAssignments.beginsAt,new Date()),
          or(isNull(canonicalClassStaffAssignments.endsAt),
            gt(canonicalClassStaffAssignments.endsAt,new Date()))))
        .limit(2001):[];
      if(assignments.length>2000)throw new DomainError("UNAVAILABLE","Staff assignment directory too large");
      const peopleWithGrant=await tx.select({
        id:people.id,first:people.legalFirstName,last:people.legalLastName,
      }).from(accountPersonGrants)
        .innerJoin(accessAccounts,and(
          eq(accessAccounts.id,accountPersonGrants.accountId),
          eq(accessAccounts.personId,accountPersonGrants.personId)))
        .innerJoin(people,eq(people.id,accountPersonGrants.personId))
        .where(and(eq(accountPersonGrants.siteId,site.id),
          eq(accountPersonGrants.organizationId,site.organizationId),
          eq(accountPersonGrants.role,"room_facilitator"),
          eq(accountPersonGrants.active,true),
          eq(people.active,true),
          eq(accessAccounts.disabled,false),
          verifiedStaffIdentityPredicate())).limit(501);
      if(peopleWithGrant.length>500)throw new DomainError("UNAVAILABLE","Facilitator directory too large");
      const spaces=await tx.select().from(siteSpaces)
        .where(eq(siteSpaces.siteId,site.id)).orderBy(asc(siteSpaces.name)).limit(501);
      if(spaces.length>500)throw new DomainError("UNAVAILABLE","Physical Space directory too large");
      return {siteId:site.id,spaces:spaces.map(space=>({
        id:space.id,name:space.name,maxOccupancy:space.maxOccupancy,
        resources:parseSitePlanningResourcesV61(space.resources),
      })),
        facilitators:peopleWithGrant
          .map(row=>({personId:row.id,name:[row.first,row.last].filter(Boolean).join(" ")})),
        classes:classes.map(cls=>({
          classId:cls.id,title:cls.title,state:cls.state,capacity:cls.capacity,
          physicalSpaceId:cls.physicalSpaceId,
          primaryFacilitatorAssignmentId:cls.primaryFacilitatorAssignmentId,
          revision:cls.revision,
          staff:assignments.filter(a=>a.classId===cls.id).map(a=>({
            assignmentId:a.id,personId:a.personId,roleCode:a.roleCode,
            name:[a.nameFirst,a.nameLast].filter(Boolean).join(" "),
          })),
        })),
      };
    });
  });

/** Class-level default room and facilitator references. Staff permission is
 * always owned by canonical class_staff_assignments. No second facilitator
 * grant, legacy Section, or room coverage record is generated. */
export const saveLaunchClassPhysicalPlanV61=createServerFn({method:"POST"})
  .validator((raw:unknown)=>saveClassPhysicalPlanV61Schema.parse(raw))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const actor=await classManager(data.siteId);
    return db.transaction(async tx=>{
      const site=await ownedSite(tx,actor,data.siteId);
      await tx.select({id:sites.id}).from(sites)
        .where(eq(sites.id,data.siteId)).for("update").limit(1);
      const [cls]=await tx.select().from(canonicalClasses)
        .where(and(eq(canonicalClasses.id,data.classId),
          eq(canonicalClasses.siteId,data.siteId),
          eq(canonicalClasses.operatingOrganizationId,site.organizationId)))
        .for("update").limit(1);
      if(!cls||!["draft","approved"].includes(cls.state))
        throw new AuthorizationError("modifiable Site-owned Class plan");
      if(cls.physicalPlanningRevision!==data.expectedRevision)
        throw new DomainError("CONFLICT","The Class facilities plan changed. Reload and review.");
      await validateClassAuthority(tx,{
        actor,organizationId:site.organizationId,siteIds:[site.id],
      },{
        deploymentId:cls.deploymentId,adoptionId:cls.adoptionId,
        offeringVersionId:cls.offeringVersionId,courseVersionId:cls.courseVersionId,
        operatingOrganizationId:cls.operatingOrganizationId,
        siteId:cls.siteId,title:cls.title,deliveryMode:cls.deliveryMode,
        capacity:cls.capacity,
      });
      if(data.spaceId){
        const [space]=await tx.select().from(siteSpaces)
          .where(and(eq(siteSpaces.id,data.spaceId),
            eq(siteSpaces.siteId,site.id))).for("share").limit(1);
        if(!space)throw new AuthorizationError("physical room at the exact hosting Site");
        if(!roomPlanningFitsClass(cls.capacity,space.maxOccupancy))
          throw new DomainError("CONFLICT","Room capacity is unknown or lower than this Class's planned seats");
      }
      if(data.facilitatorAssignmentId){
        const now=new Date();
        const [assignment]=await tx.select().from(canonicalClassStaffAssignments)
          .where(and(
            eq(canonicalClassStaffAssignments.id,data.facilitatorAssignmentId),
            eq(canonicalClassStaffAssignments.classId,cls.id),
            eq(canonicalClassStaffAssignments.roleCode,"facilitator"),
            eq(canonicalClassStaffAssignments.state,"approved"),
            lte(canonicalClassStaffAssignments.beginsAt,now),
            or(isNull(canonicalClassStaffAssignments.endsAt),
              gt(canonicalClassStaffAssignments.endsAt,now))))
          .limit(1);
        if(!assignment)throw new AuthorizationError("approved facilitator assignment to this exact Class");
        const [grant]=await tx.select({id:accountPersonGrants.id})
          .from(accountPersonGrants)
          .innerJoin(accessAccounts,and(
            eq(accessAccounts.id,accountPersonGrants.accountId),
            eq(accessAccounts.personId,accountPersonGrants.personId)))
          .innerJoin(people,eq(people.id,accountPersonGrants.personId))
          .where(and(
            eq(accountPersonGrants.personId,assignment.personId),
            eq(accountPersonGrants.siteId,site.id),
            eq(accountPersonGrants.organizationId,site.organizationId),
            eq(accountPersonGrants.role,"room_facilitator"),
            eq(accountPersonGrants.active,true),
            eq(people.active,true),
            eq(accessAccounts.disabled,false),
            verifiedStaffIdentityPredicate())).limit(1);
        if(!grant)throw new AuthorizationError("current verified Site facilitator");
      }
      if(cls.physicalSpaceId===data.spaceId &&
          cls.primaryFacilitatorAssignmentId===data.facilitatorAssignmentId)
        return {classId:cls.id,revision:cls.physicalPlanningRevision,changed:false};
      await assertCurrentCanonicalStaffForMutation(tx,getRequest(),actor);
      const revision=cls.physicalPlanningRevision+1;
      await tx.update(canonicalClasses).set({
        physicalSpaceId:data.spaceId,
        primaryFacilitatorAssignmentId:data.facilitatorAssignmentId,
        physicalPlanningRevision:revision,
        updatedAt:new Date(),
      }).where(eq(canonicalClasses.id,cls.id));
      await writeCanonicalAudit(tx,{
        actorPersonId:actor.actorPersonId!,
        owningOrganizationId:site.organizationId,
        eventCode:"class.physical_plan_updated",
        entityKind:"class",entityId:cls.id,
        payload:{siteId:site.id,revision,
          previousSpaceId:cls.physicalSpaceId,spaceId:data.spaceId,
          previousAssignmentId:cls.primaryFacilitatorAssignmentId,
          facilitatorAssignmentId:data.facilitatorAssignmentId},
      });
      await emitCanonicalDomainEvent(tx,{
        eventType:"ClassPhysicalPlanUpdated",
        aggregateType:"class",aggregateId:cls.id,
        actorPersonId:actor.actorPersonId!,
        payload:{siteId:site.id,spaceId:data.spaceId,revision},
      });
      return {classId:cls.id,revision,changed:true};
    });
  });
