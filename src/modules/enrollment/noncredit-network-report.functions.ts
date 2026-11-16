import {createServerFn} from "@tanstack/react-start";
import {setResponseHeader} from "@tanstack/react-start/server";
import {and,desc,eq,inArray} from "drizzle-orm";
import {db} from "@/db/client";
import {
  canonicalEnrollmentSites,facilitatedClassroomPlans,
  facilitatedRoomAttendanceAssertions,learnerCourseAttempts,
  noncreditCompletionDecisions,noncreditRegistrations,
  noncreditSelfEnrollmentClaims,noncreditSelfEnrollmentReleases,
  noncreditTrainingVersions,participationAttributions,networkMemberships,
  networkUnits,canonicalEnrollmentOrganizations,
} from "@/db/canonical-v301";
import {requireCanonicalLabProvider} from "@/modules/operations/canonical-capability-lab-access.server";

/** Organization-scoped reporting. This must not infer a denomination-level
 * grant from a label, favorite Site, or marketing affiliation.
 * National reporting across distinct Organizations requires independently
 * approved portfolio delegation; this endpoint intentionally cannot do it.
 */
export const getNoncreditOperatorNetworkSummary=createServerFn({method:"GET"})
  .handler(async()=>{
    setResponseHeader("Cache-Control","private, no-store");
    const provider=await requireCanonicalLabProvider("noncredit.enrollment.read");
    const releases=await db.select({
      id:noncreditSelfEnrollmentReleases.id,
      siteId:noncreditSelfEnrollmentReleases.siteId,
      title:noncreditTrainingVersions.title,
      siteName:canonicalEnrollmentSites.name,
      deliveryMode:noncreditSelfEnrollmentReleases.deliveryMode,
    }).from(noncreditSelfEnrollmentReleases)
      .innerJoin(noncreditTrainingVersions,eq(
        noncreditTrainingVersions.id,noncreditSelfEnrollmentReleases.trainingVersionId))
      .innerJoin(canonicalEnrollmentSites,eq(
        canonicalEnrollmentSites.id,noncreditSelfEnrollmentReleases.siteId))
      .where(and(
        eq(noncreditSelfEnrollmentReleases.registeringOrganizationId,provider.organizationId),
        inArray(noncreditSelfEnrollmentReleases.siteId,provider.siteIds),
      )).limit(1001);
    if(releases.length>1000)throw new Error("Organization has more than 1000 releases; use an interval report");
    if(!releases.length)return {asOf:new Date().toISOString(),totals:{
      registrations:0,active:0,withdrawn:0,completed:0,
      verifiedAttendees:0,linkedRooms:0,
    },sites:[],cohorts:[],affiliations:[],networkUnits:[],
      publicationSafe:{minimumCell:10,groups:[],affiliations:[]}};
    const ids=releases.map(x=>x.id);
    const claims=await db.select({
      releaseId:noncreditSelfEnrollmentClaims.releaseId,
      registrationId:noncreditSelfEnrollmentClaims.registrationId,
      status:noncreditRegistrations.status,
    }).from(noncreditSelfEnrollmentClaims)
      .innerJoin(noncreditRegistrations,eq(
        noncreditRegistrations.id,noncreditSelfEnrollmentClaims.registrationId))
      .where(and(
        inArray(noncreditSelfEnrollmentClaims.releaseId,ids),
        eq(noncreditRegistrations.registeringOrganizationId,provider.organizationId),
      )).limit(5001);
    if(claims.length>5000)throw new Error("More than 5000 registrations; partition the organization report");
    const registrationIds=claims.map(x=>x.registrationId);
    const attributions=registrationIds.length?await db.select({
      registrationId:participationAttributions.noncreditRegistrationId,
      creditedOrganizationId:participationAttributions.creditedOrganizationId,
      organizationName:canonicalEnrollmentOrganizations.displayName,
      networkMembershipId:participationAttributions.networkMembershipId,
      reportingUnitId:networkMemberships.reportingUnitId,
      reportingUnitName:networkUnits.name,
      attributionBasis:participationAttributions.attributionBasis,
      relationshipSnapshot:participationAttributions.relationshipSnapshot,
    }).from(participationAttributions)
      .innerJoin(canonicalEnrollmentOrganizations,eq(
        canonicalEnrollmentOrganizations.id,participationAttributions.creditedOrganizationId))
      .leftJoin(networkMemberships,eq(
        networkMemberships.id,participationAttributions.networkMembershipId))
      .leftJoin(networkUnits,eq(networkUnits.id,networkMemberships.reportingUnitId))
      .where(inArray(participationAttributions.noncreditRegistrationId,registrationIds))
      .limit(5001):[];
    // Reconcile exactly one immutable attribution against every source claim.
    if(attributions.length!==registrationIds.length)
      throw new Error("Reporting requires reconciled, uniquely attributed registrations");
    const attributionByRegistration=new Map(
      attributions.map(a=>[a.registrationId,a] as const));
    const decisions=registrationIds.length?await db.select({
      registrationId:noncreditCompletionDecisions.registrationId,
      outcome:noncreditCompletionDecisions.outcome,
      decidedAt:noncreditCompletionDecisions.decidedAt,
    }).from(noncreditCompletionDecisions)
      .where(inArray(noncreditCompletionDecisions.registrationId,registrationIds))
      .orderBy(desc(noncreditCompletionDecisions.decidedAt)).limit(10001):[];
    if(decisions.length>10000)throw new Error("Completion decision report needs partitioning");
    const lastDecision=new Map<string,string>();
    for(const d of decisions)if(!lastDecision.has(d.registrationId))
      lastDecision.set(d.registrationId,d.outcome);
    const attempts=registrationIds.length?await db.select({
      registrationId:learnerCourseAttempts.noncreditRegistrationId,
      attemptId:learnerCourseAttempts.id,
    }).from(learnerCourseAttempts)
      .where(inArray(learnerCourseAttempts.noncreditRegistrationId,registrationIds))
      .limit(10001):[];
    if(attempts.length>10000)throw new Error("Course attempts exceed reporting bounds");
    const roomPlans=await db.select({
      releaseId:facilitatedClassroomPlans.enrollmentReleaseId,
      roomId:facilitatedClassroomPlans.facilitatedSessionId,
    }).from(facilitatedClassroomPlans)
      .where(inArray(facilitatedClassroomPlans.enrollmentReleaseId,ids))
      .limit(10001);
    if(roomPlans.length>10000)throw new Error("Classroom rooms exceed reporting bounds");
    const roomIds=roomPlans.map(p=>p.roomId).filter((x):x is string=>x!==null);
    const attemptIds=attempts.map(a=>a.attemptId);
    const asserted=roomIds.length&&attemptIds.length?await db.select({
      roomId:facilitatedRoomAttendanceAssertions.facilitatedSessionId,
      attemptId:facilitatedRoomAttendanceAssertions.courseAttemptId,
      status:facilitatedRoomAttendanceAssertions.status,
    }).from(facilitatedRoomAttendanceAssertions)
      .where(and(
        inArray(facilitatedRoomAttendanceAssertions.facilitatedSessionId,roomIds),
        inArray(facilitatedRoomAttendanceAssertions.courseAttemptId,attemptIds),
      )).orderBy(desc(facilitatedRoomAttendanceAssertions.assertedAt),
        desc(facilitatedRoomAttendanceAssertions.id)).limit(20001):[];
    if(asserted.length>20000)throw new Error("Attendance assertions exceed reporting bounds");
    const latest=new Map<string,string>();
    for(const a of asserted){
      const key=a.roomId+":"+a.attemptId;
      if(!latest.has(key))latest.set(key,a.status);
    }
    const present=new Set<string>();
    for(const [key,status] of latest)if(status==="present")present.add(key);
    const attemptsByRegistration=new Map<string,string[]>();
    for(const a of attempts){
      if(!a.registrationId)continue;
      attemptsByRegistration.set(a.registrationId,
        [...(attemptsByRegistration.get(a.registrationId)??[]),a.attemptId]);
    }
    const roomsByRelease=new Map<string,string[]>();
    for(const p of roomPlans)if(p.releaseId&&p.roomId)
      roomsByRelease.set(p.releaseId,
        [...(roomsByRelease.get(p.releaseId)??[]),p.roomId]);
    const cohorts=releases.map(r=>{
      const local=claims.filter(c=>c.releaseId===r.id);
      const roomIds=roomsByRelease.get(r.id)??[];
      const verifiedAttendees=local.filter(c=>
        (attemptsByRegistration.get(c.registrationId)??[]).some(a=>
          roomIds.some(room=>present.has(room+":"+a)))).length;
      return {
        releaseId:r.id,siteId:r.siteId,siteName:r.siteName,
        trainingTitle:r.title,deliveryMode:r.deliveryMode,
        registrations:local.length,
        active:local.filter(x=>["registered","active"].includes(x.status)).length,
        withdrawn:local.filter(x=>x.status==="withdrawn").length,
        completed:local.filter(x=>lastDecision.get(x.registrationId)==="completed").length,
        verifiedAttendees,linkedRooms:roomIds.length,
      };
    });
    const siteKeys=[...new Set(cohorts.map(c=>c.siteId))];
    const sites=siteKeys.map(key=>{
      const local=cohorts.filter(c=>c.siteId===key);
      return {
        siteId:key,
        siteName:local[0]?.siteName??"Unknown authorized Site",
        registrations:local.reduce((n,x)=>n+x.registrations,0),
        active:local.reduce((n,x)=>n+x.active,0),
        withdrawn:local.reduce((n,x)=>n+x.withdrawn,0),
        completed:local.reduce((n,x)=>n+x.completed,0),
        verifiedAttendees:local.reduce((n,x)=>n+x.verifiedAttendees,0),
        linkedRooms:local.reduce((n,x)=>n+x.linkedRooms,0),
      };
    });
    const totals={
      registrations:sites.reduce((n,x)=>n+x.registrations,0),
      active:sites.reduce((n,x)=>n+x.active,0),
      withdrawn:sites.reduce((n,x)=>n+x.withdrawn,0),
      completed:sites.reduce((n,x)=>n+x.completed,0),
      verifiedAttendees:sites.reduce((n,x)=>n+x.verifiedAttendees,0),
      linkedRooms:sites.reduce((n,x)=>n+x.linkedRooms,0),
    };
    // Provider-private reporting across its own registrations: participating
    // affiliates are separate from delivery Sites. Neither creates another
    // learner, attendance fact, completion or network read grant.
    const attendanceFor=(claim:{releaseId:string;registrationId:string})=>
      (attemptsByRegistration.get(claim.registrationId)??[]).some(attempt=>
        (roomsByRelease.get(claim.releaseId)??[]).some(room=>present.has(room+":"+attempt)));
    const affiliateMap=new Map<string,{
      organizationId:string;organizationName:string;reportingUnitId:string|null;
      reportingUnitName:string|null;basis:"provider_default"|"self_reported"|"verified_member";
      registrations:number;completed:number;verifiedAttendees:number;
    }>();
    const unitMap=new Map<string,{
      unitId:string;unitName:string;unitCode:string;
      registrations:number;completed:number;verifiedAttendees:number;
    }>();
    for(const claim of claims){
      const a=attributionByRegistration.get(claim.registrationId);
      if(!a)throw new Error("Missing registration attribution");
      const key=a.creditedOrganizationId+":"+String(a.networkMembershipId??"");
      const group=affiliateMap.get(key)??{
        organizationId:a.creditedOrganizationId,organizationName:a.organizationName,
        reportingUnitId:a.reportingUnitId,reportingUnitName:a.reportingUnitName,
        basis:a.attributionBasis,registrations:0,completed:0,verifiedAttendees:0,
      };
      group.registrations++;
      const completed=lastDecision.get(claim.registrationId)==="completed";
      if(completed)group.completed++;
      const attended=attendanceFor(claim);
      if(attended)group.verifiedAttendees++;
      affiliateMap.set(key,group);
      // Count each sourced registration once in EACH level of its own
      // snapshotted path. Do not sum levels to produce a national total.
      const nodes=a.relationshipSnapshot.reportingPath;
      const seen=new Set<string>();
      if(Array.isArray(nodes))for(const node of nodes){
        if(!node||typeof node!=="object"||Array.isArray(node))continue;
        const id=node.id,name=node.name,code=node.code;
        if(typeof id!=="string"||typeof name!=="string"||
          typeof code!=="string"||seen.has(id))continue;
        seen.add(id);
        const unit=unitMap.get(id)??{
          unitId:id,unitName:name,unitCode:code,
          registrations:0,completed:0,verifiedAttendees:0,
        };
        unit.registrations++;
        if(completed)unit.completed++;
        if(attended)unit.verifiedAttendees++;
        unitMap.set(id,unit);
      }
    }
    const affiliations=[...affiliateMap.values()].sort((a,b)=>
      a.organizationName.localeCompare(b.organizationName));
    const networkUnits=[...unitMap.values()].sort((a,b)=>
      a.unitName.localeCompare(b.unitName));
    if(affiliations.reduce((n,a)=>n+a.registrations,0)!==totals.registrations)
      throw new Error("Affiliate attribution did not reconcile to source totals");
    const minimumCell=10;
    const safe=sites.filter(s=>s.registrations>=minimumCell).map(s=>({
      siteName:s.siteName,registrations:s.registrations,
      completed:s.completed>=minimumCell?s.completed:null,
      verifiedAttendees:s.verifiedAttendees>=minimumCell?s.verifiedAttendees:null,
    }));
    return {asOf:new Date().toISOString(),totals,sites,cohorts,
      affiliations,networkUnits,
      publicationSafe:{minimumCell,groups:safe,
        affiliations:affiliations.filter(a=>a.registrations>=minimumCell).map(a=>({
          organizationName:a.organizationName,registrations:a.registrations,
          completed:a.completed>=minimumCell?a.completed:null,
          verifiedAttendees:a.verifiedAttendees>=minimumCell?a.verifiedAttendees:null,
        }))},
      notice:"Provider-private totals. Each completion is a latest formal noncredit decision; attendance is facilitator-attested in explicitly linked rooms. Affiliate selection is self-reported; no inferred individual church membership, watch-time, funding or accreditation claims. Network-wide reporting across other providers requires independently approved grants. Published partner reports must use the suppressed publicationSafe projection."};
  });
