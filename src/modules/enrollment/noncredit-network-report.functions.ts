import {createServerFn} from "@tanstack/react-start";
import {setResponseHeader} from "@tanstack/react-start/server";
import {z} from "zod";
import {geographyFilterSchema} from "@/domain/geographic-reporting";
import {geographyFactPredicate} from "@/modules/geography/reporting-geography.server";
import {and,desc,eq,inArray,sql} from "drizzle-orm";
import {db} from "@/db/client";
import {sites as operatingSites} from "@/db/schema";
import {
  facilitatedClassroomPlans,
  facilitatedRoomAttendanceAssertions,learnerCourseAttempts,
  noncreditCompletionDecisions,noncreditRegistrations,
  noncreditSelfEnrollmentClaims,noncreditSelfEnrollmentReleases,
  noncreditTrainingVersions,participationAttributions,
  canonicalEnrollmentOrganizations,
} from "@/db/canonical-v301";
import {decodeHistoricalNetworkPath,rollupAttributionEvidence} from "@/domain/network-attribution";
import {currentNoncreditCompletionStates} from "@/domain/verified-completion-projection";
import {summarizeDistinctNoncreditParticipation} from "@/domain/noncredit-participant-rollup";
import {summarizeVerifiedRoomAttendance} from "@/domain/classroom-attendance";

/** Organization-scoped reporting. This must not infer a denomination-level
 * grant from a label, favorite Site, or marketing affiliation.
 * National reporting across distinct Organizations requires independently
 * approved portfolio delegation; this endpoint intentionally cannot do it.
 */
export const getNoncreditOperatorNetworkSummary=createServerFn({method:"GET"})
  .validator((value:unknown)=>z.object({geography:geographyFilterSchema}).strict().optional().parse(value)??{geography:""})
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const {requireCanonicalLabProvider}=await import("@/modules/operations/canonical-capability-lab-access.server");
    const provider=await requireCanonicalLabProvider("noncredit.enrollment.read");
    return db.transaction(async tx=>{
    const asOf=new Date().toISOString();
    const releases=await tx.select({
      id:noncreditSelfEnrollmentReleases.id,
      siteId:noncreditSelfEnrollmentReleases.siteId,
      title:noncreditTrainingVersions.title,
      siteName:operatingSites.name,
      deliveryMode:noncreditSelfEnrollmentReleases.deliveryMode,
      trainingVersionId:noncreditSelfEnrollmentReleases.trainingVersionId,
      deploymentId:noncreditSelfEnrollmentReleases.deploymentId,
      adoptionId:noncreditSelfEnrollmentReleases.adoptionId,
      offeringVersionId:noncreditSelfEnrollmentReleases.offeringVersionId,
      siteOrganizationId:operatingSites.organizationId,
    }).from(noncreditSelfEnrollmentReleases)
      .innerJoin(noncreditTrainingVersions,eq(
        noncreditTrainingVersions.id,noncreditSelfEnrollmentReleases.trainingVersionId))
      .innerJoin(operatingSites,eq(operatingSites.id,noncreditSelfEnrollmentReleases.siteId))
      .where(and(
        eq(noncreditSelfEnrollmentReleases.registeringOrganizationId,provider.organizationId),
        inArray(noncreditSelfEnrollmentReleases.siteId,provider.siteIds),
        geographyFactPredicate(data.geography,sql`${operatingSites.id}`,sql`${operatingSites.organizationId}`,sql`${asOf}::timestamptz`),
      )).limit(1001);
    if(releases.length>1000)throw new Error("Organization has more than 1000 releases; use an interval report");
    if(releases.some(r=>r.siteOrganizationId!==provider.organizationId))throw new Error("Release Site ownership does not reconcile");
    if(!releases.length)return {asOf,totals:{
      registrations:0,active:0,withdrawn:0,completed:0,
      verifiedAttendees:0,linkedRooms:0,uniquePeople:0,uniqueCompletedPeople:0,uniqueVerifiedAttendees:0,repeatRegistrations:0,
    },sites:[],cohorts:[],affiliations:[],networkUnits:[],
      publicationSafe:{minimumCell:10,groups:[],affiliations:[]},disclosureApproved:false as const};
    const ids=releases.map(x=>x.id);
    const claims=await tx.select({
      releaseId:noncreditSelfEnrollmentClaims.releaseId,
      registrationId:noncreditSelfEnrollmentClaims.registrationId,
      status:noncreditRegistrations.status,
      personId:noncreditRegistrations.participantPersonId,
      claimPersonId:noncreditSelfEnrollmentClaims.participantPersonId,
      siteId:noncreditSelfEnrollmentClaims.siteId,
      trainingVersionId:noncreditRegistrations.trainingVersionId,
      deploymentId:noncreditRegistrations.deploymentId,
      adoptionId:noncreditRegistrations.adoptionId,
      offeringVersionId:noncreditRegistrations.offeringVersionId,
    }).from(noncreditSelfEnrollmentClaims)
      .innerJoin(noncreditRegistrations,eq(
        noncreditRegistrations.id,noncreditSelfEnrollmentClaims.registrationId))
      .where(and(
        inArray(noncreditSelfEnrollmentClaims.releaseId,ids),
        // Load every claim for the authorized releases, including a mismatched
        // registration owner, so corruption is detected rather than omitted.
        eq(noncreditRegistrations.registeringOrganizationId,provider.organizationId),
      )).limit(5001);
    if(claims.length>5000)throw new Error("More than 5000 registrations; partition the organization report");
    const releaseById=new Map(releases.map(r=>[r.id,r] as const));
    const registrationIds=claims.map(x=>x.registrationId);
    const allClaimRows=await tx.select({releaseId:noncreditSelfEnrollmentClaims.releaseId,registrationId:noncreditSelfEnrollmentClaims.registrationId}).from(noncreditSelfEnrollmentClaims)
      .where(inArray(noncreditSelfEnrollmentClaims.releaseId,ids)).limit(5001);
    if(allClaimRows.length!==claims.length||new Set(registrationIds).size!==registrationIds.length)
      throw new Error("Claim ownership or registration identity requires reconciliation");
    for(const claim of claims){
      const release=releaseById.get(claim.releaseId);
      if(!release||claim.siteId!==release.siteId||claim.claimPersonId!==claim.personId||
        claim.trainingVersionId!==release.trainingVersionId||claim.deploymentId!==release.deploymentId||
        claim.adoptionId!==release.adoptionId||claim.offeringVersionId!==release.offeringVersionId)
        throw new Error("Noncredit claim does not reconcile to its exact release and participant");
    }
    const attributions=registrationIds.length?await tx.select({
      registrationId:participationAttributions.noncreditRegistrationId,
      creditedOrganizationId:participationAttributions.creditedOrganizationId,
      organizationName:canonicalEnrollmentOrganizations.displayName,
      networkMembershipId:participationAttributions.networkMembershipId,
      attributionBasis:participationAttributions.attributionBasis,
      relationshipSnapshot:participationAttributions.relationshipSnapshot,
    }).from(participationAttributions)
      .innerJoin(canonicalEnrollmentOrganizations,eq(
        canonicalEnrollmentOrganizations.id,participationAttributions.creditedOrganizationId))
      .where(inArray(participationAttributions.noncreditRegistrationId,registrationIds))
      .limit(5001):[];
    // Reconcile exactly one immutable attribution against every source claim.
    if(attributions.length!==registrationIds.length)
      throw new Error("Reporting requires reconciled, uniquely attributed registrations");
    const attributionByRegistration=new Map(
      attributions.map(a=>[a.registrationId,a] as const));
    if(attributionByRegistration.size!==registrationIds.length||registrationIds.some(id=>!attributionByRegistration.has(id)))throw new Error("Attribution source identity does not reconcile");
    const decisions=registrationIds.length?await tx.select({
      id:noncreditCompletionDecisions.id,
      registrationId:noncreditCompletionDecisions.registrationId,
      outcome:noncreditCompletionDecisions.outcome,
      supersedesId:noncreditCompletionDecisions.supersedesId,
      decidedAt:noncreditCompletionDecisions.decidedAt,
    }).from(noncreditCompletionDecisions)
      .where(inArray(noncreditCompletionDecisions.registrationId,registrationIds))
      .orderBy(desc(noncreditCompletionDecisions.decidedAt)).limit(10001):[];
    if(decisions.length>10000)throw new Error("Completion decision report needs partitioning");
    // Use the governed source chain, never newest-row-wins. The operator
    // report must fail closed if revisions conflict or a chain is incomplete.
    const completion=currentNoncreditCompletionStates(registrationIds,decisions);
    if(completion.invalidRegistrations.length)
      throw new Error("Noncredit completion history requires reconciliation");
    const attempts=registrationIds.length?await tx.select({
      registrationId:learnerCourseAttempts.noncreditRegistrationId,
      attemptId:learnerCourseAttempts.id,
    }).from(learnerCourseAttempts)
      .where(inArray(learnerCourseAttempts.noncreditRegistrationId,registrationIds))
      .limit(10001):[];
    if(attempts.length>10000)throw new Error("Course attempts exceed reporting bounds");
    const roomPlans=await tx.select({
      releaseId:facilitatedClassroomPlans.enrollmentReleaseId,
      roomId:facilitatedClassroomPlans.facilitatedSessionId,
    }).from(facilitatedClassroomPlans)
      .where(inArray(facilitatedClassroomPlans.enrollmentReleaseId,ids))
      .limit(10001);
    if(roomPlans.length>10000)throw new Error("Classroom rooms exceed reporting bounds");
    const roomIds=roomPlans.map(p=>p.roomId).filter((x):x is string=>x!==null);
    const attemptIds=attempts.map(a=>a.attemptId);
    const asserted=roomIds.length&&attemptIds.length?await tx.select({
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
    const {presentPairs:present}=summarizeVerifiedRoomAttendance(asserted);
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
    const attendanceFor=(claim:{releaseId:string;registrationId:string})=>
      (attemptsByRegistration.get(claim.registrationId)??[]).some(attempt=>
        (roomsByRelease.get(claim.releaseId)??[]).some(room=>present.has(room+":"+attempt)));
    const distinct=summarizeDistinctNoncreditParticipation(claims.map(claim=>({
      registrationId:claim.registrationId,personId:claim.personId,siteId:claim.siteId,releaseId:claim.releaseId,
      completed:completion.states.get(claim.registrationId)==="completed",verifiedAttendance:attendanceFor(claim),
    })));
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
        completed:local.filter(x=>completion.states.get(x.registrationId)==="completed").length,
        verifiedAttendees,linkedRooms:new Set(roomIds).size,
        ...(distinct.byRelease.get(r.id)??distinct.empty),
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
        linkedRooms:new Set(local.flatMap(x=>roomsByRelease.get(x.releaseId)??[])).size,
        ...(distinct.bySite.get(key)??distinct.empty),
      };
    });
    const totals={
      registrations:sites.reduce((n,x)=>n+x.registrations,0),
      active:sites.reduce((n,x)=>n+x.active,0),
      withdrawn:sites.reduce((n,x)=>n+x.withdrawn,0),
      completed:sites.reduce((n,x)=>n+x.completed,0),
      verifiedAttendees:sites.reduce((n,x)=>n+x.verifiedAttendees,0),
      linkedRooms:new Set(roomIds).size,
      ...distinct.totals,
    };
    // Delivery Site and credited Organization are distinct dimensions.
    // Each attributed registration is one unique source fact; the same
    // fact may appear at multiple ancestor network units without duplication.
    const {affiliations,networkUnits:unitRollups,uniqueRegistrations}=rollupAttributionEvidence(
      claims.map(claim=>{
        const attribution=attributionByRegistration.get(claim.registrationId);
        if(!attribution)throw new Error("Missing immutable registration attribution");
        // A church may move districts after registration. Never substitute the
        // current membership's district for the immutable event-time path.
        const historicalPath=decodeHistoricalNetworkPath(
          attribution.relationshipSnapshot.reportingPath);
        const historicalLeaf=historicalPath?.length
          ?historicalPath[historicalPath.length-1]:null;
        return {
          registrationId:claim.registrationId,
          creditedOrganizationId:attribution.creditedOrganizationId,
          organizationName:typeof attribution.relationshipSnapshot.creditedOrganizationName==="string"
            ?attribution.relationshipSnapshot.creditedOrganizationName
            :attribution.organizationName,
          networkMembershipId:attribution.networkMembershipId,
          reportingUnitId:historicalLeaf?.id??null,
          reportingUnitName:historicalLeaf?.name??null,
          basis:attribution.attributionBasis,
          path:historicalPath,
          completed:completion.states.get(claim.registrationId)==="completed",
          verifiedAttendee:attendanceFor(claim),
        };
      }),
    );
    if(uniqueRegistrations!==totals.registrations)
      throw new Error("Affiliate attribution did not reconcile to source totals");
    const minimumCell=10;
    const safe=sites.filter(s=>s.registrations>=minimumCell).map(s=>({
      siteName:s.siteName,registrations:s.registrations,
      completed:s.completed>=minimumCell?s.completed:null,
      verifiedAttendees:s.verifiedAttendees>=minimumCell?s.verifiedAttendees:null,
    }));
    return {asOf,totals,sites,cohorts,
      disclosureApproved:false as const,
      affiliations,networkUnits:unitRollups,
      publicationSafe:{minimumCell,groups:safe,
        affiliations:affiliations.filter(a=>a.registrations>=minimumCell).map(a=>({
          organizationName:a.organizationName,registrations:a.registrations,
          completed:a.completed>=minimumCell?a.completed:null,
          verifiedAttendees:a.verifiedAttendees>=minimumCell?a.verifiedAttendees:null,
        }))},
      notice:"Provider-private totals. Each completion is a supersession-validated formal noncredit decision; attendance is facilitator-attested in explicitly linked rooms. Affiliate selection is self-reported; no inferred individual church membership, watch-time, funding or accreditation claims. Network-wide reporting across other providers requires independently approved grants. The small-cell-filtered preview is not disclosure approval. External publication requires separately approved scoped disclosure, including overlapping cuts and historical differencing. Unique people are distinct canonical participant IDs within this source only; do not add Site subtotals or merge identity namespaces."};
    },{isolationLevel:"repeatable read",accessMode:"read only"});
  });
