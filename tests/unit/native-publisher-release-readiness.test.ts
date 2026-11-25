import {describe,expect,it} from "vitest";
import {
  projectPublisherReleaseNextStep, projectNoncreditPilotBlockers,
  type NativePublisherReleaseRecord,
} from "@/domain/native-publisher-release-readiness";

const baseline:NativePublisherReleaseRecord={
  offeringVersionId:"ca270000-0000-4000-8000-000000000051",
  offeringTitle:"Digital Skills",versionNo:1,lifecycle:"draft",
  courseCount:1,publishedCourses:0,creatorMemberships:0,
  reviewerMemberships:0,creatorAppointedCourses:0,reviewerAppointedCourses:0,
  currentEvidenceRecords:0,releasePolicies:0,manifestStatus:null,
  releaseAssets:0,approvedAdoptions:0,
};
const next=(changes:Partial<NativePublisherReleaseRecord>)=>
  projectPublisherReleaseNextStep({...baseline,...changes});

describe("publisher Course release inventory is evidence-only",()=>{
  it("identifies the first real missing membership without inventing an approval",()=>{
    expect(next({}).key).toBe("creator-membership");
    expect(next({}).detail).toContain("real CAN Person");
    expect(next({courseCount:0}).key).toBe("composition");
  });
  it("keeps reviewer and Course appointments distinct from Organization membership",()=>{
    expect(next({creatorMemberships:1}).key).toBe("reviewer-membership");
    expect(next({creatorMemberships:1,reviewerMemberships:1}).key).toBe("evidence");
    expect(next({creatorMemberships:1,reviewerMemberships:1,
      currentEvidenceRecords:3}).key).toBe("creator-appointment");
    expect(next({creatorMemberships:1,reviewerMemberships:1,
      currentEvidenceRecords:3,creatorAppointedCourses:1}).key).toBe("reviewer-appointment");
  });
  it("requires separately published Courses, release policies, assets and manifests",()=>{
    const readyForPublication={creatorMemberships:1,reviewerMemberships:1,
      currentEvidenceRecords:3,creatorAppointedCourses:1,reviewerAppointedCourses:1};
    expect(next(readyForPublication).key).toBe("course-publication");
    expect(next({...readyForPublication,publishedCourses:1}).key).toBe("policy");
    expect(next({...readyForPublication,publishedCourses:1,releasePolicies:1}).key).toBe("assets");
    expect(next({...readyForPublication,publishedCourses:1,releasePolicies:1,
      releaseAssets:2}).key).toBe("asset-approval");
    expect(next({...readyForPublication,publishedCourses:1,releasePolicies:1,
      releaseAssets:2,manifestStatus:"approved"}).key).toBe("offering-publication");
  });
  it("does not convert a published Offering and adoption into Class readiness",()=>{
    const state=next({creatorMemberships:1,reviewerMemberships:1,
      currentEvidenceRecords:3,creatorAppointedCourses:1,reviewerAppointedCourses:1,
      publishedCourses:1,releasePolicies:1,releaseAssets:2,
      manifestStatus:"approved",lifecycle:"published",approvedAdoptions:1});
    expect(state.key).toBe("class-verification");
    expect(state.detail).toContain("separate live checks");
  });
});

describe("noncredit pilot readiness",()=>{
  it("shows simultaneous content, assessment, policy and release blockers",()=>{
    const blockers=projectNoncreditPilotBlockers({...baseline,pilotLessonCount:7,pilotPlaceholderCount:7,pilotContentReviewCount:7,pilotAssessmentPendingCount:7,noncreditTrainingStatus:"draft",noncreditAssessmentStatus:"draft",noncreditTrainingApproved:false});
    expect(blockers).toContain("Replace placeholder instructional media");
    expect(blockers).toContain("Publish effective completion policy");
    expect(blockers).toContain("Authorize and publish registration listing");
    expect(blockers).toContain("Publish independently approved training version");
  });
  it("distinguishes a recorded listing from an open window",()=>{
    const ready={...baseline,pilotLessonCount:4,noncreditTrainingStatus:"published",noncreditTrainingApproved:true,noncreditAssessmentStatus:"published",completionPolicies:1,approvedAdoptions:1,registrationListings:1,openRegistrationListings:0};
    expect(projectNoncreditPilotBlockers(ready)).toEqual(["Verify currently open registration window"]);
    expect(projectNoncreditPilotBlockers({...ready,openRegistrationListings:1})).toEqual([]);
  });
});
